import { useEffect, useState, useMemo } from 'react'
import {
  Video, Loader2, ThumbsUp, ThumbsDown, Eye, Trash2,
  Search, Calendar, CheckCircle, X,
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
  org_id: string
  slot_date: string | null
  slot_time: string | null
  meeting_link: string | null
  format: string | null
  interviewer_name: string | null
  status: InterviewStatus
  created_at: string
  candidate_name: string | null
  candidate_phone: string | null
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

function fmtName(full: string | null): string {
  if (!full) return '—'
  const parts = full.trim().split(/\s+/).filter(Boolean)
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  if (parts.length === 1) return cap(parts[0])
  return `${cap(parts[0])} ${cap(parts[parts.length - 1])}`
}

function fmtSlot(date: string | null, time: string | null) {
  if (!date) return '—'
  const d = new Date(date + 'T00:00:00')
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  if (!time) return `${day}/${month}`
  const [h, m] = time.split(':').map(Number)
  const timePart = m === 0 ? `${h}h` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return `${day}/${month} - ${timePart}`
}

export default function ClientEntrevistas({ onRegisterExport }: { onRegisterExport?: (fn: () => void) => void }) {
  const { orgId } = useAuth()
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)

  // approval confirmation modal
  const [confirmApprove, setConfirmApprove] = useState<Interview | null>(null)
  const [approving, setApproving] = useState(false)
  const [successMsg, setSuccessMsg] = useState(false)

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
      .select('*, jobs ( id, title )')
      .eq('org_id', orgId)
      .order('slot_date', { ascending: true })
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

    // Final approval from interview → mark candidate as selected (goes to Aprovados tab)
    if (status === 'APROVADO') {
      const interview = interviews.find(i => i.id === id)
      if (interview?.candidate_id) {
        await supabase.from('candidates')
          .update({ is_selected: true, status: 'HIRED' })
          .eq('id', interview.candidate_id)
      }
    }
    // Cancelled from interview → ensure candidate is not marked as selected
    if (status === 'CANCELADA') {
      const interview = interviews.find(i => i.id === id)
      if (interview?.candidate_id) {
        await supabase.from('candidates')
          .update({ is_selected: false })
          .eq('id', interview.candidate_id)
      }
    }
  }

  async function handleDelete(id: string) {
    await supabase.from('interviews').delete().eq('id', id)
    setInterviews(prev => prev.filter(i => i.id !== id))
  }

  async function handleViewResume(candidateId: string) {
    const { data } = await supabase
      .from('candidates').select('file_path').eq('id', candidateId).single()
    if (!data?.file_path) return
    const { data: url } = await supabase.storage.from('resumes').createSignedUrl(data.file_path, 300)
    if (url?.signedUrl) window.open(url.signedUrl, '_blank')
  }

  async function handleApproveConfirmed() {
    if (!confirmApprove) return
    setApproving(true)
    try {
      await fetch('/api/candidates/schedule-interviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId: confirmApprove.id,
          candidateId: confirmApprove.candidate_id,
          orgId: confirmApprove.org_id,
          outcome: 'approved',
        }),
      })
      setInterviews(prev => prev.map(i =>
        i.id === confirmApprove.id ? { ...i, status: 'APROVADO' } : i
      ))
      setConfirmApprove(null)
      setSuccessMsg(true)
      setTimeout(() => setSuccessMsg(false), 7000)
    } finally {
      setApproving(false)
    }
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

      {/* Success toast */}
      {successMsg && (
        <div className="fixed bottom-6 right-6 z-50 max-w-[340px] w-full">
          <div className="bg-white rounded-[1.25rem] shadow-2xl border border-slate-100 overflow-hidden">
            <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #2C82B5, #4fa8d8)' }} />
            <div className="px-5 py-4 flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(44,130,181,0.1)' }}>
                <CheckCircle className="w-4.5 h-4.5" style={{ color: '#2C82B5' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-black text-slate-900 leading-snug">Candidato aprovado! 🎉</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Bento acabou de comunicar o candidato da aprovação, ele foi instruído a aguardar os próximos passos.
                </p>
              </div>
              <button
                onClick={() => setSuccessMsg(false)}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors shrink-0 mt-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmApprove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            onClick={() => !approving && setConfirmApprove(null)}
          />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-[380px] overflow-hidden animate-in zoom-in-95 fade-in duration-200">

            {/* Header band */}
            <div className="px-7 pt-7 pb-6">
              {/* Icon */}
              <div className="w-14 h-14 rounded-[1.25rem] flex items-center justify-center mb-5" style={{ background: 'rgba(44,130,181,0.1)' }}>
                <ThumbsUp className="w-6 h-6" style={{ color: '#2C82B5' }} />
              </div>

              {/* Title */}
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: '#2C82B5' }}>
                Confirmação
              </p>
              <h2 className="text-xl font-black text-slate-900 leading-tight mb-4">
                Aprovar para a vaga?
              </h2>

              {/* Candidate chip */}
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-black" style={{ background: 'rgba(44,130,181,0.12)', color: '#2C82B5' }}>
                  {fmtName(confirmApprove.candidate_name).split(' ').map(w => w[0]).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-black text-slate-900 leading-none truncate">
                    {fmtName(confirmApprove.candidate_name)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {confirmApprove.job_title ?? 'Vaga não identificada'}
                  </p>
                </div>
              </div>

              {/* Note */}
              <p className="text-[12px] text-slate-400 leading-relaxed">
                Se confirmar, <span className="font-bold text-slate-500">Bento</span> irá notificar o candidato pelo WhatsApp sobre a aprovação.
              </p>
            </div>

            {/* Divider */}
            <div className="h-px bg-slate-100 mx-7" />

            {/* Actions */}
            <div className="px-7 py-5 flex gap-3">
              <button
                onClick={() => setConfirmApprove(null)}
                disabled={approving}
                className="flex-1 h-11 rounded-xl border border-slate-200 text-[13px] font-black text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleApproveConfirmed}
                disabled={approving}
                className="flex-1 h-11 rounded-xl text-[13px] font-black text-white shadow-lg transition-all disabled:opacity-70 flex items-center justify-center gap-2 hover:shadow-xl hover:brightness-105 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #2C82B5, #1e6a97)' }}
              >
                {approving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ThumbsUp className="w-3.5 h-3.5" />
                    Sim, aprovar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Candidato</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Vaga</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Entrevistador</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Status</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Data &amp; Hora</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Link</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(interview => (
                  <tr key={interview.id} className="hover:bg-slate-50/60 transition-colors group">

                    {/* Candidato */}
                    <td className="px-4 py-2 text-center">
                      <p className="font-bold text-slate-900 text-[13px]">
                        {fmtName(interview.candidate_name)}
                      </p>
                    </td>

                    {/* Vaga */}
                    <td className="px-4 py-2 text-center">
                      <span className="font-semibold text-slate-600 text-[13px] truncate max-w-[140px] inline-block">
                        {interview.job_title}
                      </span>
                    </td>

                    {/* Entrevistador */}
                    <td className="px-4 py-2 text-center">
                      <span className="text-slate-600 text-[13px]">
                        {interview.interviewer_name ?? <span className="text-slate-300">—</span>}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2 text-center">
                      <span className={cn(
                        'inline-block text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full',
                        STATUS_STYLE[interview.status] ?? 'bg-slate-100 text-slate-600 border border-slate-200',
                      )}>
                        {STATUS_LABEL[interview.status] ?? interview.status}
                      </span>
                    </td>

                    {/* Data & Hora */}
                    <td className="px-4 py-2 text-center">
                      <span className="text-slate-600 text-[13px] whitespace-nowrap font-medium">
                        {fmtSlot(interview.slot_date, interview.slot_time)}
                      </span>
                    </td>

                    {/* Link */}
                    <td className="px-4 py-2 text-center">
                      {interview.meeting_link ? (
                        <a
                          href={interview.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition-colors"
                        >
                          <Video className="w-3 h-3" />
                          Entrar
                        </a>
                      ) : (
                        <span className="text-slate-300 text-[13px]">—</span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setConfirmApprove(interview)}
                          title="Aprovar"
                          className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                            interview.status === 'APROVADO'
                              ? "bg-emerald-50 text-emerald-600"
                              : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                          )}
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
                          onClick={() => interview.candidate_id && handleViewResume(interview.candidate_id)}
                          title="Ver currículo"
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
