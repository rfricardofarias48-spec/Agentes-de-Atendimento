import { useEffect, useState } from 'react'
import { Calendar, Search, Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Appointment } from '../../types'
import { formatDate, statusLabel } from '../../lib/utils'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'

const statusColors: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  scheduled: 'secondary', confirmed: 'success', cancelled: 'destructive', completed: 'outline',
}

const STATUS_OPTIONS = [
  { value: 'scheduled',  label: 'Agendado' },
  { value: 'confirmed',  label: 'Confirmado' },
  { value: 'completed',  label: 'Realizado' },
  { value: 'cancelled',  label: 'Cancelado' },
]

interface FormData {
  patient_name: string
  patient_phone: string
  specialty: string
  doctor_name: string
  date: string
  time: string
  notes: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled'
}

const EMPTY_FORM: FormData = {
  patient_name: '', patient_phone: '', specialty: '',
  doctor_name: '', date: '', time: '', notes: '', status: 'scheduled',
}

export default function ClientAppointments() {
  const { orgId } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [filtered, setFiltered] = useState<Appointment[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function fetchAppointments() {
    if (!orgId) return
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .eq('org_id', orgId)
      .order('scheduled_at', { ascending: false })
    setAppointments(data ?? [])
    setFiltered(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAppointments() }, [orgId])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(appointments.filter(a =>
      a.patient_name.toLowerCase().includes(q) ||
      a.specialty.toLowerCase().includes(q) ||
      (a.doctor_name ?? '').toLowerCase().includes(q)
    ))
  }, [search, appointments])

  function openModal() { setForm(EMPTY_FORM); setError(''); setShowModal(true) }
  function closeModal() { setShowModal(false) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    if (!form.patient_name.trim() || !form.specialty.trim() || !form.date || !form.time) {
      setError('Preencha os campos obrigatórios: nome, especialidade, data e horário.')
      return
    }
    setSaving(true)
    setError('')
    const { error: dbError } = await supabase.from('appointments').insert({
      org_id: orgId,
      patient_name: form.patient_name.trim(),
      patient_phone: form.patient_phone.trim() || '',
      specialty: form.specialty.trim(),
      doctor_name: form.doctor_name.trim() || null,
      scheduled_at: `${form.date}T${form.time}:00`,
      notes: form.notes.trim() || null,
      status: form.status,
    })
    setSaving(false)
    if (dbError) { setError('Erro ao salvar. Tente novamente.'); return }
    closeModal()
    fetchAppointments()
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agendamentos</h1>
          <p className="text-sm text-gray-500">{appointments.length} consultas registradas</p>
        </div>
        <Button onClick={openModal} className="gap-2 bg-gray-900 hover:bg-gray-800 text-white">
          <Plus className="w-4 h-4" />
          Novo Agendamento
        </Button>
      </div>

      {/* Search + table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Buscar paciente, especialidade..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum agendamento encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Paciente</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Especialidade</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium hidden md:table-cell">Médico</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Data/Hora</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(appt => (
                  <tr key={appt.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{appt.patient_name}</p>
                      <p className="text-xs text-gray-400">{appt.patient_phone}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{appt.specialty}</td>
                    <td className="py-3 px-4 text-gray-600 hidden md:table-cell">{appt.doctor_name ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-600">{formatDate(appt.scheduled_at)}</td>
                    <td className="py-3 px-4">
                      <Badge variant={statusColors[appt.status] ?? 'outline'}>{statusLabel(appt.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-gray-900">Novo Agendamento</h2>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Nome do paciente <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="Nome completo"
                    value={form.patient_name}
                    onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))}
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefone</label>
                  <Input
                    placeholder="(00) 00000-0000"
                    value={form.patient_phone}
                    onChange={e => setForm(f => ({ ...f, patient_phone: e.target.value }))}
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Especialidade <span className="text-red-400">*</span>
                  </label>
                  <Input
                    placeholder="Ex: Cardiologia"
                    value={form.specialty}
                    onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Médico responsável</label>
                  <Input
                    placeholder="Nome do médico"
                    value={form.doctor_name}
                    onChange={e => setForm(f => ({ ...f, doctor_name: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Data <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Horário <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="time"
                    value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                  <div className="flex gap-2 flex-wrap">
                    {STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, status: opt.value as FormData['status'] }))}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                          form.status === opt.value
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'border-gray-200 text-gray-600 hover:border-gray-400'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Observações</label>
                  <textarea
                    className="w-full border border-input rounded-md px-3 py-2 text-sm min-h-[72px] resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Informações adicionais sobre a consulta..."
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1">
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="flex-1 bg-gray-900 hover:bg-gray-800 text-white">
                  {saving ? 'Salvando...' : 'Salvar Agendamento'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
