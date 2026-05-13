import { useEffect, useState } from 'react'
import { Wallet, CreditCard, PieChart, TrendingUp, Activity } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'
import { TZ, toBRT } from '../../lib/date'

const PLAN_PRICES: Record<string, number> = { starter: 299.90, pro: 449.90, clinic: 849.90 }
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

const CARD: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e4e7ec',
  borderRadius: '1.5rem',
  boxShadow: '0 1px 3px rgba(16,24,40,0.06)',
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

  const mrr = activeOrgs.reduce((s, o) => s + (PLAN_PRICES[o.plan] ?? 0), 0)
  const arr = mrr * 12

  const starterCount = activeOrgs.filter(o => o.plan === 'starter').length
  const proCount     = activeOrgs.filter(o => o.plan === 'pro').length
  const clinicCount  = activeOrgs.filter(o => o.plan === 'clinic').length

  const monthlyData = MONTHS.map((label, idx) => {
    const inMonth = sales.filter(s => {
      const d = toBRT(new Date(s.paid_at || s.created_at))
      return d.getFullYear() === parseInt(year) && d.getMonth() === idx
    })
    return {
      label,
      mrr: inMonth.reduce((a, s) => a + s.amount, 0),
      users: inMonth.length,
    }
  })

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

  const now = toBRT(new Date())
  const [histMonth, setHistMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const histSales = sales.filter(s => {
    const d = toBRT(new Date(s.paid_at || s.created_at))
    const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    return m === histMonth
  })
  const histMrr   = histSales.reduce((a, s) => a + s.amount, 0)
  const histArpu  = histSales.length > 0 ? histMrr / histSales.length : 0

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in pb-12">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#101828' }}>Faturamento</h1>
          <p className="text-sm mt-1" style={{ color: '#98a2b3' }}>Gestão financeira e métricas de receita.</p>
        </div>
        <div
          className="flex items-center gap-1 p-1 rounded-2xl"
          style={{ background: '#f0f2f5', border: '1px solid #e4e7ec' }}
        >
          <button
            onClick={() => setTab('geral')}
            className="px-6 py-2 rounded-xl text-sm font-semibold transition-all"
            style={tab === 'geral' ? {
              background: '#ffffff',
              color: '#344054',
              boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
            } : {
              color: '#98a2b3',
            }}
          >
            Geral
          </button>
          <button
            onClick={() => setTab('historico')}
            className="px-6 py-2 rounded-xl text-sm font-semibold transition-all"
            style={tab === 'historico' ? {
              background: '#ffffff',
              color: '#344054',
              boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
            } : {
              color: '#98a2b3',
            }}
          >
            Histórico
          </button>
        </div>
      </div>

      {/* ── GERAL ──────────────────────────────────────────────────────── */}
      {tab === 'geral' && (
        <div className="space-y-6">
          {/* Seletor de ano */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#98a2b3' }}>Ano:</span>
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
              <button
                key={y}
                onClick={() => setYear(String(y))}
                className="px-4 py-1.5 rounded-xl text-sm font-semibold transition-all"
                style={year === String(y) ? {
                  background: '#2C82B5',
                  color: '#ffffff',
                  border: '1px solid #2570a0',
                  boxShadow: '0 1px 4px rgba(44,130,181,0.3)',
                } : {
                  border: '1px solid #e4e7ec',
                  color: '#667085',
                }}
              >
                {y}
              </button>
            ))}
          </div>

          {/* 3 KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* MRR */}
            <div
              className="relative overflow-hidden rounded-2xl p-7"
              style={{
                background: 'linear-gradient(135deg,#164a6a 0%,#1e5f88 100%)',
                border: '1px solid #2570a0',
                boxShadow: '0 4px 16px rgba(44,130,181,0.25)',
              }}
            >
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none opacity-20"
                style={{ background: 'radial-gradient(circle,#ffffff 0%,transparent 70%)' }} />
              <div className="relative">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                    <Wallet className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-brand-200 uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>MRR</span>
                </div>
                <p className="text-[10px] font-semibold text-brand-200 uppercase tracking-widest mb-1">Receita Recorrente Mensal</p>
                <h3 className="text-4xl font-bold text-white tracking-tight">
                  R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h3>
                <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                  <TrendingUp className="w-4 h-4 text-brand-300" />
                  <span className="text-xs text-brand-300 font-semibold">Projeção {year}:</span>
                  <span className="text-sm font-bold text-white ml-auto">R$ {(arr / 1000).toFixed(1)}k</span>
                </div>
              </div>
            </div>

            {/* Assinantes Ativos */}
            <div style={CARD} className="p-7 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: '#f9fafb', border: '1px solid #e4e7ec' }}>
                  <CreditCard className="w-5 h-5" style={{ color: '#667085' }} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#98a2b3' }}>Assinantes Ativos</p>
                <h3 className="text-4xl font-bold tracking-tight" style={{ color: '#101828' }}>{payingCount}</h3>
              </div>
              <div>
                <div className="w-full h-2 rounded-full overflow-hidden mt-5" style={{ background: '#f2f4f7' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, (payingCount / (totalCount || 1)) * 100)}%`, background: '#2C82B5' }}
                  />
                </div>
                <p className="text-[10px] font-semibold mt-2 text-right" style={{ color: '#98a2b3' }}>
                  {((payingCount / (totalCount || 1)) * 100).toFixed(1)}% da base
                </p>
              </div>
            </div>

            {/* Distribuição de Receita */}
            <div style={CARD} className="p-7 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: '#f9fafb', border: '1px solid #e4e7ec' }}>
                  <PieChart className="w-5 h-5" style={{ color: '#667085' }} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-4" style={{ color: '#98a2b3' }}>Distribuição de Receita</p>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Essencial', count: starterCount, color: '#94a3b8' },
                  { label: 'Pro',      count: proCount,     color: '#3b82f6' },
                  { label: 'Max',      count: clinicCount,  color: '#2C82B5' },
                ].map(p => (
                  <div key={p.label} className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="text-xs font-medium flex-1" style={{ color: '#667085' }}>{p.label}</span>
                    <span className="text-sm font-bold" style={{ color: '#344054' }}>{p.count}</span>
                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: '#f2f4f7' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(p.count / (payingCount || 1)) * 100}%`, background: p.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gráfico crescimento */}
          <div style={CARD} className="p-7">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-semibold" style={{ color: '#101828' }}>Crescimento {year}</h3>
                <p className="text-xs mt-0.5" style={{ color: '#98a2b3' }}>MRR e novos clientes mês a mês</p>
              </div>
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-brand-500" />
                  <span className="text-xs font-medium" style={{ color: '#667085' }}>MRR (R$)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-sky-400" />
                  <span className="text-xs font-medium" style={{ color: '#667085' }}>Clientes</span>
                </div>
              </div>
            </div>

            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 240 }}>
              <defs>
                <linearGradient id="gradMrrAC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2C82B5" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#2C82B5" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="gradUsersAC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Grid */}
              {[0,1,2,3,4].map(i => {
                const y = PAD.t + (chartH / 4) * i
                const val = maxMrr - (maxMrr / 4) * i
                return (
                  <g key={i}>
                    <line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke="#f2f4f7" strokeWidth="1" />
                    <text x={PAD.l-8} y={y+4} textAnchor="end" fill="#d0d5dd" fontSize="10" fontWeight="600">
                      {val >= 1000 ? `R$${(val/1000).toFixed(0)}k` : `R$${val.toFixed(0)}`}
                    </text>
                  </g>
                )
              })}

              {/* Meses */}
              {monthlyData.map((d, i) => (
                <text key={i} x={ptsMrr[i].x} y={H-8} textAnchor="middle" fill="#d0d5dd" fontSize="10" fontWeight="600">
                  {d.label}
                </text>
              ))}

              <path d={areaPath(ptsMrr)} fill="url(#gradMrrAC)" />
              <path d={bezier(ptsMrr)} fill="none" stroke="#2C82B5" strokeWidth="2.5" strokeLinecap="round" />
              <path d={areaPath(ptsUser)} fill="url(#gradUsersAC)" />
              <path d={bezier(ptsUser)} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 3" />

              {ptsMrr.map((p, i) => monthlyData[i].mrr > 0 && (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="4" fill="#ffffff" stroke="#2C82B5" strokeWidth="2" />
                  <text x={p.x} y={p.y-10} textAnchor="middle" fill="#2C82B5" fontSize="9" fontWeight="700">
                    {monthlyData[i].mrr >= 1000 ? `R$${(monthlyData[i].mrr/1000).toFixed(1)}k` : `R$${monthlyData[i].mrr}`}
                  </text>
                </g>
              ))}

              {ptsUser.map((p, i) => monthlyData[i].users > 0 && (
                <circle key={i} cx={p.x} cy={p.y} r="4" fill="#ffffff" stroke="#38bdf8" strokeWidth="2" />
              ))}
            </svg>
          </div>
        </div>
      )}

      {/* ── HISTÓRICO ──────────────────────────────────────────────────── */}
      {tab === 'historico' && (
        <div className="space-y-6">
          {/* Seletor de mês */}
          <div
            className="flex items-center gap-4 rounded-2xl p-4"
            style={{ background: '#ffffff', border: '1px solid #e4e7ec', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}
          >
            <span className="text-sm font-medium" style={{ color: '#667085' }}>Período:</span>
            <input
              type="month"
              value={histMonth}
              onChange={e => setHistMonth(e.target.value)}
              className="input-dark px-3 py-1.5 text-sm"
            />
            <span className="ml-auto text-sm font-semibold capitalize" style={{ color: '#344054' }}>
              {new Date(histMonth + '-02').toLocaleDateString('pt-BR', { timeZone: TZ, month: 'long', year: 'numeric' })}
            </span>
          </div>

          {/* KPIs do período */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div
              className="relative overflow-hidden rounded-2xl p-7"
              style={{
                background: 'linear-gradient(135deg,#164a6a 0%,#1e5f88 100%)',
                border: '1px solid #2570a0',
                boxShadow: '0 4px 16px rgba(44,130,181,0.25)',
              }}
            >
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none opacity-20"
                style={{ background: 'radial-gradient(circle,#ffffff 0%,transparent 70%)' }} />
              <div className="relative">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: 'rgba(255,255,255,0.15)' }}>
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <p className="text-[10px] font-semibold text-brand-200 uppercase tracking-widest mb-1">Receita do Período</p>
                <h3 className="text-4xl font-bold text-white tracking-tight">
                  R$ {histMrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h3>
              </div>
            </div>

            <div style={CARD} className="p-7">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: '#f9fafb', border: '1px solid #e4e7ec' }}>
                <CreditCard className="w-5 h-5" style={{ color: '#667085' }} />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#98a2b3' }}>Vendas no Período</p>
              <h3 className="text-4xl font-bold tracking-tight" style={{ color: '#101828' }}>{histSales.length}</h3>
            </div>

            <div style={CARD} className="p-7">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: '#f9fafb', border: '1px solid #e4e7ec' }}>
                <Activity className="w-5 h-5" style={{ color: '#667085' }} />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#98a2b3' }}>Ticket Médio</p>
              <h3 className="text-4xl font-bold tracking-tight" style={{ color: '#101828' }}>
                R$ {histArpu.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </h3>
            </div>
          </div>

          {/* Distribuição + lista de vendas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Distribuição por plano */}
            <div style={CARD} className="p-7">
              <h3 className="text-base font-semibold mb-6 flex items-center gap-2" style={{ color: '#101828' }}>
                <PieChart className="w-5 h-5 text-slate-400" /> Distribuição de Receita
              </h3>
              <div className="space-y-5">
                {[
                  { label: 'Essencial', price: 'R$ 299,90/mês', count: histSales.filter(s => s.plan === 'starter').length, color: '#94a3b8' },
                  { label: 'Pro',       price: 'R$ 449,90/mês', count: histSales.filter(s => s.plan === 'pro').length,     color: '#3b82f6' },
                  { label: 'Max',       price: 'R$ 849,90/mês', count: histSales.filter(s => s.plan === 'clinic').length,  color: '#2C82B5' },
                ].map(p => (
                  <div key={p.label}>
                    <div className="flex justify-between items-end mb-2">
                      <div>
                        <span className="text-sm font-semibold block" style={{ color: '#344054' }}>{p.label}</span>
                        <span className="text-xs" style={{ color: '#98a2b3' }}>{p.price}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold" style={{ color: '#101828' }}>{p.count}</span>
                        <span className="text-xs ml-1" style={{ color: '#98a2b3' }}>clientes</span>
                      </div>
                    </div>
                    <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: '#f2f4f7' }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${(p.count / (histSales.length || 1)) * 100}%`, background: p.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lista de vendas */}
            <div style={CARD} className="p-7 flex flex-col">
              <h3 className="text-base font-semibold mb-6 flex items-center gap-2" style={{ color: '#101828' }}>
                <Activity className="w-5 h-5 text-slate-400" /> Vendas do Período
              </h3>
              <div className="overflow-auto space-y-2.5 max-h-72 flex-1">
                {histSales.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10" style={{ color: '#d0d5dd' }}>
                    <p className="text-xs font-semibold uppercase">Nenhuma venda registrada</p>
                  </div>
                ) : histSales.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3.5 rounded-xl"
                    style={{ border: '1px solid #f2f4f7', background: '#f9fafb' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ background: '#e4e7ec', color: '#667085' }}
                      >
                        {(s.org_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: '#344054' }}>{s.org_name || '—'}</p>
                        <p className="text-[10px] font-semibold uppercase" style={{ color: '#98a2b3' }}>{s.plan}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-brand-600">
                        + R$ {s.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px]" style={{ color: '#98a2b3' }}>
                        {new Date(s.paid_at || s.created_at).toLocaleDateString('pt-BR', { timeZone: TZ })}
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
