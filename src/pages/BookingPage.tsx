import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Calendar, Clock, User, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react'

interface Slot { date: string; time: string }
interface BookingInfo {
  candidate_name: string
  interviewer_name: string
  format: string
  meeting_link?: string
  status: string
  jobs: { title: string }
  organizations: { name: string }
}

const MONTH_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const DAY_PT   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAY_PT[d.getDay()]}, ${d.getDate()} ${MONTH_PT[d.getMonth()]}`
}

function fmtDateLong(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  })
}

type Stage = 'loading' | 'pick' | 'confirm' | 'done' | 'error' | 'already_booked' | 'expired'

export default function BookingPage() {
  const { token } = useParams<{ token: string }>()

  const [stage, setStage]         = useState<Stage>('loading')
  const [booking, setBooking]     = useState<BookingInfo | null>(null)
  const [slots, setSlots]         = useState<Slot[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg]   = useState('')

  useEffect(() => {
    if (!token) { setStage('error'); return }
    fetch(`/api/candidates/schedule-interviews?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setStage(data.error.includes('xpirado') ? 'expired' : 'error')
          setErrorMsg(data.error)
          return
        }
        setBooking(data.booking)
        if (data.alreadyBooked) { setStage('already_booked'); return }
        setSlots(data.slots ?? [])
        setStage('pick')
        // Pre-select first date
        if (data.slots?.length) setSelectedDate(data.slots[0].date)
      })
      .catch(() => { setStage('error'); setErrorMsg('Erro de conexão. Tente novamente.') })
  }, [token])

  const availableDates = [...new Set(slots.map(s => s.date))]
  const timesForDate   = slots.filter(s => s.date === selectedDate).map(s => s.time)

  async function handleConfirm() {
    if (!selectedDate || !selectedTime) return
    setSubmitting(true)
    try {
      const r = await fetch(`/api/candidates/schedule-interviews?token=${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, time: selectedTime }),
      })
      const data = await r.json()
      if (!r.ok) {
        setErrorMsg(data.error ?? 'Erro ao confirmar.')
        if (data.error?.includes('reservado')) {
          // Reload slots
          setSelectedTime(null)
          const fresh = await fetch(`/api/candidates/schedule-interviews?token=${token}`).then(x => x.json())
          setSlots(fresh.slots ?? [])
        }
        setSubmitting(false)
        return
      }
      setStage('done')
    } catch {
      setErrorMsg('Erro de conexão. Tente novamente.')
    }
    setSubmitting(false)
  }

  // ── States ──────────────────────────────────────────────────────────────
  if (stage === 'loading') return (
    <PageShell>
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-8 h-8 rounded-full border-[3px] border-[#2C82B5] border-t-transparent animate-spin" />
        <p className="text-sm text-slate-500">Carregando horários...</p>
      </div>
    </PageShell>
  )

  if (stage === 'error' || stage === 'expired') return (
    <PageShell>
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-red-400" />
        </div>
        <div>
          <p className="text-lg font-bold text-slate-800">{stage === 'expired' ? 'Link expirado' : 'Link inválido'}</p>
          <p className="text-sm text-slate-500 mt-1">{errorMsg || 'Este link não está mais disponível.'}</p>
        </div>
      </div>
    </PageShell>
  )

  if (stage === 'already_booked') return (
    <PageShell booking={booking ?? undefined}>
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-emerald-500" />
        </div>
        <div>
          <p className="text-lg font-bold text-slate-800">Entrevista já agendada!</p>
          <p className="text-sm text-slate-500 mt-1">Você já escolheu um horário. Verifique seu WhatsApp para os detalhes.</p>
        </div>
      </div>
    </PageShell>
  )

  if (stage === 'done') return (
    <PageShell booking={booking ?? undefined}>
      <div className="flex flex-col items-center justify-center py-16 gap-5 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <div>
          <p className="text-xl font-black text-slate-900">Entrevista confirmada!</p>
          <p className="text-sm text-slate-500 mt-2">
            Sua entrevista foi agendada para <strong>{fmtDateLong(selectedDate!)}</strong> às <strong>{selectedTime}</strong>.
          </p>
          <p className="text-sm text-slate-500 mt-1">Enviamos uma confirmação para o seu WhatsApp.</p>
        </div>
        {booking?.format === 'Online' && booking.meeting_link && (
          <a href={booking.meeting_link} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}>
            Acessar reunião
            <ChevronRight className="w-4 h-4" />
          </a>
        )}
      </div>
    </PageShell>
  )

  // ── Pick stage ───────────────────────────────────────────────────────────
  return (
    <PageShell booking={booking ?? undefined}>
      {slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center">
            <Calendar className="w-7 h-7 text-slate-400" />
          </div>
          <div>
            <p className="text-base font-bold text-slate-700">Nenhum horário disponível</p>
            <p className="text-sm text-slate-500 mt-1">Entre em contato com o recrutador para combinar um horário.</p>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-6 space-y-5">
          {/* Date selector */}
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2.5">Escolha uma data</p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {availableDates.map(date => {
                const d = new Date(date + 'T12:00:00')
                const isSelected = date === selectedDate
                return (
                  <button
                    key={date}
                    onClick={() => { setSelectedDate(date); setSelectedTime(null) }}
                    className="flex flex-col items-center shrink-0 px-3.5 py-2.5 rounded-2xl border-2 transition-all duration-150"
                    style={isSelected
                      ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)', borderColor: '#2C82B5', color: 'white' }
                      : { background: 'white', borderColor: '#e2e8f0', color: '#475569' }
                    }
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">{DAY_PT[d.getDay()]}</span>
                    <span className="text-xl font-black leading-tight">{d.getDate()}</span>
                    <span className="text-[10px] font-semibold capitalize">{MONTH_PT[d.getMonth()]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Time slots */}
          {selectedDate && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2.5">
                Horários disponíveis — {fmtDate(selectedDate)}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {timesForDate.map(time => {
                  const isSelected = time === selectedTime
                  return (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-bold transition-all duration-150"
                      style={isSelected
                        ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)', borderColor: '#2C82B5', color: 'white' }
                        : { background: 'white', borderColor: '#e2e8f0', color: '#334155' }
                      }
                    >
                      <Clock className="w-3.5 h-3.5" style={{ opacity: 0.7 }} />
                      {time}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0" />{errorMsg}
            </div>
          )}

          {/* Confirm */}
          {selectedDate && selectedTime && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <Calendar className="w-4 h-4 text-[#2C82B5] shrink-0" />
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Selecionado</p>
                  <p className="text-sm font-black text-slate-800">{fmtDateLong(selectedDate)} · {selectedTime}</p>
                </div>
              </div>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="w-full py-3.5 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
              >
                {submitting
                  ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : <><CheckCircle2 className="w-4 h-4" /> Confirmar este horário</>
                }
              </button>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────
function PageShell({ booking, children }: { booking?: BookingInfo; children: React.ReactNode }) {
  const jobTitle   = booking?.jobs?.title ?? ''
  const orgName    = booking?.organizations?.name ?? ''
  const interviewer = booking?.interviewer_name ?? ''

  return (
    <div className="min-h-screen" style={{ background: '#f0f2f5' }}>
      {/* Header */}
      <div style={{ background: '#0f172a' }} className="px-4 pt-10 pb-6">
        <div className="max-w-lg mx-auto">
          <img
            src="https://ik.imagekit.io/xsbrdnr0y/Elevva_logo_white_blue_202605221006.png"
            alt="Logo"
            className="h-10 w-auto object-contain mb-6"
          />
          {booking && (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.6)' }}>
                {orgName}
              </p>
              <h1 className="text-xl font-black text-white">{jobTitle}</h1>
              {interviewer && (
                <div className="flex items-center gap-1.5 pt-1">
                  <User className="w-3.5 h-3.5" style={{ color: '#2C82B5' }} />
                  <p className="text-sm font-semibold" style={{ color: 'rgba(148,163,184,0.8)' }}>
                    {interviewer}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Card */}
      <div className="max-w-lg mx-auto px-4 -mt-4">
        <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden mb-8">
          {children}
        </div>
        <p className="text-center text-[11px] text-slate-400 pb-8">
          Powered by Elevva · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
