import { useEffect, useState, useMemo } from 'react'
import {
  Video, Loader2, ThumbsUp, ThumbsDown, Eye, Trash2,
  User, Briefcase, Search, Calendar,
} from 'lucide-react'
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
  AGENDADA:            'Agendada',
  CONFIRMADA:          'Confirmada',
  REMARCADA:           'Remarcada',
  CANCELADA:           'Cancelada',
  REALIZADA:           'Realizada',
  APROVADO:            'Aprovado',
}

const STATUS_STYLE: Record<InterviewStatus, string> = {
  AGUARDANDO_RESPOSTA: 'bg-amber-50 text-amber-700 border border-amber-200',
  AGENDADA:            'bg-blue-50 text-blue-700 border border-blue-200',
  CONFIRMADA:          'bg-emerald-50 text-emerald-700 border border-emerald-200',
  REMARCADA:           'bg-orange-50 text-orange-700 border border-orange-200',
  CANCELADA:           'bg-red-50 text-red-600 border border-red-200',
  REALIZADA:           'bg-slate-100 text-slate-600 border border-slate-200',
  APROVADO:            'bg-green-50 text-green-700 border border-green-200',
}

function fmtSlot(date: string | null, time: string | null) {
  if (!date) return '—'
  const d = new Date(date + 'T00:00:00')
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const day = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  const t = time ? ` / ${time.slice(0, 5)}` : ''
  return `${weekday}., ${day}${t}`
}

export default function ClientEntrevistas({ onRegisterExport }: { onRegisterExport?: (fn: () => void) => void }) {
  const { orgId } = useAuth()
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)

  // filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [cargoFilter, setCargo] = useState('')
  const [entrevFilter, setEntrev] = useState('')

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    supabase
      .from('interviews')
      .select(`*, candidates ( id, status, analysis_result ), jobs ( id, title, org_id )`)
      .eq('jobs.org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setInterviews(data.map((row: Record<string, unknown>) => {
            const cand = row.candidates as Record<string, unknown> | null
            const ar = cand?.analysis_result as { candidateName?: string; phoneNumbers?: string[] } | null
            return {
              ...row,
              job_title:      (row.jobs as { title?: string } | null)?.title ?? '—',
              candidate_name: ar?.candidateName ?? 'Candidato',
              candidate_phone: (ar?.phoneNumbers ?? [])[0] ?? null,
            }
          }) as Interview[])
        }
        setLoading(false)
      })
  }, [orgId])

  const jobTitles = useMemo(() => [...new Set(interviews.map(i => i.job_title ?? '').filter(Boolean))], [interviews])

  const filtered = useMemo(() => interviews.filter(i => {
    if (dateFrom && i.slot_date && i.slot_date < dateFrom) return false
    if (dateTo   && i.slot_date && i.slot_date > dateTo)   return false
    if (cargoFilter && i.job_title !== cargoFilter) return false
    if (entrevFilter && !(i.interviewer_name ?? '').toLowerCase().includes(entrevFilter.toLowerCase())) return false
    return true
  }), [interviews, dateFrom, dateTo, cargoFilter, entrevFilter])

  async function handleUpdateStatus(id: string, status: InterviewStatus) {
    await supabase.from('interviews').update({ status }).eq('id', id)
    setInterviews(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  async function handleDelete(id: string) {
    await supabase.from('interviews').delete().eq('id', id)
    setInterviews(prev => prev.filter(i => i.id !== id))
  }

  useEffect(() => { onRegisterExport?.(exportCsv) }, [filtered]) // eslint-disable-line

  function exportCsv() {
    const rows = [
      ['Candidato', 'Vaga', 'Entrevistador', 'Status', 'Data', 'Hora', 'Link'].join(','),
      ...filtered.map(i => [
        i.candidate_name ?? '',
        i.job_title ?? '',
        i.interviewer_name ?? '',
        STATUS_LABEL[i.status] ?? i.status,
        i.slot_date ?? '',
        i.slot_time ?? '',
        i.meeting_link ?? '',
      ].join(',')),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'entrevistas.csv'
    a.click()
  }

  return (
    <div className="space-y-5">

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 shadow-sm flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Data Inicial</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Data Final</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cargo</label>
          <select
            value={cargoFilter}
            onChange={e => setCargo(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
          >
            <option value="">Todos</option>
            {jobTitles.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Entrevistador</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={entrevFilter}
              onChange={e => setEntrev(e.target.value)}
              className="h-9 pl-8 pr-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </div>
        {(dateFrom || dateTo || cargoFilter || entrevFilter) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setCargo(''); setEntrev('') }}
            className="h-9 px-3 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-[1.5rem] flex items-center justify-center mb-3">
              <Calendar className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-black text-slate-700 mb-1">Nenhuma entrevista encontrada</h3>
            <p className="text-xs text-slate-400 max-w-xs">
              As entrevistas agendadas pelos candidatos via WhatsApp aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Candidato</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Vaga</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Entrevistador</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Status</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Data &amp; Hora</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Link</th>
                  <th className="text-right px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(interview => (
                  <tr key={interview.id} className="hover:bg-slate-50/60 transition-colors group">

                    {/* Candidato */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 leading-none text-[13px]">
                            {interview.candidate_name ?? 'Candidato'}
                          </p>
                          {interview.candidate_phone && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{interview.candidate_phone}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Vaga */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-600 text-[13px] truncate max-w-[140px]">
                          {interview.job_title}
                        </span>
                      </div>
                    </td>

                    {/* Entrevistador */}
                    <td className="px-5 py-3.5">
                      <span className="text-slate-600 text-[13px]">
                        {interview.interviewer_name ?? <span className="text-slate-300">—</span>}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <span className={cn(
                        'text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full',
                        STATUS_STYLE[interview.status] ?? 'bg-slate-100 text-slate-600 border border-slate-200',
                      )}>
                        {STATUS_LABEL[interview.status] ?? interview.status}
                      </span>
                    </td>

                    {/* Data & Hora */}
                    <td className="px-5 py-3.5">
                      <span className="text-slate-600 text-[13px] whitespace-nowrap">
                        {fmtSlot(interview.slot_date, interview.slot_time)}
                      </span>
                    </td>

                    {/* Link */}
                    <td className="px-5 py-3.5">
                      {interview.meeting_link ? (
                        <a
                          href={interview.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition-colors w-fit"
                        >
                          <Video className="w-3 h-3" />
                          Entrar
                        </a>
                      ) : (
                        <span className="text-slate-300 text-[13px]">—</span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleUpdateStatus(interview.id, 'APROVADO')}
                          title="Aprovar"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(interview.id, 'CANCELADA')}
                          title="Recusar"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Ver candidato"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(interview.id)}
                          title="Excluir"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer count */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {filtered.length} entrevista{filtered.length !== 1 ? 's' : ''}
                {filtered.length !== interviews.length ? ` de ${interviews.length}` : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
