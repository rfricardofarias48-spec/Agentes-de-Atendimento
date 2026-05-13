import { type ReactNode, useEffect, useState, useMemo, useRef } from 'react'
import { Search, Plus, X, ChevronLeft, ChevronRight, Calendar, List, User, Stethoscope, Phone, FileText, Pencil, Trash2, ChevronDown, Lock, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Appointment } from '../../types'
import { statusLabel } from '../../lib/utils'
import { TZ, toBRT, brtDateStr } from '../../lib/date'

function formatApptDate(iso: string): string {
  const d = toBRT(new Date(iso))
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const h = d.getHours(), m = d.getMinutes()
  return m === 0 ? `${day}/${month} · ${h}h` : `${day}/${month} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'

// ── Types ──────────────────────────────────────────────────────
interface BlockedSlot {
  id: string
  org_id: string
  date: string
  all_day: boolean
  start_time: string | null
  end_time: string | null
  reason: string | null
}

interface BlockForm {
  date: string
  date_end: string
  all_day: boolean
  start_time: string
  end_time: string
  reason: string
}

interface PendingBlock extends BlockForm { key: string }

const EMPTY_BLOCK: BlockForm = {
  date: '', date_end: '', all_day: true, start_time: '08:00', end_time: '18:00', reason: '',
}

// ── Calendar constants ─────────────────────────────────────────
const HOUR_HEIGHT = 64
const DEFAULT_START = 8
const END_HOUR = 20
const TIME_COL_W = 60
const DAY_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const STATUS_PALETTES: Record<string, { bg: string; bar: string; text: string; sub: string }> = {
  scheduled: { bg: 'bg-blue-50',    bar: 'bg-blue-400',    text: 'text-blue-900',    sub: 'text-blue-600'    },
  confirmed: { bg: 'bg-blue-50',    bar: 'bg-blue-400',    text: 'text-blue-900',    sub: 'text-blue-600'    },
  completed: { bg: 'bg-emerald-50', bar: 'bg-emerald-500', text: 'text-emerald-900', sub: 'text-emerald-600' },
  cancelled: { bg: 'bg-red-50',     bar: 'bg-red-400',     text: 'text-red-900',     sub: 'text-red-600'     },
}

function apptPalette(status: string) { return STATUS_PALETTES[status] ?? STATUS_PALETTES.scheduled }

function apptTop(iso: string, startHour: number): number | null {
  const d = toBRT(new Date(iso))
  const h = d.getHours(), m = d.getMinutes()
  if (h < startHour || h >= END_HOUR) return null
  return ((h - startHour) * 60 + m) / 60 * HOUR_HEIGHT
}

function dayKey(d: Date) { return brtDateStr(d) }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function weekStart(d: Date) {
  const brt = toBRT(d)
  const r = new Date(d); r.setDate(r.getDate() - brt.getDay()); r.setHours(0, 0, 0, 0); return r
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
      const brt = toBRT(new Date())
      const h = brt.getHours(), m = brt.getMinutes()
      if (h < startHour || h >= END_HOUR) { setPct(null); return }
      setPct(((h - startHour) * 60 + m) / 60 * HOUR_HEIGHT)
    }
    calc()
    const id = setInterval(calc, 60_000)
    return () => clearInterval(id)
  }, [startHour])
  return pct
}

function fmtBlockDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' })
}

// ── RangeCalendar ──────────────────────────────────────────────
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function RangeCalendar({ start, end, onChange }: {
  start: string
  end: string
  onChange: (s: string, e: string) => void
}) {
  const todayStr = brtDateStr(new Date())
  const initDate = start ? new Date(start + 'T12:00:00') : new Date()
  const [year, setYear]   = useState(initDate.getFullYear())
  const [month, setMonth] = useState(initDate.getMonth())
  const [phase, setPhase] = useState<'start' | 'end'>(start ? 'end' : 'start')
  const [hover, setHover] = useState('')

  function toStr(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth  = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function handleClick(day: number) {
    const ds = toStr(year, month, day)
    if (phase === 'start') {
      onChange(ds, ''); setPhase('end')
    } else {
      if (ds < start) { onChange(ds, ''); setPhase('end') }
      else { onChange(start, ds); setPhase('start') }
    }
  }

  function effEnd() {
    if (end) return end
    if (phase === 'end' && hover && start && hover >= start) return hover
    return ''
  }

  const ee = effEnd()
  const hasRange = !!start && !!ee && start !== ee

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden select-none">
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #f1f5f9' }}>
        <button type="button" onClick={prevMonth}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[12px] font-bold text-slate-700">{MONTH_NAMES[month]} {year}</span>
        <button type="button" onClick={nextMonth}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 px-1 pt-1">
        {['D','S','T','Q','Q','S','S'].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-bold text-slate-400 py-0.5">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 px-1 pb-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="h-8" />
          const ds      = toStr(year, month, day)
          const isStart = !!start && ds === start
          const isEnd   = !!ee && ds === ee
          const inRange = !!start && !!ee && ds > start && ds < ee
          return (
            <div key={i} className="relative h-8 flex items-center justify-center">
              {hasRange && (isStart || isEnd || inRange) && (
                <div className="absolute inset-y-[2px] bg-indigo-100 pointer-events-none"
                  style={{ left: isStart ? '50%' : 0, right: isEnd ? '50%' : 0 }} />
              )}
              <button type="button"
                onClick={() => handleClick(day)}
                onMouseEnter={() => { if (phase === 'end') setHover(ds) }}
                onMouseLeave={() => setHover('')}
                className={cn(
                  'relative z-10 w-7 h-7 flex items-center justify-center text-[11px] font-medium rounded-full transition-colors',
                  isStart || isEnd ? 'bg-indigo-600 text-white font-bold shadow-sm' :
                  inRange ? 'text-indigo-700 hover:bg-indigo-100' :
                  ds === todayStr ? 'text-indigo-600 font-bold ring-1 ring-indigo-300 hover:bg-indigo-50' :
                  'text-slate-600 hover:bg-slate-100'
                )}>
                {day}
              </button>
            </div>
          )
        })}
      </div>

      <div className="px-3 py-2 text-[10px] text-center" style={{ borderTop: '1px solid #f1f5f9', color: '#94a3b8' }}>
        {!start
          ? 'Clique para selecionar o início'
          : phase === 'end'
            ? 'Selecione o dia final do período'
            : (end && end !== start)
              ? `${fmtBlockDate(start)} → ${fmtBlockDate(end)}`
              : fmtBlockDate(start)
        }
      </div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────
export default function ClientAppointments() {
  const { orgId } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('calendar')
  const [startDate, setStartDate] = useState<Date>(() => weekStart(new Date()))

  // Appointment modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormData>(EMPTY)
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<FormData>(EMPTY)
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Block modal
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [blockForm, setBlockForm] = useState<BlockForm>(EMPTY_BLOCK)
  const [pendingBlocks, setPendingBlocks] = useState<PendingBlock[]>([])
  const [savingBlock, setSavingBlock] = useState(false)
  const [blockError, setBlockError] = useState('')

  // Dropdown
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function fetchAppointments() {
    if (!orgId) return
    const { data } = await supabase
      .from('appointments').select('*').eq('org_id', orgId)
      .order('scheduled_at', { ascending: true })
    setAppointments(data ?? [])
    setLoading(false)
  }

  async function fetchBlockedSlots() {
    if (!orgId) return
    const { data } = await supabase
      .from('blocked_slots').select('*').eq('org_id', orgId)
      .order('date', { ascending: true })
    setBlockedSlots(data ?? [])
  }

  useEffect(() => { fetchAppointments(); fetchBlockedSlots() }, [orgId])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startDate, i)), [startDate])

  const apptsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    days.forEach(d => { map[dayKey(d)] = [] })
    appointments.forEach(a => {
      const k = brtDateStr(new Date(a.scheduled_at))
      if (map[k]) map[k].push(a)
    })
    return map
  }, [appointments, days])

  const blocksByDay = useMemo(() => {
    const map: Record<string, BlockedSlot[]> = {}
    blockedSlots.forEach(b => {
      if (!map[b.date]) map[b.date] = []
      map[b.date].push(b)
    })
    return map
  }, [blockedSlots])

  const startHour = useMemo(() => {
    const visibleAppts = days.flatMap(d => apptsByDay[dayKey(d)] ?? [])
    const earliest = visibleAppts.reduce((min, a) => {
      const h = toBRT(new Date(a.scheduled_at)).getHours(); return h < min ? h : min
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

  function openModal() { setForm(EMPTY); setFormError(''); setShowModal(true); setShowMenu(false) }
  function closeModal() { setShowModal(false) }

  function openBlockModal() {
    setBlockForm(EMPTY_BLOCK)
    setPendingBlocks([])
    setBlockError('')
    setShowBlockModal(true)
    setShowMenu(false)
  }

  function addToPending() {
    if (!blockForm.date) { setBlockError('Selecione uma data.'); return }
    if (!blockForm.all_day && (!blockForm.start_time || !blockForm.end_time)) {
      setBlockError('Informe horário de início e fim.'); return
    }
    if (!blockForm.all_day && blockForm.start_time >= blockForm.end_time) {
      setBlockError('O início deve ser anterior ao fim.'); return
    }
    setBlockError('')

    const start = new Date(blockForm.date + 'T12:00:00')
    const end = blockForm.date_end ? new Date(blockForm.date_end + 'T12:00:00') : start

    if (end < start) { setBlockError('A data fim deve ser posterior à data início.'); return }

    const entries: PendingBlock[] = []
    let cur = new Date(start)
    while (cur <= end) {
      const dateStr = cur.toISOString().slice(0, 10)
      // avoid duplicates
      const alreadyPending = pendingBlocks.some(p => p.date === dateStr && p.all_day === blockForm.all_day && p.start_time === blockForm.start_time)
      const alreadySaved = blockedSlots.some(b => b.date === dateStr)
      if (!alreadyPending && !alreadySaved) {
        entries.push({ ...blockForm, date: dateStr, key: crypto.randomUUID() })
      }
      cur = addDays(cur, 1)
    }

    if (entries.length === 0) {
      setBlockError('Todos os dias selecionados já possuem bloqueio.')
      return
    }

    setPendingBlocks(prev => [...prev, ...entries])
    setBlockForm(f => ({ ...EMPTY_BLOCK, all_day: f.all_day, start_time: f.start_time, end_time: f.end_time }))
  }

  async function handleSaveAllBlocks() {
    if (!orgId || pendingBlocks.length === 0) return
    setSavingBlock(true); setBlockError('')
    const inserts = pendingBlocks.map(b => ({
      org_id: orgId,
      date: b.date,
      all_day: b.all_day,
      start_time: b.all_day ? null : b.start_time,
      end_time: b.all_day ? null : b.end_time,
      reason: b.reason.trim() || null,
    }))
    const { error } = await supabase.from('blocked_slots').insert(inserts)
    setSavingBlock(false)
    if (error) { setBlockError(`Erro: ${error.message}`); return }
    setPendingBlocks([])
    await fetchBlockedSlots()
  }

  async function handleDeleteBlock(id: string) {
    await supabase.from('blocked_slots').delete().eq('id', id)
    setBlockedSlots(prev => prev.filter(b => b.id !== id))
  }

  function openEdit(appt: Appointment) {
    const d = new Date(appt.scheduled_at)
    const brt = toBRT(d)
    setEditForm({
      patient_name: appt.patient_name, patient_phone: appt.patient_phone ?? '',
      specialty: appt.specialty, doctor_name: appt.doctor_name ?? '',
      date: brtDateStr(d),
      time: `${String(brt.getHours()).padStart(2, '0')}:${String(brt.getMinutes()).padStart(2, '0')}`,
      notes: appt.notes ?? '', status: appt.status,
    })
    setEditMode(true)
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!detailAppt) return
    if (!editForm.patient_name.trim() || !editForm.specialty.trim() || !editForm.date || !editForm.time) {
      setFormError('Preencha: nome, especialidade, data e horário.'); return
    }
    const blockMsg = isBlockedTime(editForm.date, editForm.time)
    if (blockMsg) { setFormError(blockMsg); return }
    setSaving(true); setFormError('')
    const { error } = await supabase.from('appointments').update({
      patient_name: editForm.patient_name.trim(), patient_phone: editForm.patient_phone.trim() || '',
      specialty: editForm.specialty.trim(), doctor_name: editForm.doctor_name.trim() || null,
      scheduled_at: `${editForm.date}T${editForm.time}:00-03:00`, notes: editForm.notes.trim() || null, status: editForm.status,
    }).eq('id', detailAppt.id)
    setSaving(false)
    if (error) { setFormError(`Erro: ${error.message}`); return }
    setEditMode(false); setDetailAppt(null); fetchAppointments()
  }

  async function handleStatusChange(status: Appointment['status']) {
    if (!detailAppt) return
    const id = detailAppt.id
    await supabase.from('appointments').update({ status }).eq('id', id)
    setDetailAppt(prev => prev ? { ...prev, status } : null)
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
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
      setFormError('Preencha: nome, especialidade, data e horário.'); return
    }
    const blockMsg = isBlockedTime(form.date, form.time)
    if (blockMsg) { setFormError(blockMsg); return }
    setSaving(true); setFormError('')
    const { error } = await supabase.from('appointments').insert({
      org_id: orgId, patient_name: form.patient_name.trim(), patient_phone: form.patient_phone.trim() || '',
      specialty: form.specialty.trim(), doctor_name: form.doctor_name.trim() || null,
      scheduled_at: `${form.date}T${form.time}:00-03:00`, notes: form.notes.trim() || null, status: form.status,
    })
    setSaving(false)
    if (error) { setFormError(`Erro: ${error.message}`); return }
    closeModal(); fetchAppointments()
  }

  function isBlockedTime(date: string, time: string): string | null {
    const dayBlocks = blockedSlots.filter(b => b.date === date)
    for (const b of dayBlocks) {
      if (b.all_day) return `Este dia está bloqueado na agenda${b.reason ? ` (${b.reason})` : ''}.`
      if (b.start_time && b.end_time && time >= b.start_time && time < b.end_time)
        return `Horário bloqueado das ${b.start_time} às ${b.end_time}${b.reason ? ` — ${b.reason}` : ''}.`
    }
    return null
  }

  function blockTop(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return Math.max(0, ((h - startHour) * 60 + m) / 60 * HOUR_HEIGHT)
  }
  function blockHeight(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    return Math.max(16, ((eh - sh) * 60 + (em - sm)) / 60 * HOUR_HEIGHT)
  }

  const todayKey = dayKey(new Date())
  const rangeLabel = (() => {
    const end = addDays(startDate, 6)
    const f = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ, day: 'numeric', month: 'short' })
    return `${f(startDate)} – ${f(end)}`
  })()

  const visibleBlockCount = days.filter(d => (blocksByDay[dayKey(d)] ?? []).length > 0).length

  return (
    <div className="flex flex-col gap-3">

      {/* ── Top bar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          {(['calendar', 'list'] as ViewMode[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={cn('flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all duration-200',
                view === v ? 'text-white shadow-[0_2px_8px_rgba(37,112,160,0.28)]' : 'text-slate-400 hover:text-slate-600')}
              style={view === v ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)' } : {}}>
              {v === 'calendar' ? <Calendar className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
              {v === 'calendar' ? 'Calendário' : 'Lista'}
            </button>
          ))}
        </div>

        {view === 'calendar' && (
          <>
            <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <button onClick={prev} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <span className="text-[13px] font-semibold text-slate-700 px-2 min-w-[148px] text-center tabular-nums">{rangeLabel}</span>
              <button onClick={next} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <button onClick={goToday} className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              Hoje
            </button>
            {visibleBlockCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200">
                <div className="w-2.5 h-2.5 rounded-sm bg-slate-400" />
                <span className="text-[12px] font-semibold text-slate-600">
                  {visibleBlockCount} dia{visibleBlockCount > 1 ? 's' : ''} bloqueado{visibleBlockCount > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </>
        )}

        {view === 'list' && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar paciente, especialidade..." className="pl-10 h-9 rounded-2xl border-slate-200 bg-white text-sm focus-visible:ring-brand-400"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}

        {/* Novo dropdown */}
        <div className="ml-auto relative" ref={menuRef}>
          <button onClick={() => setShowMenu(v => !v)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white shadow-[0_4px_14px_rgba(44,130,181,0.30)] hover:shadow-[0_6px_20px_rgba(44,130,181,0.42)] hover:-translate-y-[1px] transition-all duration-200"
            style={{ background: 'linear-gradient(135deg, #2C82B5 0%, #2570a0 100%)' }}>
            <Plus className="w-4 h-4" />
            Novo
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-150', showMenu && 'rotate-180')} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-2xl border border-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden min-w-[200px]">
              <button onClick={openModal} className="flex items-center gap-3 w-full px-4 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left">
                <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                </div>
                Agendamento Manual
              </button>
              <div className="mx-4 h-px bg-slate-100" />
              <button onClick={openBlockModal} className="flex items-center gap-3 w-full px-4 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left">
                <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                </div>
                Bloquear Agenda
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Calendar ─────────────────────────────────────────────── */}
      {view === 'calendar' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_16px_rgba(0,0,0,0.04)] overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-5 h-5 border-[2.5px] border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 108px)' }}>
              <div className="w-full">
                <div className="sticky top-0 z-30 flex bg-white border-b border-slate-100 w-full">
                  <div style={{ width: TIME_COL_W, minWidth: TIME_COL_W }} className="shrink-0 border-r border-slate-100" />
                  {days.map((day, i) => {
                    const isToday = dayKey(day) === todayKey
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6
                    const hasBlock = (blocksByDay[dayKey(day)] ?? []).length > 0
                    return (
                      <div key={i} className={cn('flex-1 border-l border-slate-100 py-3 text-center min-w-0',
                        isWeekend && !isToday ? 'bg-slate-50/60' : '', hasBlock ? 'bg-slate-50/80' : '')}>
                        <p className={cn('text-[10px] font-bold uppercase tracking-[0.12em]',
                          isToday ? 'text-brand-500' : hasBlock ? 'text-slate-500' : 'text-slate-400')}>
                          {DAY_PT[day.getDay()]}{hasBlock && <span className="ml-1">🔒</span>}
                        </p>
                        <div className={cn('mt-1.5 mx-auto w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-bold transition-all duration-200',
                          isToday ? 'text-white shadow-[0_4px_10px_rgba(44,130,181,0.35)]' : 'text-slate-600 hover:bg-slate-100')}
                          style={isToday ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)' } : {}}>
                          {day.getDate()}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex w-full relative" style={{ height: totalHeight + 32 }}>
                  <div className="relative shrink-0 bg-white border-r border-slate-100" style={{ width: TIME_COL_W, minWidth: TIME_COL_W }}>
                    {hours.map(h => (
                      <div key={h} className="absolute right-3 flex items-start justify-end" style={{ top: (h - startHour) * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                        <span className="text-[11px] text-slate-400 font-medium pt-1.5 tabular-nums">{String(h).padStart(2, '0')}:00</span>
                      </div>
                    ))}
                  </div>

                  {days.map((day, i) => {
                    const isToday = dayKey(day) === todayKey
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6
                    const dayAppts = apptsByDay[dayKey(day)] ?? []
                    const dayBlocks = blocksByDay[dayKey(day)] ?? []
                    return (
                      <div key={i} className={cn('relative flex-1 min-w-0 border-l border-slate-100',
                        isToday ? 'bg-brand-50/20' : isWeekend ? 'bg-slate-50/40' : '')}
                        style={{ height: totalHeight }}>
                        {hours.map(h => (
                          <div key={h}>
                            <div className="absolute left-0 right-0 border-t border-slate-100" style={{ top: (h - startHour) * HOUR_HEIGHT }} />
                            <div className="absolute left-0 right-0 border-t border-dashed border-slate-50" style={{ top: (h - startHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                          </div>
                        ))}

                        {dayBlocks.map(b => (
                          b.all_day ? (
                            <div key={b.id} className="absolute inset-0 pointer-events-none" style={{ borderLeft: '3px solid #94a3b8' }}>
                              <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(-45deg,rgba(100,116,139,0.06) 0px,rgba(100,116,139,0.06) 4px,transparent 4px,transparent 12px)' }} />
                              {b.reason && (
                                <div className="absolute inset-x-0 top-3 flex justify-center">
                                  <span className="text-[11px] font-semibold text-slate-500 tracking-wide px-1 truncate max-w-full text-center">
                                    {b.reason}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (b.start_time && b.end_time) ? (
                            <div key={b.id} className="absolute left-0 right-0 pointer-events-none overflow-hidden"
                              style={{ top: blockTop(b.start_time), height: blockHeight(b.start_time, b.end_time), borderLeft: '3px solid #94a3b8' }}>
                              <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(-45deg,rgba(100,116,139,0.09) 0px,rgba(100,116,139,0.09) 4px,transparent 4px,transparent 12px)' }} />
                              {b.reason && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-[11px] font-semibold text-slate-500 tracking-wide px-2 truncate max-w-full text-center">
                                    {b.reason}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : null
                        ))}

                        {isToday && nowLine !== null && (
                          <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowLine }}>
                            <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-brand-500" />
                            <div className="h-[1.5px] ml-1" style={{ background: 'linear-gradient(90deg, #2C82B5, rgba(44,130,181,0.15))' }} />
                          </div>
                        )}

                        {dayAppts.map(appt => {
                          const top = apptTop(appt.scheduled_at, startHour)
                          if (top === null) return null
                          const pal = apptPalette(appt.status)
                          const d = new Date(appt.scheduled_at)
                          const time = d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
                          const initials = appt.patient_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                          return (
                            <div key={appt.id} onClick={() => setDetailAppt(appt)}
                              className={cn('absolute left-1 right-1 rounded-xl overflow-hidden cursor-pointer z-10',
                                'shadow-[0_1px_4px_rgba(0,0,0,0.07)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.12)] hover:-translate-y-px transition-all duration-150', pal.bg)}
                              style={{ top: top + 2, minHeight: HOUR_HEIGHT / 2 - 4 }}>
                              <div className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl', pal.bar)} />
                              <div className="pl-3 pr-2 py-1.5 flex items-start gap-1.5">
                                <div className="flex-1 min-w-0">
                                  <p className={cn('text-[11px] font-bold truncate leading-tight', pal.text)}>{appt.patient_name}</p>
                                  <p className={cn('text-[10px] truncate leading-tight mt-0.5 font-medium', pal.sub)}>{time} · {appt.specialty}</p>
                                </div>
                                <span className={cn('shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white', pal.bar)}>{initials}</span>
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
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr] px-6 py-2.5 border-b border-slate-50 gap-4">
            {['Paciente', 'Profissional', 'Data', 'Status'].map((h, i) => (
              <p key={h} className={cn('text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400', i === 3 && 'text-right')}>{h}</p>
            ))}
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-5 h-5 border-[2.5px] border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center mb-3 border border-slate-100"><Calendar className="w-5 h-5 text-slate-300" /></div>
              <p className="text-[13px] font-semibold text-slate-400">Nenhum agendamento encontrado.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50/80">
              {filtered.map((appt, i) => (
                <div key={appt.id} onClick={() => setDetailAppt(appt)}
                  className={cn('grid grid-cols-[2fr_1.5fr_1fr_1fr] items-center px-6 py-3.5 gap-4 cursor-pointer transition-colors hover:bg-slate-50/70 group', i % 2 !== 0 ? 'bg-slate-50/30' : '')}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', { 'bg-blue-400': appt.status === 'scheduled' || appt.status === 'confirmed', 'bg-emerald-400': appt.status === 'completed', 'bg-rose-400': appt.status === 'cancelled' })} />
                    <p className="text-[13px] font-semibold text-gray-900 truncate leading-none">
                      {appt.patient_name}
                      {appt.specialty && <span className="font-normal text-slate-400"> ({appt.specialty.charAt(0).toUpperCase() + appt.specialty.slice(1).toLowerCase()})</span>}
                    </p>
                  </div>
                  <p className="text-[12px] text-slate-500 truncate">{appt.doctor_name ?? '—'}</p>
                  <p className="text-[12px] font-medium text-slate-500 tabular-nums">{formatApptDate(appt.scheduled_at)}</p>
                  <div className="flex justify-end">
                    <Badge variant={statusColors[appt.status] ?? 'outline'} className="text-[10px] font-semibold">{statusLabel(appt.status)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bloquear Agenda Modal ────────────────────────────────── */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowBlockModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 rounded-t-3xl"
              style={{ background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
                  <Lock className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-base font-bold text-white">Bloquear Agenda</h2>
              </div>
              <button onClick={() => setShowBlockModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-4">

              {/* Tipo: dia inteiro / horário */}
              <div className="flex gap-2">
                {[{ v: true, l: 'Dia inteiro' }, { v: false, l: 'Horário específico' }].map(opt => (
                  <button key={String(opt.v)} type="button"
                    onClick={() => setBlockForm(f => ({ ...f, all_day: opt.v }))}
                    className={cn('flex-1 py-2.5 rounded-xl text-[13px] font-semibold border-2 transition-all',
                      blockForm.all_day === opt.v
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white')}>
                    {opt.l}
                  </button>
                ))}
              </div>

              {/* Datas */}
              <RangeCalendar
                start={blockForm.date}
                end={blockForm.date_end}
                onChange={(s, e) => setBlockForm(f => ({ ...f, date: s, date_end: e }))}
              />

              {/* Horário — só quando específico */}
              {!blockForm.all_day && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Início" required>
                    <Input type="time" value={blockForm.start_time}
                      onChange={e => setBlockForm(f => ({ ...f, start_time: e.target.value }))}
                      className="rounded-xl border-slate-200 focus-visible:ring-indigo-400 h-10 text-sm" />
                  </FormField>
                  <FormField label="Fim" required>
                    <Input type="time" value={blockForm.end_time}
                      onChange={e => setBlockForm(f => ({ ...f, end_time: e.target.value }))}
                      className="rounded-xl border-slate-200 focus-visible:ring-indigo-400 h-10 text-sm" />
                  </FormField>
                </div>
              )}

              {/* Motivo */}
              <FormField label="Motivo (opcional)">
                <Input placeholder="Ex: Férias, evento externo..."
                  value={blockForm.reason}
                  onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))}
                  className="rounded-xl border-slate-200 focus-visible:ring-indigo-400 h-10 text-sm" />
              </FormField>

              {blockError && (
                <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{blockError}
                </div>
              )}

              {/* Adicionar à lista */}
              <button type="button" onClick={addToPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-bold border-2 border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 transition-all">
                <Plus className="w-4 h-4" />
                Adicionar à lista
              </button>

              {/* Lista pendente */}
              {pendingBlocks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    A salvar ({pendingBlocks.length} bloqueio{pendingBlocks.length > 1 ? 's' : ''})
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {pendingBlocks.map(b => (
                      <div key={b.key} className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                        <p className="flex-1 text-[12px] font-semibold text-slate-800">
                          {fmtBlockDate(b.date)}
                          <span className="font-normal text-slate-500 ml-1.5">
                            {b.all_day ? '· Dia inteiro' : `· ${b.start_time} – ${b.end_time}`}
                            {b.reason ? ` · ${b.reason}` : ''}
                          </span>
                        </p>
                        <button onClick={() => setPendingBlocks(prev => prev.filter(p => p.key !== b.key))}
                          className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" onClick={() => setShowBlockModal(false)}
                  className="flex-1 rounded-2xl border-slate-200 text-[13px] font-semibold">
                  Fechar
                </Button>
                <button type="button" onClick={handleSaveAllBlocks}
                  disabled={savingBlock || pendingBlocks.length === 0}
                  className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white disabled:opacity-40 transition-all hover:-translate-y-[1px]"
                  style={{ background: 'linear-gradient(135deg, #334155, #1e293b)' }}>
                  {savingBlock ? 'Salvando...' : `Salvar ${pendingBlocks.length > 0 ? pendingBlocks.length : ''} bloqueio${pendingBlocks.length !== 1 ? 's' : ''}`}
                </button>
              </div>

              {/* Bloqueios já salvos */}
              {blockedSlots.length > 0 && (
                <div className="pt-2">
                  <div className="h-px bg-slate-100 mb-4" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Bloqueios salvos</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {blockedSlots.map(b => (
                      <div key={b.id} className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <p className="flex-1 text-[12px] font-medium text-slate-700">
                          {fmtBlockDate(b.date)}
                          <span className="text-slate-400 ml-1.5">
                            {b.all_day ? '· Dia inteiro' : `· ${b.start_time} – ${b.end_time}`}
                            {b.reason ? ` · ${b.reason}` : ''}
                          </span>
                        </p>
                        <button onClick={() => handleDeleteBlock(b.id)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Detail modal ─────────────────────────────────────────── */}
      {detailAppt && (() => {
        const pal = apptPalette(detailAppt.status)
        const d = new Date(detailAppt.scheduled_at)
        const dateStr = d.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        const timeStr = d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => { setDetailAppt(null); setEditMode(false); setShowStatusPicker(false) }} />
            <div className="relative bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] w-full max-w-sm overflow-hidden">
              <div className="flex items-center justify-end gap-1 px-4 pt-3 pb-1">
                {!editMode && <>
                  <div className="relative mr-1">
                    <button onClick={() => setShowStatusPicker(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                      Atualizar Status
                    </button>
                    {showStatusPicker && (
                      <div className="absolute right-0 top-full mt-1 z-10 bg-white rounded-xl border border-slate-200 shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden min-w-[160px]">
                        {STATUS_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => { handleStatusChange(opt.value as Appointment['status']); setShowStatusPicker(false) }}
                            className={cn('flex items-center gap-2 w-full px-4 py-2.5 text-[13px] text-left transition-colors hover:bg-slate-50',
                              detailAppt.status === opt.value ? 'font-semibold text-brand-600 bg-brand-50/50' : 'text-slate-700')}>
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', detailAppt.status === opt.value ? 'bg-brand-500' : 'bg-slate-200')} />
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                  <div className="flex items-start gap-3 px-5 pb-3">
                    <div className={cn('w-3 h-3 rounded-sm mt-1.5 shrink-0', pal.bar)} />
                    <div>
                      <p className="text-[17px] font-semibold text-gray-900 leading-snug">{detailAppt.patient_name}</p>
                      <p className="text-[13px] text-slate-500 mt-0.5 capitalize">{dateStr} · {timeStr}</p>
                      <div className="mt-2"><Badge variant={statusColors[detailAppt.status] ?? 'outline'} className="text-[10px]">{statusLabel(detailAppt.status)}</Badge></div>
                    </div>
                  </div>
                  <div className="mx-5 h-px bg-slate-100" />
                  <div className="px-5 py-4 space-y-3">
                    <GCalRow icon={<Stethoscope className="w-4 h-4" />}>{detailAppt.specialty.charAt(0).toUpperCase() + detailAppt.specialty.slice(1).toLowerCase()}</GCalRow>
                    {detailAppt.doctor_name && <GCalRow icon={<User className="w-4 h-4" />}>{detailAppt.doctor_name}</GCalRow>}
                    {detailAppt.patient_phone && <GCalRow icon={<Phone className="w-4 h-4" />}>{detailAppt.patient_phone}</GCalRow>}
                    {detailAppt.notes && <GCalRow icon={<FileText className="w-4 h-4" />}>{detailAppt.notes}</GCalRow>}
                  </div>
                  <div className="px-5 pb-5 pt-1">
                    <button onClick={() => setDetailAppt(null)} className="w-full py-2 rounded-xl text-[13px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">Fechar</button>
                  </div>
                </>
              ) : (
                <form onSubmit={handleUpdate} className="px-5 pb-5 space-y-3">
                  <p className="text-[13px] font-bold text-gray-900 mb-1">Editar agendamento</p>
                  <FormField label="Nome" required>
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
                      className="flex-1 py-2 rounded-xl text-[13px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">Cancelar</button>
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

      {/* ── New Appointment Modal ───────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeModal} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 rounded-t-3xl"
              style={{ background: 'linear-gradient(135deg, #2C82B5 0%, #1e5f88 100%)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-base font-bold text-white">Agendamento Manual</h2>
              </div>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <FormField label="Nome" required>
                <Input placeholder="Nome completo" value={form.patient_name}
                  onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))}
                  className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Telefone">
                  <Input placeholder="(00) 00000-0000" value={form.patient_phone}
                    onChange={e => setForm(f => ({ ...f, patient_phone: e.target.value }))}
                    className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm" />
                </FormField>
                <FormField label="Especialidade" required>
                  <Input placeholder="Ex: Cardiologia" value={form.specialty}
                    onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                    className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm" />
                </FormField>
              </div>
              <FormField label="Profissional">
                <Input placeholder="Quem irá atendê-lo" value={form.doctor_name}
                  onChange={e => setForm(f => ({ ...f, doctor_name: e.target.value }))}
                  className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Data" required>
                  <Input type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm" />
                </FormField>
                <FormField label="Horário" required>
                  <Input type="time" value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    className="rounded-xl border-slate-200 focus-visible:ring-brand-400 h-10 text-sm" />
                </FormField>
              </div>
              <FormField label="Status">
                <div className="flex gap-2 flex-wrap">
                  {STATUS_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setForm(f => ({ ...f, status: opt.value as FormData['status'] }))}
                      className={cn('px-3.5 py-1.5 rounded-xl text-[13px] font-semibold border transition-all duration-200',
                        form.status === opt.value ? 'text-white border-transparent shadow-[0_2px_8px_rgba(44,130,181,0.26)]' : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white')}
                      style={form.status === opt.value ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)' } : {}}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Observações">
                <textarea className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm min-h-[72px] resize-y focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
                  placeholder="Informações adicionais..." value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </FormField>
              {formError && (
                <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                  <X className="w-4 h-4 shrink-0" />{formError}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1 rounded-2xl border-slate-200 text-[13px] font-semibold">
                  Cancelar
                </Button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white shadow-[0_4px_14px_rgba(44,130,181,0.28)] hover:shadow-[0_6px_20px_rgba(44,130,181,0.38)] hover:-translate-y-[1px] disabled:opacity-60 disabled:hover:translate-y-0 transition-all duration-200"
                  style={{ background: 'linear-gradient(135deg, #2C82B5 0%, #2570a0 100%)' }}>
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

function FormField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {label}{required && <span className="text-rose-400 text-[10px]">*</span>}
      </label>
      {children}
    </div>
  )
}
