import { useEffect, useState } from 'react'
import { Wallet, CreditCard, PieChart, TrendingUp, Activity } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'

const PLAN_PRICES: Record<string, number> = { starter: 397, pro: 797, clinic: 1497 }
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

type FinanceTab = 'geral' | 'historico'

interface Sale {
  id: string
  org_id: string
  org_name: string
  plan: string
  amount: number
  paid_at: string
  created_at: string
}

export default function AdminBilling() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [tab, setTab] = useState<FinanceTab>('geral')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: orgsData }, { data: salesData }] = await Promise.all([
        supabase.from('organizations').select('*'),
        supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(200),
      ])
      setOrgs(orgsData ?? [])
      setSales((salesData ?? []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        org_id: s.org_id as string,
        org_name: (s.org_name as string) || '',
        plan: (s.plan as string) || '',
        amount: Number(s.amount) || 0,
        paid_at: (s.paid_at as string) || '',
        created_at: s.created_at as string,
      })))
      setLoading(false)
    }
    load()
  }, [])

  const activeOrgs = orgs.filter(o => o.status === 'active')
  const payingCount = activeOrgs.length
  const totalCount = orgs.length

  // MRR from org plans
  const mrr = activeOrgs.reduce((s, o) => s + (PLAN_PRICES[o.plan] ?? 0), 0)
  const arr = mrr * 12

  const starterCount = activeOrgs.filter(o => o.plan === 'starter').length
  const proCount     = activeOrgs.filter(o => o.plan === 'pro').length
  const clinicCount  = activeOrgs.filter(o => o.plan === 'clinic').length

  // Monthly data for chart
  const monthlyData = MONTHS.map((label, idx) => {
    const inMonth = sales.filter(s => {
      const d = new Date(s.paid_at || s.created_at)
      return d.getFullYear() === parseInt(year) && d.getMonth() === idx
    })
    return {
      label,
      mrr: inMonth.reduce((a, s) => a + s.amount, 0),
      users: inMonth.length,
    }
  })

  // Chart geometry
  const W = 760, H = 220
  const PAD = { t: 30, r: 20, b: 40, l: 64 }
  const chartW = W - PAD.l - PAD.r
  const chartH = H - PAD.t - PAD.b
  const xStep = chartW / 11
  const maxMrr   = Math.max(...monthlyData.map(d => d.mrr), 1)
  const maxUsers = Math.max(...monthlyData.map(d => d.users), 1)
  const ptsMrr  = monthlyData.map((d, i) => ({ x: PAD.l + i * xStep, y: PAD.t + chartH - (d.mrr   / maxMrr)   * chartH }))
  const ptsUser = monthlyData.map((d, i) => ({ x: PAD.l + i * xStep, y: PAD.t + chartH - (d.users / maxUsers) * chartH }))

  const bezier = (pts: {x:number;y:number}[]) => pts.map((p, i) => {
    if (i === 0) return `M${p.x},${p.y}`
    const prev = pts[i-1]
    const cx1 = prev.x + (p.x - prev.x) * 0.4
    const cx2 = prev.x + (p.x - prev.x) * 0.6
    return `C${cx1},${prev.y} ${cx2},${p.y} ${p.x},${p.y}`
  }).join(' ')

  const areaPath = (pts: {x:number;y:number}[]) =>
    bezier(pts) + ` L${pts[pts.length-1].x},${PAD.t+chartH} L${pts[0].x},${PAD.t+chartH} Z`

  // Histórico: sales of selected month (default: current month)
  const now = new Date()
  const [histMonth, setHistMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const histSales = sales.filter(s => {
    const d = new Date(s.paid_at || s.created_at)
    const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    return m === histMonth
  })
  const histMrr   = histSales.reduce((a, s) => a + s.amount, 0)
  const histArpu  = histSales.length > 0 ? histMrr / histSales.length : 0

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in pb-12">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-zinc-900 tracking-tight">Faturamento</h1>
          <p className="text-zinc-400 text-sm font-medium mt-0.5">Gestão financeira e métricas de receita.</p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-2xl p-1.5">
          <button
            onClick={() => setTab('geral')}
            className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${tab === 'geral' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
          >
            Geral
          </button>
          <button
            onClick={() => setTab('historico')}
            className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${tab === 'historico' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
          >
            Histórico
          </button>
        </div>
      </div>

      {/* ── GERAL ──────────────────────────────────────────────────────── */}
      {tab === 'geral' && (
        <div className="space-y-8">
          {/* Seletor de ano */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Ano:</span>
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
              <button
                key={y}
                onClick={() => setYear(String(y))}
                className={`px-4 py-1.5 rounded-xl text-sm font-black transition-all border ${
                  year === String(y)
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-700'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {/* 3 KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* MRR — dark */}
            <div className="bg-black text-white p-8 rounded-[2.5rem] border border-zinc-800 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-800/30 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800">
                    <Wallet className="w-6 h-6 text-green-400" />
                  </div>
                  <span className="text-green-400 bg-green-400/10 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-400/20">MRR</span>
                </div>
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Receita Recorrente Mensal</p>
                <h3 className="text-5xl font-black text-white tracking-tighter mb-2">
                  R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h3>
                <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold mt-4">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">Projeção {year}:</span>
                  R$ {arr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Assinantes Ativos */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 w-fit mb-6">
                  <CreditCard className="w-6 h-6 text-zinc-900" />
                </div>
                <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-1">Assinantes Ativos</p>
                <h3 className="text-5xl font-black text-zinc-900 tracking-tighter">{payingCount}</h3>
              </div>
              <div>
                <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden mt-6">
                  <div
                    className="bg-zinc-900 h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, (payingCount / (totalCount || 1)) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] font-bold text-zinc-400 mt-2 text-right">
                  {((payingCount / (totalCount || 1)) * 100).toFixed(1)}% da base
                </p>
              </div>
            </div>

            {/* Distribuição de Receita */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 w-fit mb-6">
                  <PieChart className="w-6 h-6 text-zinc-900" />
                </div>
                <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-3">Distribuição de Receita</p>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Starter',  count: starterCount, color: 'bg-zinc-900' },
                  { label: 'Pro',      count: proCount,     color: 'bg-green-600' },
                  { label: 'Clinic',   count: clinicCount,  color: 'bg-purple-600' },
                ].map(p => (
                  <div key={p.label} className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${p.color} shrink-0`} />
                    <span className="text-xs font-bold text-zinc-600 flex-1">{p.label}</span>
                    <span className="text-sm font-black text-zinc-900">{p.count}</span>
                    <div className="w-20 bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`${p.color} h-full rounded-full`}
                        style={{ width: `${(p.count / (payingCount || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gráfico crescimento */}
          <div className="bg-[#0c0c0c] rounded-[2rem] p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-black text-white">Crescimento {year}</h3>
                <p className="text-zinc-500 text-xs font-medium mt-0.5">MRR e novos clientes mês a mês</p>
              </div>
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="text-xs font-bold text-zinc-400">MRR (R$)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-sky-400" />
                  <span className="text-xs font-bold text-zinc-400">Clientes</span>
                </div>
              </div>
            </div>

            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 240 }}>
              <defs>
                <linearGradient id="gradMrrAC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4ade80" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="gradUsersAC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                </linearGradient>
                <filter id="glowAC">
                  <feGaussianBlur stdDeviation="3" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>

              {/* Grid */}
              {[0,1,2,3,4].map(i => {
                const y = PAD.t + (chartH / 4) * i
                const val = maxMrr - (maxMrr / 4) * i
                return (
                  <g key={i}>
                    <line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke="#27272a" strokeWidth="1" strokeDasharray="4 4"/>
                    <text x={PAD.l-8} y={y+4} textAnchor="end" fill="#52525b" fontSize="10" fontWeight="700">
                      {val >= 1000 ? `R$${(val/1000).toFixed(0)}k` : `R$${val.toFixed(0)}`}
                    </text>
                  </g>
                )
              })}

              {/* Meses */}
              {monthlyData.map((d, i) => (
                <text key={i} x={ptsMrr[i].x} y={H-8} textAnchor="middle" fill="#52525b" fontSize="10" fontWeight="700">
                  {d.label}
                </text>
              ))}

              {/* Área MRR */}
              <path d={areaPath(ptsMrr)} fill="url(#gradMrrAC)" />
              {/* Linha MRR */}
              <path d={bezier(ptsMrr)} fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" />
              {/* Área Users */}
              <path d={areaPath(ptsUser)} fill="url(#gradUsersAC)" />
              {/* Linha Users */}
              <path d={bezier(ptsUser)} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 3" />

              {/* Pontos MRR com label */}
              {ptsMrr.map((p, i) => monthlyData[i].mrr > 0 && (
                <g key={i} filter="url(#glowAC)">
                  <circle cx={p.x} cy={p.y} r="5" fill="#4ade80" />
                  <text x={p.x} y={p.y-10} textAnchor="middle" fill="#4ade80" fontSize="9" fontWeight="800">
                    {monthlyData[i].mrr >= 1000 ? `R$${(monthlyData[i].mrr/1000).toFixed(1)}k` : `R$${monthlyData[i].mrr}`}
                  </text>
                </g>
              ))}

              {/* Pontos Users */}
              {ptsUser.map((p, i) => monthlyData[i].users > 0 && (
                <circle key={i} cx={p.x} cy={p.y} r="4" fill="#38bdf8" />
              ))}
            </svg>
          </div>
        </div>
      )}

      {/* ── HISTÓRICO ──────────────────────────────────────────────────── */}
      {tab === 'historico' && (
        <div className="space-y-8">
          {/* Seletor de mês */}
          <div className="flex items-center gap-4 bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
            <span className="text-sm font-bold text-zinc-600">Período:</span>
            <input
              type="month"
              value={histMonth}
              onChange={e => setHistMonth(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-zinc-200 text-sm font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <span className="ml-auto text-sm font-bold text-zinc-900 capitalize">
              {new Date(histMonth + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
          </div>

          {/* KPIs do período */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-black text-white p-8 rounded-[2.5rem] border border-zinc-800 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-800/30 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
              <div className="relative z-10">
                <div className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800 w-fit mb-6">
                  <Wallet className="w-6 h-6 text-green-400" />
                </div>
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Receita do Período</p>
                <h3 className="text-5xl font-black text-white tracking-tighter">
                  R$ {histMrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h3>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-200 shadow-sm">
              <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 w-fit mb-6">
                <CreditCard className="w-6 h-6 text-zinc-900" />
              </div>
              <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-1">Vendas no Período</p>
              <h3 className="text-5xl font-black text-zinc-900 tracking-tighter">{histSales.length}</h3>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-200 shadow-sm">
              <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 w-fit mb-6">
                <Activity className="w-6 h-6 text-zinc-900" />
              </div>
              <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-1">Ticket Médio</p>
              <h3 className="text-5xl font-black text-zinc-900 tracking-tighter">
                R$ {histArpu.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </h3>
            </div>
          </div>

          {/* Distribuição + lista de vendas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribuição por plano */}
            <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm p-8">
              <h3 className="text-base font-black text-zinc-900 mb-6 flex items-center gap-2">
                <PieChart className="w-5 h-5" /> Distribuição de Receita
              </h3>
              <div className="space-y-6">
                {[
                  { label: 'Starter', price: 'R$ 397,00/mês', count: histSales.filter(s => s.plan === 'starter').length, color: 'bg-zinc-900' },
                  { label: 'Pro',     price: 'R$ 797,00/mês', count: histSales.filter(s => s.plan === 'pro').length,     color: 'bg-green-600' },
                  { label: 'Clinic',  price: 'R$ 1.497,00/mês', count: histSales.filter(s => s.plan === 'clinic').length, color: 'bg-purple-600' },
                ].map(p => (
                  <div key={p.label}>
                    <div className="flex justify-between items-end mb-2">
                      <div>
                        <span className="text-sm font-bold text-zinc-900 block">{p.label}</span>
                        <span className="text-xs text-zinc-500">{p.price}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-black text-zinc-900">{p.count}</span>
                        <span className="text-xs text-zinc-400 ml-1">clientes</span>
                      </div>
                    </div>
                    <div className="w-full bg-zinc-100 h-3 rounded-full overflow-hidden">
                      <div
                        className={`${p.color} h-full rounded-full transition-all duration-700`}
                        style={{ width: `${(p.count / (histSales.length || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lista de vendas */}
            <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm p-8 flex flex-col">
              <h3 className="text-base font-black text-zinc-900 mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5" /> Vendas do Período
              </h3>
              <div className="overflow-auto space-y-3 max-h-72 flex-1">
                {histSales.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                    <p className="text-xs font-bold uppercase">Nenhuma venda registrada</p>
                  </div>
                ) : histSales.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-4 rounded-xl border border-zinc-100 bg-zinc-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-zinc-600 font-black text-sm">
                        {(s.org_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{s.org_name || '—'}</p>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase">{s.plan}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-emerald-600">
                        + R$ {s.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {new Date(s.paid_at || s.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
