import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, MessageSquare, TrendingUp, DollarSign, ArrowRight, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'
import { planLabel, statusLabel, formatDateShort } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'

interface Stats {
  total_orgs: number
  active_orgs: number
  total_conversations: number
  mrr: number
}

const planColors: Record<string, 'default' | 'secondary' | 'success'> = {
  starter: 'secondary',
  pro: 'default',
  clinic: 'success',
}

const statusColors: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  active: 'success',
  trial: 'warning',
  inactive: 'secondary',
  suspended: 'destructive',
}

export default function AdminDashboard() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [stats, setStats] = useState<Stats>({ total_orgs: 0, active_orgs: 0, total_conversations: 0, mrr: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false })

      if (data) {
        setOrgs(data)
        const planMrr: Record<string, number> = { starter: 397, pro: 797, clinic: 1497 }
        setStats({
          total_orgs: data.length,
          active_orgs: data.filter(o => o.status === 'active').length,
          total_conversations: data.reduce((s, o) => s + (o.conversations_used ?? 0), 0),
          mrr: data.filter(o => o.status === 'active').reduce((s, o) => s + (planMrr[o.plan] ?? 0), 0),
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  const statCards = [
    { label: 'Total de Clientes', value: stats.total_orgs, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Clientes Ativos', value: stats.active_orgs, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Conversas (mês)', value: stats.total_conversations.toLocaleString('pt-BR'), icon: MessageSquare, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'MRR', value: `R$${stats.mrr.toLocaleString('pt-BR')}`, icon: DollarSign, color: 'text-orange-600', bg: 'bg-orange-50' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Visão geral de todos os clientes</p>
        </div>
        <Link to="/admin/clients/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Cliente
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${color}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{label}</p>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Clients table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Clientes Recentes</CardTitle>
          <Link to="/admin/clients">
            <Button variant="ghost" size="sm" className="gap-1 text-primary">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : orgs.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum cliente cadastrado ainda.</p>
              <Link to="/admin/clients/new">
                <Button className="mt-4 gap-2" size="sm">
                  <Plus className="w-4 h-4" /> Adicionar primeiro cliente
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Cliente</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Plano</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Conversas</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Desde</th>
                    <th className="py-3 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {orgs.slice(0, 8).map(org => (
                    <tr key={org.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-2">
                        <p className="font-medium text-gray-900">{org.name}</p>
                        <p className="text-xs text-gray-400">{org.slug}</p>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={planColors[org.plan] ?? 'outline'}>{planLabel(org.plan)}</Badge>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={statusColors[org.status] ?? 'outline'}>{statusLabel(org.status)}</Badge>
                      </td>
                      <td className="py-3 px-2 text-gray-600">
                        {org.conversations_used ?? 0}/{org.max_conversations_month}
                      </td>
                      <td className="py-3 px-2 text-gray-500">{formatDateShort(org.created_at)}</td>
                      <td className="py-3 px-2">
                        <Link to={`/admin/clients/${org.id}`}>
                          <Button variant="ghost" size="sm">Ver</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
