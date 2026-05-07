import { useEffect, useState } from 'react'
import { MessageSquare, Calendar, UserCheck, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Appointment, type Organization } from '../../types'
import { formatDate, statusLabel } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'

const statusColors: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  scheduled: 'secondary', confirmed: 'success', cancelled: 'destructive', completed: 'outline',
}

export default function ClientDashboard() {
  const { orgId } = useAuth()
  const [org, setOrg] = useState<Organization | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [stats, setStats] = useState({ conversations: 0, appointments: 0, escalations: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const [{ data: orgData }, { data: apptData }, { data: convData }] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', orgId!).single(),
        supabase.from('appointments').select('*').eq('org_id', orgId!).order('scheduled_at', { ascending: false }).limit(10),
        supabase.from('conversations').select('id, escalated_to_human').eq('org_id', orgId!),
      ])
      if (orgData) setOrg(orgData)
      if (apptData) setAppointments(apptData)
      if (convData) {
        setStats({
          conversations: convData.length,
          appointments: apptData?.length ?? 0,
          escalations: convData.filter(c => c.escalated_to_human).length,
        })
      }
      setLoading(false)
    }
    load()
  }, [orgId])

  const statCards = [
    { label: 'Conversas (mês)', value: stats.conversations, icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Agendamentos', value: stats.appointments, icon: Calendar, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Escalonados', value: stats.escalations, icon: UserCheck, color: 'text-orange-600', bg: 'bg-orange-50' },
    {
      label: 'Uso do Plano',
      value: org ? `${org.conversations_used}/${org.max_conversations_month}` : '—',
      icon: TrendingUp,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ]

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {org?.name} 👋</h1>
        <p className="text-sm text-gray-500">Aqui está o resumo da sua clínica hoje.</p>
      </div>

      {/* Usage bar */}
      {org && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Conversas este mês</span>
            <span className="text-sm text-gray-500">{org.conversations_used} de {org.max_conversations_month}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, (org.conversations_used / org.max_conversations_month) * 100)}%` }}
            />
          </div>
        </div>
      )}

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

      {/* Próximos agendamentos */}
      <Card>
        <CardHeader><CardTitle>Próximos Agendamentos</CardTitle></CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Nenhum agendamento ainda.</p>
          ) : (
            <div className="space-y-3">
              {appointments.slice(0, 5).map(appt => (
                <div key={appt.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{appt.patient_name}</p>
                    <p className="text-xs text-gray-500">{appt.specialty}{appt.doctor_name ? ` · ${appt.doctor_name}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-gray-600">{formatDate(appt.scheduled_at)}</p>
                    <Badge variant={statusColors[appt.status] ?? 'outline'}>
                      {statusLabel(appt.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
