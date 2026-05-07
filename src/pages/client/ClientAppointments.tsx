import { useEffect, useState } from 'react'
import { Calendar, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Appointment } from '../../types'
import { formatDate, statusLabel } from '../../lib/utils'
import { Card, CardContent, CardHeader } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'

const statusColors: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  scheduled: 'secondary', confirmed: 'success', cancelled: 'destructive', completed: 'outline',
}

export default function ClientAppointments() {
  const { orgId } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [filtered, setFiltered] = useState<Appointment[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    supabase.from('appointments').select('*').eq('org_id', orgId).order('scheduled_at', { ascending: false })
      .then(({ data }) => { setAppointments(data ?? []); setFiltered(data ?? []); setLoading(false) })
  }, [orgId])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(appointments.filter(a =>
      a.patient_name.toLowerCase().includes(q) ||
      a.specialty.toLowerCase().includes(q) ||
      (a.doctor_name ?? '').toLowerCase().includes(q)
    ))
  }, [search, appointments])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Agendamentos</h1>
        <p className="text-sm text-gray-500">{appointments.length} consultas registradas</p>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Buscar paciente, especialidade..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum agendamento encontrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Paciente</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Especialidade</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Médico</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Data/Hora</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(appt => (
                    <tr key={appt.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-2">
                        <p className="font-medium text-gray-900">{appt.patient_name}</p>
                        <p className="text-xs text-gray-400">{appt.patient_phone}</p>
                      </td>
                      <td className="py-3 px-2 text-gray-600">{appt.specialty}</td>
                      <td className="py-3 px-2 text-gray-600">{appt.doctor_name ?? '—'}</td>
                      <td className="py-3 px-2 text-gray-600">{formatDate(appt.scheduled_at)}</td>
                      <td className="py-3 px-2">
                        <Badge variant={statusColors[appt.status] ?? 'outline'}>{statusLabel(appt.status)}</Badge>
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
