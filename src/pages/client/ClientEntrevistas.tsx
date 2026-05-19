import { useEffect, useState } from 'react'
import { CalendarCheck, Clock, Video, MapPin, User, Briefcase, ExternalLink, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

type InterviewStatus =
  | 'AGUARDANDO_RESPOSTA'
  | 'AGENDADA'
  | 'CONFIRMADA'
  | 'REMARCADA'
  | 'CANCELADA'
  | 'REALIZADA'
  | 'APROVADO'

interface Interview {
  id: string
  job_id: string
  candidate_id: string
  slot_date: string | null
  slot_time: string | null
  meeting_link: string | null
  format: string | null
  interviewer_name: string | null
  status: InterviewStatus
  created_at: string
  candidate_name?: string
  candidate_phone?: string
  job_title?: string
}

const STATUS_LABEL: Record<InterviewStatus, string> = {
  AGUARDANDO_RESPOSTA: 'Aguardando',
  AGENDADA:           'Agendada',
  CONFIRMADA:         'Confirmada',
  REMARCADA:          'Remarcada',
  CANCELADA:          'Cancelada',
  REALIZADA:          'Realizada',
  APROVADO:           'Aprovado',
}

const STATUS_STYLE: Record<InterviewStatus, string> = {
  AGUARDANDO_RESPOSTA: 'bg-amber-50 text-amber-700 border-amber-200',
  AGENDADA:           'bg-blue-50 text-blue-700 border-blue-200',
  CONFIRMADA:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  REMARCADA:          'bg-orange-50 text-orange-700 border-orange-200',
  CANCELADA:          'bg-red-50 text-red-600 border-red-200',
  REALIZADA:          'bg-slate-100 text-slate-600 border-slate-200',
  APROVADO:           'bg-green-50 text-green-700 border-green-200',
}

const FILTER_TABS = [
  { key: 'todas',     label: 'Todas' },
  { key: 'ativas',    label: 'Ativas' },
  { key: 'realizadas',label: 'Realizadas' },
  { key: 'canceladas',label: 'Canceladas' },
] as const

type FilterKey = typeof FILTER_TABS[number]['key']

function fmtDate(date: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('pt-BR')
}

export default function ClientEntrevistas() {
  const { orgId } = useAuth()
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('todas')

  useEffect(() => {
    if (!orgId) return
    setLoading(true)

    supabase
      .from('interviews')
      .select(`
        *,
        candidates ( id, status ),
        jobs ( id, title, org_id )
      `)
      .eq('jobs.org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setInterviews(data.map((row: Record<string, unknown>) => ({
            ...row,
            job_title: (row.jobs as { title?: string } | null)?.title ?? '—',
          })) as Interview[])
        }
        setLoading(false)
      })
  }, [orgId])

  const filtered = interviews.filter(i => {
    if (filter === 'ativas')     return ['AGUARDANDO_RESPOSTA','AGENDADA','CONFIRMADA','REMARCADA'].includes(i.status)
    if (filter === 'realizadas') return i.status === 'REALIZADA' || i.status === 'APROVADO'
    if (filter === 'canceladas') return i.status === 'CANCELADA'
    return true
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Entrevistas<span className="text-brand-500">.</span>
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Acompanhe as entrevistas agendadas pelos candidatos.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-white border border-slate-100 rounded-2xl p-1 w-fit shadow-sm">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-bold transition-all',
              filter === tab.key
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-[1.5rem] flex items-center justify-center mb-4">
            <CalendarCheck className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="text-base font-black text-slate-700 mb-1">Nenhuma entrevista encontrada</h3>
          <p className="text-sm text-slate-400 max-w-xs">
            As entrevistas agendadas pelos candidatos via WhatsApp aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(interview => (
            <div
              key={interview.id}
              className="bg-white border border-slate-100 rounded-[1.5rem] px-6 py-5 shadow-[0px_2px_12px_rgba(0,0,0,0.03)] flex items-center gap-5 flex-wrap"
            >
              {/* Status badge */}
              <span className={cn(
                'text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border shrink-0',
                STATUS_STYLE[interview.status] ?? 'bg-slate-100 text-slate-600 border-slate-200',
              )}>
                {STATUS_LABEL[interview.status] ?? interview.status}
              </span>

              {/* Candidate */}
              <div className="flex items-center gap-2 min-w-[140px]">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 leading-none">
                    {interview.candidate_name ?? 'Candidato'}
                  </p>
                  {interview.candidate_phone && (
                    <p className="text-[10px] text-slate-400 mt-0.5">{interview.candidate_phone}</p>
                  )}
                </div>
              </div>

              {/* Job */}
              <div className="flex items-center gap-2 min-w-[120px]">
                <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-sm font-semibold text-slate-600 truncate">{interview.job_title}</span>
              </div>

              {/* Date / time */}
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-600">
                  {fmtDate(interview.slot_date)}
                  {interview.slot_time ? ` às ${interview.slot_time.slice(0, 5)}` : ''}
                </span>
              </div>

              {/* Format */}
              {interview.format && (
                <div className="flex items-center gap-1.5">
                  {interview.format === 'online'
                    ? <Video className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    : <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  <span className="text-sm text-slate-500 capitalize">{interview.format}</span>
                </div>
              )}

              {/* Interviewer */}
              {interview.interviewer_name && (
                <span className="text-xs text-slate-400 font-medium">
                  com {interview.interviewer_name}
                </span>
              )}

              {/* Meet link */}
              {interview.meeting_link && (
                <a
                  href={interview.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors shrink-0"
                >
                  <Video className="w-3.5 h-3.5" />
                  Entrar na Reunião
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
