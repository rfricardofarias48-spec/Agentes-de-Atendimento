import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ArrowRight, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'
import { planLabel, statusLabel, formatDateShort } from '../../lib/utils'

const planColors: Record<string, string> = {
  starter: 'bg-zinc-100 text-zinc-600',
  pro: 'bg-blue-100 text-blue-700',
  clinic: 'bg-green-100 text-green-700',
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trial: 'bg-yellow-100 text-yellow-700',
  inactive: 'bg-zinc-100 text-zinc-500',
  suspended: 'bg-red-100 text-red-600',
}

const PLAN_MRR: Record<string, number> = { starter: 397, pro: 797, clinic: 1497 }

export default function AdminDashboard() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('organizations').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setOrgs(data ?? []); setLoading(false) })
  }, [])

  const activeOrgs = orgs.filter(o => o.status === 'active')
  const mrr = activeOrgs.reduce((s, o) => s + (PLAN_MRR[o.plan] ?? 0), 0)
  const totalConvs = orgs.reduce((s, o) => s + (o.conversations_used ?? 0), 0)
  const starterCount = orgs.filter(o => o.plan === 'starter').length
  const proCount = orgs.filter(o => o.plan === 'pro').length
  const clinicCount = orgs.filter(o => o.plan === 'clinic').length

  return (
    <div className="space-y-8 animate-fade-in pb-8">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black text-zinc-900 tracking-tight">Visão Geral</h1>
          <p className="text-zinc-400 text-sm mt-0.5 font-medium capitalize">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Link to="/admin/clients/new">
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 transition-colors">
            <Plus className="w-4 h-4" />
            Novo Cliente
          </button>
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MRR — destaque dark */}
        <div className="col-span-2 lg:col-span-1 relative overflow-hidden rounded-[1.75rem] bg-zinc-950 p-6 shadow-xl">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #4ade80 0%, transparent 70%)' }} />
          <div className="relative">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">MRR Estimado</p>
            <p className="text-3xl font-black text-white leading-none">
              R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-bold uppercase">ARR</span>
              <span className="text-sm font-black text-green-400">R$ {(mrr * 12 / 1000).toFixed(1)}k</span>
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] bg-white border border-zinc-100 p-6 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Clientes Ativos</p>
          <div className="mt-2">
            <p className="text-4xl font-black text-zinc-900">{activeOrgs.length}</p>
            <p className="text-[11px] text-zinc-400 font-bold mt-1">{orgs.length} total</p>
          </div>
        </div>

        <div className="rounded-[1.75rem] bg-white border border-zinc-100 p-6 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Conversas / Mês</p>
          <div className="mt-2">
            <p className="text-4xl font-black text-zinc-900">{totalConvs.toLocaleString('pt-BR')}</p>
            <p className="text-[11px] text-zinc-400 font-bold mt-1">todas as clínicas</p>
          </div>
        </div>

        <div className="rounded-[1.75rem] bg-white border border-zinc-100 p-6 shadow-sm flex flex-col justify-between">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Distribuição</p>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-zinc-500">Starter</span><span className="text-zinc-900">{starterCount}</span>
            </div>
            <div className="flex justify-between text-xs font-bold">
              <span className="text-blue-500">Pro</span><span className="text-zinc-900">{proCount}</span>
            </div>
            <div className="flex justify-between text-xs font-bold">
              <span className="text-green-500">Clinic</span><span className="text-zinc-900">{clinicCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de clientes */}
      <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm overflow-hidden">
        <div className="px-7 pt-6 pb-4 flex items-center justify-between border-b border-zinc-50">
          <div>
            <p className="font-black text-zinc-900 text-lg">Clientes Recentes</p>
            <p className="text-xs text-zinc-400 font-medium mt-0.5">{orgs.length} clínicas cadastradas</p>
          </div>
          <Link to="/admin/clients">
            <button className="flex items-center gap-1.5 text-xs font-bold text-green-600 hover:text-green-700 transition-colors">
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-3 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-14 text-zinc-400">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">Nenhum cliente ainda</p>
            <Link to="/admin/clients/new">
              <button className="mt-4 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 transition-colors">
                Adicionar primeiro cliente
              </button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-50">
                  <th className="text-left py-3 px-6 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Clínica</th>
                  <th className="text-left py-3 px-4 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Plano</th>
                  <th className="text-left py-3 px-4 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Conversas</th>
                  <th className="text-left py-3 px-4 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Cadastro</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {orgs.slice(0, 8).map(org => (
                  <tr key={org.id} className="border-b border-zinc-50 hover:bg-zinc-50/70 transition-colors">
                    <td className="py-3.5 px-6">
                      <p className="font-bold text-zinc-900">{org.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{org.evolution_instance || org.slug}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase ${planColors[org.plan] ?? 'bg-zinc-100 text-zinc-500'}`}>
                        {planLabel(org.plan)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black ${statusColors[org.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                        {statusLabel(org.status)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-600 font-medium">
                      {org.conversations_used ?? 0}/{org.max_conversations_month}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 font-medium">{formatDateShort(org.created_at)}</td>
                    <td className="py-3.5 px-4">
                      <Link to={`/admin/clients/${org.id}`}>
                        <button className="text-xs font-bold text-zinc-500 hover:text-zinc-900 transition-colors">
                          Detalhes →
                        </button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
