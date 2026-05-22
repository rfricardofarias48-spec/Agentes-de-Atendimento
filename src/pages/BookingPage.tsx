import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Clock, User, CheckCircle2, AlertCircle, ChevronRight, MapPin, Video } from 'lucide-react'

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

const MONTH_PT  = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const MONTH_EXT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAY_PT    = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const DAY_EXT   = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

function fmtDateLong(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAY_EXT[d.getDay()]}, ${d.getDate()} de ${MONTH_EXT[d.getMonth()]}`
}

type Stage = 'loading' | 'pick' | 'done' | 'error' | 'already_booked' | 'expired'

export default function BookingPage() {
  const { token } = useParams<{ token: string }>()

  const [stage, setStage]               = useState<Stage>('loading')
  const [booking, setBooking]           = useState<BookingInfo | null>(null)
  const [slots, setSlots]               = useState<Slot[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [submitting, setSubmitting]     = useState(false)
  const [errorMsg, setErrorMsg]         = useState('')

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
        const s = data.slots ?? []
        setSlots(s)
        setStage('pick')
        if (s.length) setSelectedDate(s[0].date)
      })
      .catch(() => { setStage('error'); setErrorMsg('Erro de conexão. Tente novamente.') })
  }, [token])

  const availableDates = [...new Set(slots.map(s => s.date))]
  const timesForDate   = slots.filter(s => s.date === selectedDate).map(s => s.time)

  async function handleConfirm() {
    if (!selectedDate || !selectedTime) return
    setSubmitting(true)
    setErrorMsg('')
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

  // ── Error / expired ────────────────────────────────────────────────────
  if (stage === 'error' || stage === 'expired') return (
    <Shell>
      <StatusCard
        icon={<AlertCircle className="w-6 h-6 text-rose-400" />}
        color="rose"
        title={stage === 'expired' ? 'Link expirado' : 'Link inválido'}
        body={errorMsg || 'Este link não está mais disponível.'}
      />
    </Shell>
  )

  // ── Already booked ─────────────────────────────────────────────────────
  if (stage === 'already_booked') return (
    <Shell booking={booking ?? undefined}>
      <StatusCard
        icon={<CheckCircle2 className="w-6 h-6 text-emerald-400" />}
        color="emerald"
        title="Entrevista já confirmada"
        body="Você já escolheu um horário. Verifique seu WhatsApp para os detalhes."
      />
    </Shell>
  )

  // ── Done ───────────────────────────────────────────────────────────────
  if (stage === 'done') return (
    <Shell booking={booking ?? undefined}>
      <div className="flex flex-col items-center text-center px-6 py-12 gap-5">
        <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        </div>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold text-slate-800">Tudo certo!</p>
          <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
            Sua entrevista foi marcada para <span className="font-semibold text-slate-700">{fmtDateLong(selectedDate!)}</span> às <span className="font-semibold text-slate-700">{selectedTime}</span>.
          </p>
          <p className="text-sm text-slate-400">Você receberá a confirmação pelo WhatsApp.</p>
        </div>
        {booking?.format === 'Online' && booking.meeting_link && (
          <a href={booking.meeting_link} target="_blank" rel="noopener noreferrer"
            className="mt-1 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}>
            <Video className="w-4 h-4" />
            Acessar reunião
            <ChevronRight className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </Shell>
  )

  // ── Loading ────────────────────────────────────────────────────────────
  if (stage === 'loading') return (
    <Shell>
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-[#2C82B5] border-t-transparent animate-spin" />
      </div>
    </Shell>
  )

  // ── Pick ───────────────────────────────────────────────────────────────
  return (
    <Shell booking={booking ?? undefined}>
      {slots.length === 0 ? (
        <div className="flex flex-col items-center text-center px-6 py-12 gap-3">
          <Clock className="w-8 h-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">Nenhum horário disponível</p>
          <p className="text-xs text-slate-400">Entre em contato com o recrutador para combinar um horário.</p>
        </div>
      ) : (
        <div className="px-5 py-6 space-y-6">

          {/* Date strip */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-3">Selecione uma data</p>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {availableDates.map(date => {
                const d = new Date(date + 'T12:00:00')
                const active = date === selectedDate
                return (
                  <button key={date}
                    onClick={() => { setSelectedDate(date); setSelectedTime(null) }}
                    className="flex flex-col items-center shrink-0 w-14 py-2.5 rounded-2xl transition-all duration-150 border"
                    style={active
                      ? { background: '#0f172a', borderColor: '#0f172a', color: '#fff' }
                      : { background: '#fff', borderColor: '#e2e8f0', color: '#64748b' }
                    }
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ opacity: active ? 0.6 : 0.8 }}>
                      {DAY_PT[d.getDay()]}
                    </span>
                    <span className="text-[19px] font-black leading-tight">{d.getDate()}</span>
                    <span className="text-[9px] font-semibold capitalize" style={{ opacity: active ? 0.6 : 0.7 }}>
                      {MONTH_PT[d.getMonth()]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Time grid */}
          {selectedDate && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-3">
                Horários — {DAY_PT[new Date(selectedDate + 'T12:00:00').getDay()]}, {new Date(selectedDate + 'T12:00:00').getDate()} de {MONTH_EXT[new Date(selectedDate + 'T12:00:00').getMonth()]}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {timesForDate.map(time => {
                  const active = time === selectedTime
                  return (
                    <button key={time}
                      onClick={() => setSelectedTime(time)}
                      className="py-2.5 rounded-xl border text-[13px] font-semibold transition-all duration-150"
                      style={active
                        ? { background: '#0f172a', borderColor: '#0f172a', color: '#fff' }
                        : { background: '#fff', borderColor: '#e2e8f0', color: '#334155' }
                      }
                    >
                      {time}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 text-xs text-rose-600 border border-rose-100">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{errorMsg}
            </div>
          )}

          {/* Confirm bar */}
          {selectedDate && selectedTime && (
            <div className="space-y-2.5">
              <div className="h-px bg-slate-100" />
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold text-slate-800">{DAY_EXT[new Date(selectedDate + 'T12:00:00').getDay()]}, {new Date(selectedDate + 'T12:00:00').getDate()} de {MONTH_EXT[new Date(selectedDate + 'T12:00:00').getMonth()]}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{selectedTime} · 1 hora</p>
                </div>
                <button
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all"
                  style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
                >
                  {submitting
                    ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    : 'Confirmar'
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}

// ── Status card helper ────────────────────────────────────────────────────
function StatusCard({ icon, color, title, body }: { icon: React.ReactNode; color: 'rose' | 'emerald'; title: string; body: string }) {
  const bg = color === 'rose' ? '#fff1f2' : '#f0fdf4'
  return (
    <div className="flex flex-col items-center text-center px-6 py-12 gap-4">
      <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: bg }}>
        {icon}
      </div>
      <div>
        <p className="text-base font-semibold text-slate-800">{title}</p>
        <p className="text-sm text-slate-400 mt-1 leading-relaxed max-w-xs">{body}</p>
      </div>
    </div>
  )
}

// ── Shell ─────────────────────────────────────────────────────────────────
function Shell({ booking, children }: { booking?: BookingInfo; children: React.ReactNode }) {
  const jobTitle    = booking?.jobs?.title ?? ''
  const orgName     = booking?.organizations?.name ?? ''
  const interviewer = booking?.interviewer_name ?? ''
  const isOnline    = booking?.format === 'Online'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f8f9fb' }}>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">

          {/* Info header */}
          {booking && (
            <div className="mb-4 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{orgName}</p>
              <h1 className="text-xl font-bold text-slate-900 mt-0.5">{jobTitle}</h1>
              <div className="flex items-center gap-3 mt-2">
                {interviewer && (
                  <span className="flex items-center gap-1 text-[12px] text-slate-500">
                    <User className="w-3 h-3" />{interviewer}
                  </span>
                )}
                <span className="flex items-center gap-1 text-[12px] text-slate-500">
                  {isOnline
                    ? <><Video className="w-3 h-3" />Online</>
                    : <><MapPin className="w-3 h-3" />Presencial</>
                  }
                </span>
                <span className="flex items-center gap-1 text-[12px] text-slate-500">
                  <Clock className="w-3 h-3" />60 min
                </span>
              </div>
            </div>
          )}

          {/* Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
            {children}
          </div>

          {/* Discrete footer */}
          <div className="flex justify-center mt-6">
            <img
              src="https://ik.imagekit.io/xsbrdnr0y/Elevva_logo_white_blue_202605221006.png"
              alt="Elevva"
              className="h-5 w-auto object-contain"
              style={{ opacity: 0.18, filter: 'grayscale(1)' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
