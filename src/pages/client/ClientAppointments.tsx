import { type ReactNode, useEffect, useState, useMemo } from 'react'
import { Search, Plus, X, ChevronLeft, ChevronRight, Calendar, List, User, Stethoscope, Phone, FileText, Pencil, Trash2 } from 'lucide-react'
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

const APPT_PALETTES = [
  { bg: 'bg-brand-50',  bar: 'bg-brand-400',  text: 'text-brand-900',  sub: 'text-brand-600'  },
  { bg: 'bg-blue-50',   bar: 'bg-blue-400',   text: 'text-blue-900',   sub: 'text-blue-600'   },
  { bg: 'bg-violet-50', bar: 'bg-violet-400', text: 'text-violet-900', sub: 'text-violet-600' },
  { bg: 'bg-orange-50', bar: 'bg-orange-400', text: 'text-orange-900', sub: 'text-orange-600' },
  { bg: 'bg-pink-50',   bar: 'bg-pink-400',   text: 'text-pink-900',   sub: 'text-pink-600'   },
  { bg: 'bg-teal-50',   bar: 'bg-teal-400',   text: 'text-teal-900',   sub: 'text-teal-600'   },
  { bg: 'bg-amber-50',  bar: 'bg-amber-400',  text: 'text-amber-900',  sub: 'text-amber-600'  },
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

const statusColors: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  scheduled: 'secondary', confirmed: 'success', cancelled: 'destructive', completed: 'outline',
}
const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Agendado'   },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'completed', label: 'Realizado'  },
  { value: 'cancelled', label: 'Cancelado'  },
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
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)
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

  function openEdit(appt: Appointment) {
    const d = new Date(appt.scheduled_at)
    setEditForm({
      patient_name: appt.patient_name,
      patient_phone: appt.patient_phone ?? '',
      specialty: appt.specialty,
      doctor_name: appt.doctor_name ?? '',
      date: d.toISOString().slice(0, 10),
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      notes: appt.notes ?? '',
      status: appt.status,
    })
    setEditMode(true)
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!detailAppt) return
    if (!editForm.patient_name.trim() || !editForm.specialty.trim() || !editForm.date || !editForm.time) {
      setFormError('Preencha: nome, especialidade, data e horário.'); return
    }
    setSaving(true); setFormError('')
    const { error } = await supabase.from('appointments').update({
      patient_name: editForm.patient_name.trim(),
      patient_phone: editForm.patient_phone.trim() || '',
      specialty: editForm.specialty.trim(),
      doctor_name: editForm.doctor_name.trim() || null,
      scheduled_at: `${editForm.date}T${editForm.time}:00`,
      notes: editForm.notes.trim() || null,
      status: editForm.status,
    }).eq('id', detailAppt.id)
    setSaving(false)
    if (error) { setFormError(`Erro: ${error.message}`); return }
    setEditMode(false); setDetailAppt(null); fetchAppointments()
  }

  async function handleStatusChange(status: Appointment['status']) {
    if (!detailAppt) return
    await supabase.from('appointments').update({ status }).eq('id', detailAppt.id)
    setDetailAppt({ ...detailAppt, status })
    setAppointments(prev => prev.map(a => a.id === detailAppt.id ? { ...a, status } : a))
  }

  async function handleDelete() {
    if (!detailAppt || !confirm('Excluir este agendamento?')) return
    await supabase.from('appointments').delete().eq('id', detailAppt.id)
    setDetailAppt(null); fetchAppointments()
  }

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
    if (error) { setFormError(`Erro: ${error.message}`); return }
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

      {/* ── Single top bar ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* View toggle */}
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          {(['calendar', 'list'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all duration-200',
                view === v ? 'text-white shadow-[0_2px_8px_rgba(37,112,160,0.28)]' : 'text-slate-400 hover:text-slate-600',
              )}
              style={view === v ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)' } : {}}
            >
              {v === 'calendar' ? <Calendar className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
              {v === 'calendar' ? 'Calendário' : 'Lista'}
            </button>
          ))}
        </div>

        {/* Week nav — only in calendar view */}
        {view === 'calendar' && (
          <>
            <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <button onClick={prev} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <span className="text-[13px] font-semibold text-slate-700 px-2 min-w-[148px] text-center tabular-nums">
                {rangeLabel}
              </span>
              <button onClick={next} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <button
              onClick={goToday}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
            >
              Hoje
            </button>
          </>
        )}

        {/* Search — only in list view */}
        {view === 'list' && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar paciente, especialidade..."
              className="pl-10 h-9 rounded-2xl border-slate-200 bg-white text-sm focus-visible:ring-brand-400 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}

        {/* Spacer + New button */}
        <div className="ml-auto">
          <button
            onClick={openModal}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white shadow-[0_4px_14px_rgba(44,130,181,0.30)] hover:shadow-[0_6px_20px_rgba(44,130,181,0.42)] hover:-translate-y-[1px] transition-all duration-200"
            style={{ background: 'linear-gradient(135deg, #2C82B5 0%, #2570a0 100%)' }}
          >
            <Plus className="w-4 h-4" />
            Novo Agendamento
          </button>
        </div>
      </div>

      {/* ── Calendar view ────────────────────────────────────────── */}
      {view === 'calendar' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_16px_rgba(0,0,0,0.04)] overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-5 h-5 border-[2.5px] border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
              <div className="w-full">

                {/* Day header row */}
                <div className="sticky top-0 z-30 flex bg-white border-b border-slate-100 w-full">
                  <div
                    style={{ width: TIME_COL_W, minWidth: TIME_COL_W }}
                    className="shrink-0 border-r border-slate-100"
                  />
                  {days.map((day, i) => {
                    const isToday = dayKey(day) === todayKey
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex-1 border-l border-slate-100 py-3 text-center min-w-0',
                          isWeekend && !isToday ? 'bg-slate-50/60' : '',
                        )}
                      >
                        <p className={cn(
                          'text-[10px] font-bold uppercase tracking-[0.12em]',
                          isToday ? 'text-brand-500' : 'text-slate-400',
                        )}>
                          {DAY_PT[day.getDay()]}
                        </p>
                        <div
                          className={cn(
                            'mt-1.5 mx-auto w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-bold transition-all duration-200',
                            isToday ? 'text-white shadow-[0_4px_10px_rgba(44,130,181,0.35)]' : 'text-slate-600 hover:bg-slate-100',
                          )}
                          style={isToday ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)' } : {}}
                        >
                          {day.getDate()}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Time grid */}
                <div className="flex w-full relative" style={{ height: totalHeight }}>

                  {/* Time labels column */}
                  <div
                    className="relative shrink-0 bg-white border-r border-slate-100"
                    style={{ width: TIME_COL_W, minWidth: TIME_COL_W }}
                  >
                    {hours.map(h => (
                      <div
                        key={h}
                        className="absolute right-3 flex items-start justify-end"
                        style={{ top: (h - startHour) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      >
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
                      <div
                        key={i}
                        className={cn(
                          'relative flex-1 min-w-0 border-l border-slate-100',
                          isToday ? 'bg-brand-50/20' : isWeekend ? 'bg-slate-50/40' : '',
                        )}
                        style={{ height: totalHeight }}
                      >
                        {/* Horizontal grid lines */}
                        {hours.map(h => (
                          <div key={h}>
                            <div
                              className="absolute left-0 right-0 border-t border-slate-100"
                              style={{ top: (h - startHour) * HOUR_HEIGHT }}
                            />
                            <div
                              className="absolute left-0 right-0 border-t border-dashed border-slate-50"
                              style={{ top: (h - startHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                            />
                          </div>
                        ))}

                        {/* Current time line */}
                        {isToday && nowLine !== null && (
                          <div
                            className="absolute left-0 right-0 z-20 pointer-events-none"
                            style={{ top: nowLine }}
                          >
                            <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-brand-500" />
                            <div
                              className="h-[1.5px] ml-1"
                              style={{ background: 'linear-gradient(90deg, #2C82B5, rgba(44,130,181,0.15))' }}
                            />
                          </div>
                        )}

                        {/* Appointment cards */}
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
                                'shadow-[0_1px_4px_rgba(0,0,0,0.07)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.12)] hover:-translate-y-px transition-all duration-150',
                                pal.bg,
                              )}
                              style={{ top: top + 2, minHeight: HOUR_HEIGHT / 2 - 4 }}
                            >
                              <div className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl', pal.bar)} />
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
                                  'shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white',
                                  pal.bar,
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

      {/* ── List view ─────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">

          {/* Column headers */}
          <div className="flex items-center gap-4 px-6 py-3 border-b border-slate-50">
            <div className="w-2 shrink-0" />
            <p className="flex-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 min-w-0">
              Paciente · Especialidade
            </p>
            <p className="w-32 shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 hidden md:block">
              Médico
            </p>
            <p className="w-28 shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 hidden sm:block">
              Data
            </p>
            <p className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 text-right">
              Status
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-[2.5px] border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
                <Calendar className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-[13px] font-semibold text-slate-400">Nenhum agendamento encontrado.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50/80">
              {filtered.map((appt, i) => (
                <div
                  key={appt.id}
                  onClick={() => setDetailAppt(appt)}
                  className={cn(
                    'flex items-center gap-4 px-6 py-3.5 cursor-pointer transition-colors duration-150 hover:bg-slate-50/70 group',
                    i % 2 !== 0 ? 'bg-slate-50/30' : '',
                  )}
                >
                  {/* Status dot */}
                  <div className={cn(
                    'w-2 h-2 rounded-full shrink-0 transition-transform duration-200 group-hover:scale-125',
                    appt.status === 'scheduled'  ? 'bg-slate-300'   :
                    appt.status === 'confirmed'  ? 'bg-emerald-400' :
                    appt.status === 'cancelled'  ? 'bg-rose-400'    : 'bg-brand-400',
                  )} />

                  {/* Patient + specialty */}
                  <div className="flex-1 flex items-center gap-1.5 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{appt.patient_name}</p>
                    <span className="text-slate-300 text-[11px] shrink-0">·</span>
                    <p className="text-[12px] text-slate-500 truncate">{appt.specialty}</p>
                  </div>

                  {/* Doctor */}
                  <p className="w-32 shrink-0 text-[12px] text-slate-400 truncate hidden md:block">
                    {appt.doctor_name ?? '—'}
                  </p>

                  {/* Date */}
                  <p className="w-28 shrink-0 text-[12px] font-medium text-slate-500 tabular-nums hidden sm:block">
                    {formatDate(appt.scheduled_at)}
                  </p>

                  {/* Badge */}
                  <div className="w-20 shrink-0 flex justify-end">
                    <Badge variant={statusColors[appt.status] ?? 'outline'} className="text-[10px] font-semibold">
                      {statusLabel(appt.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Detail modal ─────────────────────────────────────────── */}
      {detailAppt && (() => {
        const pal = apptPalette(detailAppt.specialty)
        const d = new Date(detailAppt.scheduled_at)
        const dateStr = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => { setDetailAppt(null); setEditMode(false) }} />
            <div className="relative bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] w-full max-w-sm overflow-hidden">

              {/* Top action bar */}
              <div className="flex items-center justify-end gap-1 px-4 pt-3 pb-1">
                {!editMode && <>
                  <button onClick={() => openEdit(detailAppt)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-brand-500">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={handleDelete} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-rose-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>}
                <button onClick={() => { setDetailAppt(null); setEditMode(false) }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!editMode ? (
                <>
                  {/* View: title */}
                  <div className="flex items-start gap-3 px-5 pb-3">
                    <div className={cn('w-3 h-3 rounded-sm mt-1.5 shrink-0', pal.bar)} />
                    <div>
                      <p className="text-[17px] font-semibold text-gray-900 leading-snug">{detailAppt.patient_name}</p>
                      <p className="text-[13px] text-slate-500 mt-0.5 capitalize">{dateStr} · {timeStr}</p>
                    </div>
                  </div>

                  {/* Status picker */}
                  <div className="px-5 pb-3 flex gap-1.5 flex-wrap">
                    {STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => handleStatusChange(opt.value as Appointment['status'])}
                        className={cn(
                          'px-3 py-1 rounded-full text-[11px] font-semibold border transition-all duration-150',
                          detailAppt.status === opt.value
                            ? 'text-white border-transparent shadow-sm'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white',
                        )}
                        style={detailAppt.status === opt.value ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)' } : {}}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="mx-5 h-px bg-slate-100" />

                  {/* Detail rows */}
                  <div className="px-5 py-4 space-y-3">
                    <GCalRow icon={<Stethoscope className="w-4 h-4" />}>
                      {detailAppt.specialty.charAt(0).toUpperCase() + detailAppt.specialty.slice(1).toLowerCase()}
                    </GCalRow>
                    {detailAppt.doctor_name && <GCalRow icon={<User className="w-4 h-4" />}>{detailAppt.doctor_name}</GCalRow>}
                    {detailAppt.patient_phone && <GCalRow icon={<Phone className="w-4 h-4" />}>{detailAppt.patient_phone}</GCalRow>}
                    {detailAppt.notes && <GCalRow icon={<FileText className="w-4 h-4" />}>{detailAppt.notes}</GCalRow>}
                  </div>

                  <div className="px-5 pb-5 pt-1">
                    <button onClick={() => setDetailAppt(null)} className="w-full py-2 rounded-xl text-[13px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                      Fechar
                    </button>
                  </div>
                </>
              ) : (
                /* Edit form */
                <form onSubmit={handleUpdate} className="px-5 pb-5 space-y-3">
                  <p className="text-[13px] font-bold text-gray-900 mb-1">Editar agendamento</p>

                  <FormField label="Nome do paciente" required>
                    <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                      value={editForm.patient_name} onChange={e => setEditForm(f => ({ ...f, patient_name: e.target.value }))} />
                  </FormField>

                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Telefone">
                      <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                        value={editForm.patient_phone} onChange={e => setEditForm(f => ({ ...f, patient_phone: e.target.value }))} />
                    </FormField>
                    <FormField label="Especialidade" required>
                      <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                        value={editForm.specialty} onChange={e => setEditForm(f => ({ ...f, specialty: e.target.value }))} />
                    </FormField>
                  </div>

                  <FormField label="Profissional">
                    <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                      value={editForm.doctor_name} onChange={e => setEditForm(f => ({ ...f, doctor_name: e.target.value }))} />
                  </FormField>

                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Data" required>
                      <input type="date" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                        value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
                    </FormField>
                    <FormField label="Horário" required>
                      <input type="time" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                        value={editForm.time} onChange={e => setEditForm(f => ({ ...f, time: e.target.value }))} />
                    </FormField>
                  </div>

                  <FormField label="Observações">
                    <textarea className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm min-h-[60px] resize-none focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                      value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                  </FormField>

                  {formError && <p className="text-[12px] text-rose-500">{formError}</p>}

                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setEditMode(false)}
                      className="flex-1 py-2 rounded-xl text-[13px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                      Cancelar
                    </button>
                    <button type="submit" disabled={saving}
                      className="flex-1 py-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-60 transition-all hover:-translate-y-[1px]"
                      style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}>
                      {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── New Appointment Modal ────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeModal} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-5 rounded-t-3xl"
              style={{ background: 'linear-gradient(135deg, #2C82B5 0%, #1e5f88 100%)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-base font-bold text-white">Novo Agendamento</h2>
              </div>
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">

              <FormField label="Nome do paciente" required>
                <Input
                  placeholder="Nome completo"
                  value={form.patient_name}
                  onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))}
                  className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Telefone">
                  <Input
                    placeholder="(00) 00000-0000"
                    value={form.patient_phone}
                    onChange={e => setForm(f => ({ ...f, patient_phone: e.target.value }))}
                    className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm"
                  />
                </FormField>
                <FormField label="Especialidade" required>
                  <Input
                    placeholder="Ex: Cardiologia"
                    value={form.specialty}
                    onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                    className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm"
                  />
                </FormField>
              </div>

              <FormField label="Médico responsável">
                <Input
                  placeholder="Nome do médico"
                  value={form.doctor_name}
                  onChange={e => setForm(f => ({ ...f, doctor_name: e.target.value }))}
                  className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Data" required>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm"
                  />
                </FormField>
                <FormField label="Horário" required>
                  <Input
                    type="time"
                    value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm"
                  />
                </FormField>
              </div>

              <FormField label="Status">
                <div className="flex gap-2 flex-wrap">
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: opt.value as FormData['status'] }))}
                      className={cn(
                        'px-3.5 py-1.5 rounded-xl text-[13px] font-semibold border transition-all duration-200',
                        form.status === opt.value
                          ? 'text-white border-transparent shadow-[0_2px_8px_rgba(44,130,181,0.26)]'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white',
                      )}
                      style={form.status === opt.value
                        ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }
                        : {}}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FormField>

              <FormField label="Observações">
                <textarea
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm min-h-[72px] resize-y focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
                  placeholder="Informações adicionais..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </FormField>

              {formError && (
                <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                  <X className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModal}
                  className="flex-1 rounded-2xl border-slate-200 text-[13px] font-semibold"
                >
                  Cancelar
                </Button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white shadow-[0_4px_14px_rgba(44,130,181,0.28)] hover:shadow-[0_6px_20px_rgba(44,130,181,0.38)] hover:-translate-y-[1px] disabled:opacity-60 disabled:hover:translate-y-0 transition-all duration-200"
                  style={{ background: 'linear-gradient(135deg, #2C82B5 0%, #2570a0 100%)' }}
                >
                  {saving ? 'Salvando...' : 'Salvar Agendamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────

function GCalRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-slate-400 shrink-0 mt-0.5">{icon}</div>
      <p className="text-[13px] text-slate-700 leading-snug">{children}</p>
    </div>
  )
}

function FormField({ label, required, children }: {
  label: string; required?: boolean; children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {label}
        {required && <span className="text-rose-400 text-[10px]">*</span>}
      </label>
      {children}
    </div>
  )
}
