import { useEffect, useState, useMemo } from 'react'
import { Search, Plus, X, ChevronLeft, ChevronRight, Calendar, List, Clock, User, Stethoscope, Phone, FileText, Tag } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Appointment } from '../../types'
import { formatDate, statusLabel } from '../../lib/utils'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'

// ── Calendar constants ─────────────────────────────────────────
const HOUR_HEIGHT = 80
const DEFAULT_START = 8
const END_HOUR = 20
const TIME_COL_W = 60
const DAY_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Each entry: [bg, accent-bar color, text, subtext]
const APPT_PALETTES = [
  { bg: 'bg-brand-50', bar: 'bg-brand-400', text: 'text-brand-900', sub: 'text-brand-600' },
  { bg: 'bg-blue-50',    bar: 'bg-blue-400',    text: 'text-blue-900',    sub: 'text-blue-600'    },
  { bg: 'bg-violet-50',  bar: 'bg-violet-400',  text: 'text-violet-900',  sub: 'text-violet-600'  },
  { bg: 'bg-orange-50',  bar: 'bg-orange-400',  text: 'text-orange-900',  sub: 'text-orange-600'  },
  { bg: 'bg-pink-50',    bar: 'bg-pink-400',    text: 'text-pink-900',    sub: 'text-pink-600'    },
  { bg: 'bg-teal-50',    bar: 'bg-teal-400',    text: 'text-teal-900',    sub: 'text-teal-600'    },
  { bg: 'bg-amber-50',   bar: 'bg-amber-400',   text: 'text-amber-900',   sub: 'text-amber-600'   },
]

function apptPalette(specialty: string) {
  const hash = specialty.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return APPT_PALETTES[hash % APPT_PALETTES.length]
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

function useNowLine(startHour: number) {
  const [pct, setPct] = useState<number | null>(null)
  useEffect(() => {
    function calc() {
      const now = new Date()
      const h = now.getHours(), m = now.getMinutes()
      if (h < startHour || h >= END_HOUR) { setPct(null); return }
      setPct(((h - startHour) * 60 + m) / 60 * HOUR_HEIGHT)
    }
    calc()
    const id = setInterval(calc, 60_000)
    return () => clearInterval(id)
  }, [startHour])
  return pct
}

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
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null)
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
  const nowLine = useNowLine(startHour)

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
    <div className="flex flex-col gap-3 h-full">

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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0px_4px_24px_rgba(0,0,0,0.04)] overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
              <div className="w-full">

                {/* Day header row */}
                <div className="sticky top-0 z-30 flex bg-white border-b border-slate-200 w-full">
                  <div style={{ width: TIME_COL_W, minWidth: TIME_COL_W }}
                    className="shrink-0" />
                  {days.map((day, i) => {
                    const isToday = dayKey(day) === todayKey
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6
                    return (
                      <div key={i}
                        className={cn(
                          'flex-1 border-l border-slate-200 py-3 text-center min-w-0',
                          isWeekend && !isToday && 'bg-slate-50/60',
                        )}>
                        <p className={cn('text-[11px] font-semibold uppercase tracking-widest',
                          isToday ? 'text-brand-500' : isWeekend ? 'text-slate-400' : 'text-slate-400')}>
                          {DAY_PT[day.getDay()]}
                        </p>
                        <div className={cn('mt-1 mx-auto w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-colors',
                          isToday ? 'bg-gray-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                          {day.getDate()}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Time grid */}
                <div className="flex w-full relative" style={{ height: totalHeight }}>

                  {/* Time labels column */}
                  <div className="relative shrink-0 bg-white border-r border-slate-200"
                    style={{ width: TIME_COL_W, minWidth: TIME_COL_W }}>
                    {hours.map(h => (
                      <div key={h} className="absolute right-3 flex items-start justify-end"
                        style={{ top: (h - startHour) * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                        <span className="text-[11px] text-slate-400 font-medium pt-1.5 tabular-nums">
                          {String(h).padStart(2, '0')}:00
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Day columns */}
                  {days.map((day, i) => {
                    const isToday = dayKey(day) === todayKey
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6
                    const dayAppts = apptsByDay[dayKey(day)] ?? []
                    return (
                      <div key={i} className={cn(
                          'relative flex-1 min-w-0 border-l border-slate-200',
                          isToday ? 'bg-brand-50/40' : isWeekend ? 'bg-slate-50/50' : '',
                        )}
                        style={{ height: totalHeight }}>

                        {/* Grid lines */}
                        {hours.map(h => (
                          <div key={h}>
                            <div className="absolute left-0 right-0 border-t border-slate-200"
                              style={{ top: (h - startHour) * HOUR_HEIGHT }} />
                            <div className="absolute left-0 right-0 border-t border-dashed border-slate-100"
                              style={{ top: (h - startHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                          </div>
                        ))}

                        {/* Current time indicator */}
                        {isToday && nowLine !== null && (
                          <div className="absolute left-0 right-0 z-20 pointer-events-none"
                            style={{ top: nowLine }}>
                            <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-brand-500" />
                            <div className="h-[2px] bg-brand-400 ml-1" />
                          </div>
                        )}

                        {/* Appointments */}
                        {dayAppts.map(appt => {
                          const top = apptTop(appt.scheduled_at, startHour)
                          if (top === null) return null
                          const pal = apptPalette(appt.specialty)
                          const d = new Date(appt.scheduled_at)
                          const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                          const initials = appt.patient_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                          return (
                            <div
                              key={appt.id}
                              onClick={() => setDetailAppt(appt)}
                              className={cn(
                                'absolute left-1 right-1 rounded-xl overflow-hidden cursor-pointer z-10',
                                'shadow-sm hover:shadow-md hover:-translate-y-px transition-all duration-150',
                                pal.bg,
                              )}
                              style={{ top: top + 2, minHeight: HOUR_HEIGHT / 2 - 4 }}
                            >
                              {/* Accent bar */}
                              <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl', pal.bar)} />
                              <div className="pl-3 pr-2 py-1.5 flex items-start gap-1.5">
                                <div className="flex-1 min-w-0">
                                  <p className={cn('text-[11px] font-bold truncate leading-tight', pal.text)}>
                                    {appt.patient_name}
                                  </p>
                                  <p className={cn('text-[10px] truncate leading-tight mt-0.5 font-medium', pal.sub)}>
                                    {time} · {appt.specialty}
                                  </p>
                                </div>
                                <span className={cn(
                                  'shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black',
                                  pal.bar, 'text-white'
                                )}>
                                  {initials}
                                </span>
                              </div>
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

      {/* ── Detail Modal ──────────────────────────────────────── */}
      {detailAppt && (() => {
        const pal = apptPalette(detailAppt.specialty)
        const d = new Date(detailAppt.scheduled_at)
        const dateStr = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        const initials = detailAppt.patient_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
        const statusDot: Record<string, string> = {
          scheduled: 'bg-slate-400', confirmed: 'bg-brand-500',
          completed: 'bg-blue-400', cancelled: 'bg-red-400',
        }
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setDetailAppt(null)} />
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-up">

              {/* Header colorido */}
              <div className={cn('px-6 pt-6 pb-5 relative', pal.bg)}>
                <div className={cn('absolute left-0 top-0 bottom-0 w-1.5', pal.bar)} />
                <button
                  onClick={() => setDetailAppt(null)}
                  className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-slate-700" />
                </button>

                <div className="flex items-center gap-3">
                  <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black text-white shadow-sm', pal.bar)}>
                    {initials}
                  </div>
                  <div>
                    <p className={cn('font-bold text-base leading-tight', pal.text)}>{detailAppt.patient_name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusDot[detailAppt.status] ?? 'bg-slate-400')} />
                      <span className="text-xs font-medium text-slate-600">{statusLabel(detailAppt.status)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalhes */}
              <div className="px-6 py-5 space-y-3.5">
                <DetailRow icon={<Clock className="w-4 h-4" />} label="Data e horário">
                  <span className="capitalize">{dateStr}</span> às <strong>{timeStr}</strong>
                </DetailRow>
                <DetailRow icon={<Stethoscope className="w-4 h-4" />} label="Especialidade">
                  {detailAppt.specialty}
                </DetailRow>
                {detailAppt.doctor_name && (
                  <DetailRow icon={<User className="w-4 h-4" />} label="Médico">
                    {detailAppt.doctor_name}
                  </DetailRow>
                )}
                {detailAppt.patient_phone && (
                  <DetailRow icon={<Phone className="w-4 h-4" />} label="Telefone">
                    {detailAppt.patient_phone}
                  </DetailRow>
                )}
                {detailAppt.notes && (
                  <DetailRow icon={<FileText className="w-4 h-4" />} label="Observações">
                    {detailAppt.notes}
                  </DetailRow>
                )}
                <DetailRow icon={<Tag className="w-4 h-4" />} label="Status">
                  <Badge variant={statusColors[detailAppt.status] ?? 'outline'} className="text-[11px]">
                    {statusLabel(detailAppt.status)}
                  </Badge>
                </DetailRow>
              </div>

              <div className="px-6 pb-5">
                <button
                  onClick={() => setDetailAppt(null)}
                  className="w-full py-2.5 rounded-2xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 leading-none mb-0.5">{label}</p>
        <p className="text-sm text-slate-700">{children}</p>
      </div>
    </div>
  )
}
