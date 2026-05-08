import { useEffect, useState, useMemo } from 'react'
import { Search, Plus, X, ChevronLeft, ChevronRight, Calendar, List } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Appointment } from '../../types'
import { formatDate, statusLabel } from '../../lib/utils'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'

// ── Calendar constants ─────────────────────────────────────────
const HOUR_HEIGHT = 64
const DEFAULT_START = 8
const END_HOUR = 20
const TIME_COL_W = 60
const DAY_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const APPT_COLORS = [
  'bg-emerald-50 border-emerald-200 text-emerald-900',
  'bg-blue-50 border-blue-200 text-blue-900',
  'bg-violet-50 border-violet-200 text-violet-900',
  'bg-orange-50 border-orange-200 text-orange-900',
  'bg-pink-50 border-pink-200 text-pink-900',
  'bg-teal-50 border-teal-200 text-teal-900',
  'bg-amber-50 border-amber-200 text-amber-900',
]

function apptColor(specialty: string) {
  const hash = specialty.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return APPT_COLORS[hash % APPT_COLORS.length]
}

function apptTop(iso: string, startHour: number): number | null {
  const d = new Date(iso)
  const h = d.getHours(), m = d.getMinutes()
  if (h < startHour || h >= END_HOUR) return null
  return ((h - startHour) * 60 + m) / 60 * HOUR_HEIGHT
}

function dayKey(d: Date) { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function weekStart(d: Date) {
  const r = new Date(d); r.setDate(r.getDate() - r.getDay()); r.setHours(0, 0, 0, 0); return r
}

// ── Form types ─────────────────────────────────────────────────
const statusColors: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  scheduled: 'secondary', confirmed: 'success', cancelled: 'destructive', completed: 'outline',
}
const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Agendado' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'completed', label: 'Realizado' },
  { value: 'cancelled', label: 'Cancelado' },
]
interface FormData {
  patient_name: string; patient_phone: string; specialty: string
  doctor_name: string; date: string; time: string; notes: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled'
}
const EMPTY: FormData = {
  patient_name: '', patient_phone: '', specialty: '',
  doctor_name: '', date: '', time: '', notes: '', status: 'scheduled',
}

type ViewMode = 'calendar' | 'list'

// ── Component ──────────────────────────────────────────────────
export default function ClientAppointments() {
  const { orgId } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('calendar')
  const [startDate, setStartDate] = useState<Date>(() => weekStart(new Date()))
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormData>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  async function fetchAppointments() {
    if (!orgId) return
    const { data } = await supabase
      .from('appointments').select('*').eq('org_id', orgId)
      .order('scheduled_at', { ascending: true })
    setAppointments(data ?? [])
    setLoading(false)
  }
  useEffect(() => { fetchAppointments() }, [orgId])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startDate, i)),
    [startDate],
  )

  const apptsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    days.forEach(d => { map[dayKey(d)] = [] })
    appointments.forEach(a => {
      const k = new Date(a.scheduled_at).toISOString().slice(0, 10)
      if (map[k]) map[k].push(a)
    })
    return map
  }, [appointments, days])

  // Dynamic start hour: 8 by default, earlier if any visible appointment requires it
  const startHour = useMemo(() => {
    const visibleAppts = days.flatMap(d => apptsByDay[dayKey(d)] ?? [])
    const earliest = visibleAppts.reduce((min, a) => {
      const h = new Date(a.scheduled_at).getHours()
      return h < min ? h : min
    }, DEFAULT_START)
    return Math.min(earliest, DEFAULT_START)
  }, [apptsByDay, days])

  const totalHeight = (END_HOUR - startHour) * HOUR_HEIGHT
  const hours = Array.from({ length: END_HOUR - startHour }, (_, i) => startHour + i)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return appointments.filter(a =>
      a.patient_name.toLowerCase().includes(q) ||
      a.specialty.toLowerCase().includes(q) ||
      (a.doctor_name ?? '').toLowerCase().includes(q)
    )
  }, [search, appointments])

  function prev() { setStartDate(d => addDays(d, -7)) }
  function next() { setStartDate(d => addDays(d, 7)) }
  function goToday() { setStartDate(weekStart(new Date())) }

  function openModal() { setForm(EMPTY); setFormError(''); setShowModal(true) }
  function closeModal() { setShowModal(false) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    if (!form.patient_name.trim() || !form.specialty.trim() || !form.date || !form.time) {
      setFormError('Preencha: nome, especialidade, data e horário.')
      return
    }
    setSaving(true); setFormError('')
    const { error } = await supabase.from('appointments').insert({
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
    if (error) { console.error('appointments insert error:', error); setFormError(`Erro: ${error.message}`); return }
    closeModal(); fetchAppointments()
  }

  const todayKey = dayKey(new Date())
  const rangeLabel = (() => {
    const end = addDays(startDate, 6)
    const f = (d: Date) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
    return `${f(startDate)} – ${f(end)}`
  })()

  return (
    <div className="space-y-4">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agendamentos</h1>
          <p className="text-sm text-gray-500">{appointments.length} consultas registradas</p>
        </div>
        <Button onClick={openModal} className="gap-2 bg-gray-900 hover:bg-gray-800 text-white">
          <Plus className="w-4 h-4" /> Novo Agendamento
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">

        {/* View toggle */}
        <div className="flex bg-white border border-slate-200 rounded-xl p-1">
          <button onClick={() => setView('calendar')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
              view === 'calendar' ? 'bg-gray-900 text-white' : 'text-slate-500 hover:text-slate-800')}>
            <Calendar className="w-3.5 h-3.5" /> Calendário
          </button>
          <button onClick={() => setView('list')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
              view === 'list' ? 'bg-gray-900 text-white' : 'text-slate-500 hover:text-slate-800')}>
            <List className="w-3.5 h-3.5" /> Lista
          </button>
        </div>

        {view === 'calendar' && (
          <>
            {/* Navigation */}
            <div className="flex items-center gap-1">
              <button onClick={prev}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <span className="text-sm font-medium text-slate-700 px-2 min-w-[160px] text-center">{rangeLabel}</span>
              <button onClick={next}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <button onClick={goToday}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Hoje
            </button>
          </>
        )}

        {view === 'list' && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Buscar paciente..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}
      </div>

      {/* ── Calendar ─────────────────────────────────────────── */}
      {view === 'calendar' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: '74vh' }}>
              <div className="w-full">

                {/* Day header row */}
                <div className="sticky top-0 z-30 flex bg-white border-b border-slate-100 w-full">
                  <div style={{ width: TIME_COL_W, minWidth: TIME_COL_W }}
                    className="shrink-0" />
                  {days.map((day, i) => {
                    const isToday = dayKey(day) === todayKey
                    return (
                      <div key={i}
                        className="flex-1 border-l border-slate-100 py-3 text-center min-w-0">
                        <p className={cn('text-[11px] font-medium uppercase tracking-wider',
                          isToday ? 'text-emerald-500' : 'text-slate-400')}>
                          {DAY_PT[day.getDay()]}
                        </p>
                        <div className={cn('mt-1 mx-auto w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold',
                          isToday ? 'bg-gray-900 text-white' : 'text-slate-700')}>
                          {day.getDate()}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Time grid */}
                <div className="flex w-full relative" style={{ height: totalHeight }}>

                  {/* Time labels column */}
                  <div className="relative shrink-0 bg-white border-r border-slate-100"
                    style={{ width: TIME_COL_W, minWidth: TIME_COL_W }}>
                    {hours.map(h => (
                      <div key={h} className="absolute right-3 flex items-start justify-end"
                        style={{ top: (h - startHour) * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                        <span className="text-[11px] text-slate-400 font-medium pt-1.5">
                          {String(h).padStart(2, '0')}:00
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Day columns */}
                  {days.map((day, i) => {
                    const isToday = dayKey(day) === todayKey
                    const dayAppts = apptsByDay[dayKey(day)] ?? []
                    return (
                      <div key={i} className={cn('relative flex-1 min-w-0 border-l border-slate-100',
                        isToday && 'bg-emerald-50/30')}
                        style={{ height: totalHeight }}>

                        {/* Grid lines */}
                        {hours.map(h => (
                          <div key={h}>
                            <div className="absolute left-0 right-0 border-t border-slate-100"
                              style={{ top: (h - startHour) * HOUR_HEIGHT }} />
                            <div className="absolute left-0 right-0 border-t border-slate-50"
                              style={{ top: (h - startHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                          </div>
                        ))}

                        {/* Appointments */}
                        {dayAppts.map(appt => {
                          const top = apptTop(appt.scheduled_at, startHour)
                          if (top === null) return null
                          const color = apptColor(appt.specialty)
                          const d = new Date(appt.scheduled_at)
                          const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                          return (
                            <div key={appt.id}
                              title={`${appt.patient_name} — ${appt.specialty}${appt.doctor_name ? ' | ' + appt.doctor_name : ''}`}
                              className={cn(
                                'absolute left-1 right-1 rounded-lg border px-2 py-1 overflow-hidden cursor-default hover:brightness-95 transition-all z-10',
                                color,
                              )}
                              style={{ top: top + 1, minHeight: HOUR_HEIGHT / 2 - 2 }}>
                              <p className="text-[11px] font-semibold truncate leading-tight">
                                {appt.patient_name} | {time}
                              </p>
                              <p className="text-[10px] truncate opacity-60 leading-tight mt-0.5">
                                {appt.specialty}{appt.doctor_name ? ` | ${appt.doctor_name}` : ''}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── List View ─────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] overflow-hidden">
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
      )}

      {/* ── New Appointment Modal ──────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-gray-900">Novo Agendamento</h2>
              <button onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Nome do paciente <span className="text-red-400">*</span>
                  </label>
                  <Input placeholder="Nome completo" value={form.patient_name}
                    onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefone</label>
                  <Input placeholder="(00) 00000-0000" value={form.patient_phone}
                    onChange={e => setForm(f => ({ ...f, patient_phone: e.target.value }))} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Especialidade <span className="text-red-400">*</span>
                  </label>
                  <Input placeholder="Ex: Cardiologia" value={form.specialty}
                    onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Médico responsável</label>
                  <Input placeholder="Nome do médico" value={form.doctor_name}
                    onChange={e => setForm(f => ({ ...f, doctor_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Data <span className="text-red-400">*</span>
                  </label>
                  <Input type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Horário <span className="text-red-400">*</span>
                  </label>
                  <Input type="time" value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                  <div className="flex gap-2 flex-wrap">
                    {STATUS_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setForm(f => ({ ...f, status: opt.value as FormData['status'] }))}
                        className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                          form.status === opt.value
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'border-gray-200 text-gray-600 hover:border-gray-400')}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Observações</label>
                  <textarea
                    className="w-full border border-input rounded-md px-3 py-2 text-sm min-h-[72px] resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Informações adicionais..."
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1">Cancelar</Button>
                <Button type="submit" disabled={saving}
                  className="flex-1 bg-gray-900 hover:bg-gray-800 text-white">
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
