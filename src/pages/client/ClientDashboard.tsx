import { useEffect, useState, useMemo } from 'react'
import { MessageSquare, Calendar, CheckCircle, XCircle, Bot, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Appointment, type Conversation, type Organization } from '../../types'
import { formatDate, statusLabel } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { cn } from '../../lib/utils'

type Period = 'day' | 'week' | 'month'

const statusColors: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  scheduled: 'secondary', confirmed: 'success', cancelled: 'destructive', completed: 'outline',
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
]

function getPeriodStart(period: Period): Date {
  const now = new Date()
  if (period === 'day') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - 6)
    d.setHours(0, 0, 0, 0)
    return d
  }
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export default function ClientDashboard() {
  const { orgId } = useAuth()
  const [org, setOrg] = useState<Organization | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const monthAgo = new Date()
      monthAgo.setDate(monthAgo.getDate() - 30)

      const [{ data: orgData }, { data: apptData }, { data: convData }] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', orgId!).single(),
        supabase
          .from('appointments')
          .select('*')
          .eq('org_id', orgId!)
          .gte('scheduled_at', monthAgo.toISOString())
          .order('scheduled_at', { ascending: false }),
        supabase
          .from('conversations')
          .select('*')
          .eq('org_id', orgId!)
          .gte('started_at', monthAgo.toISOString()),
      ])

      if (orgData) setOrg(orgData)
      if (apptData) setAppointments(apptData)
      if (convData) setConversations(convData)
      setLoading(false)
    }
    load()
  }, [orgId])

  const filtered = useMemo(() => {
    const start = getPeriodStart(period)
    const appts = appointments.filter(a => new Date(a.scheduled_at) >= start)
    const convs = conversations.filter(c => new Date(c.started_at) >= start)
    return {
      conversations: convs.length,
      appointments: appts.length,
      completed: appts.filter(a => a.status === 'completed').length,
      cancelled: appts.filter(a => a.status === 'cancelled').length,
      recentAppts: appts.slice(0, 5),
    }
  }, [appointments, conversations, period])

  const statCards = [
    {
      label: 'Conversas',
      value: filtered.conversations,
      icon: MessageSquare,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Agendamentos',
      value: filtered.appointments,
      icon: Calendar,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Consultas Realizadas',
      value: filtered.completed,
      icon: CheckCircle,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Cancelamentos',
      value: filtered.cancelled,
      icon: XCircle,
      color: 'text-red-500',
      bg: 'bg-red-50',
    },
  ]

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Olá, {org?.name} 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5">Aqui está o resumo da sua clínica.</p>
        </div>

        {org?.chatwoot_url && (
          <a
            href={org.chatwoot_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Bot className="w-4 h-4" />
            Ver Agente em Ação
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </a>
        )}
      </div>

      {/* Usage bar + period filter */}
      {org && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Conversas este mês</span>
            <span className="text-sm text-gray-500">
              {org.conversations_used} de {org.max_conversations_month}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, (org.conversations_used / org.max_conversations_month) * 100)}%` }}
            />
          </div>

          {/* Period filter */}
          <div className="flex items-center gap-1 mt-4">
            <span className="text-xs text-gray-400 mr-1">Exibindo:</span>
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  period === key
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-gray-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 leading-tight">{label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Agendamentos do período */}
      <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Agendamentos —{' '}
            <span className="text-gray-400 font-normal text-sm">
              {period === 'day' ? 'hoje' : period === 'week' ? 'últimos 7 dias' : 'este mês'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.recentAppts.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">
              Nenhum agendamento neste período.
            </p>
          ) : (
            <div className="space-y-0 divide-y divide-gray-50">
              {filtered.recentAppts.map(appt => (
                <div key={appt.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{appt.patient_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {appt.specialty}
                      {appt.doctor_name ? ` · ${appt.doctor_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-sm text-gray-500 hidden sm:block">{formatDate(appt.scheduled_at)}</p>
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
