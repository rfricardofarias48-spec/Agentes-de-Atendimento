import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, FileText, Calendar, MapPin, Briefcase,
  CheckCircle, ChevronDown, ChevronUp,
  ThumbsUp, Loader2, Clock, Building2, Phone,
  AlertCircle, X, Send, Eye, Trash2, Check,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

interface Candidate {
  id: string
  job_id: string
  org_id: string
  status: string
  is_selected: boolean
  created_at: string
  candidate_name?: string
  candidate_phone?: string
  file_path?: string | null
  analysis_result?: {
    candidateName?: string
    matchScore?: number
    yearsExperience?: string
    city?: string
    neighborhood?: string
    summary?: string
    pros?: string[]
    cons?: string[]
    workHistory?: { role: string; company: string; duration: string }[]
    phoneNumbers?: string[]
  } | null
}

interface Job {
  id: string
  title: string
  criteria: string
  org_id: string
}

// ── Circular score gauge ────────────────────────────────────────────────────
function ScoreCircle({ score, rank }: { score: number; rank: number }) {
  const size    = 64
  const stroke  = 5
  const r       = (size - stroke * 2) / 2
  const circ    = 2 * Math.PI * r
  const pct     = Math.min(score / 10, 1)
  const offset  = circ * (1 - pct)

  const color =
    score >= 7 ? '#10b981' :
    score >= 4 ? '#f59e0b' :
                 '#ef4444'

  const rankColors: Record<number, string> = {
    1: 'bg-[#2C82B5] text-white',
    2: 'bg-slate-500 text-white',
    3: 'bg-amber-600 text-white',
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-base font-black text-slate-800">{score.toFixed(1)}</span>
      </div>
      <div className={cn(
        'absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black',
        rankColors[rank] ?? 'bg-slate-200 text-slate-600',
      )}>
        #{rank}
      </div>
    </div>
  )
}


export default function ClientCandidatos() {
  const { jobId } = useParams<{ jobId: string }>()
  const { orgId } = useAuth()
  const navigate  = useNavigate()

  const [job, setJob]             = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading]     = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({
    format: 'Online', meetingLink: '', interviewer: '',
  })
  const [showCandidateList, setShowCandidateList] = useState(false)

  const fetchData = useCallback(async () => {
    if (!jobId || !orgId) return
    setLoading(true)
    const [{ data: jobData }, { data: cands }] = await Promise.all([
      supabase.from('jobs').select('id, title, criteria, org_id').eq('id', jobId).single(),
      supabase.from('candidates').select('*').eq('job_id', jobId).eq('org_id', orgId).order('created_at', { ascending: false }),
    ])
    if (jobData) setJob(jobData as Job)
    if (cands)   setCandidates(cands as Candidate[])
    setLoading(false)
  }, [jobId, orgId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleApprove = async (c: Candidate) => {
    setUpdatingId(c.id)
    const next = c.status === 'APPROVED' ? 'COMPLETED' : 'APPROVED'
    const { error } = await supabase.from('candidates')
      .update({ status: next, is_selected: next === 'APPROVED' }).eq('id', c.id)
    if (!error) setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: next, is_selected: next === 'APPROVED' } : x))
    setUpdatingId(null)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    await supabase.from('candidates').delete().eq('id', id)
    setCandidates(prev => prev.filter(c => c.id !== id))
    setConfirmDeleteId(null)
    setDeletingId(null)
  }

  const handleSchedule = async () => {
    if (!scheduleForm.interviewer.trim()) return
    setScheduling(true)
    try {
      const approved = candidates.filter(c => c.status === 'APPROVED')
      await fetch('/api/candidates/schedule-interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId, orgId,
          candidateIds: approved.map(c => c.id),
          format: scheduleForm.format,
          meetingLink: scheduleForm.meetingLink,
          interviewer: scheduleForm.interviewer,
        }),
      })
      setShowScheduleModal(false)
      alert(`Links de agendamento enviados para ${approved.length} candidato(s) via WhatsApp!`)
      fetchData()
    } catch { alert('Erro ao enviar links. Tente novamente.') }
    setScheduling(false)
  }

  const handleViewPdf = async (c: Candidate) => {
    if (!c.file_path) return
    const { data } = await supabase.storage.from('resumes').createSignedUrl(c.file_path, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const getName  = (c: Candidate) => c.analysis_result?.candidateName || c.candidate_name || 'Nome não identificado'
  const getScore = (c: Candidate) => c.analysis_result?.matchScore ?? 0
  const sorted   = [...candidates].sort((a, b) => getScore(b) - getScore(a))
  const approved = candidates.filter(c => c.status === 'APPROVED')

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
    </div>
  )

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: fixed; inset: 0; padding: 32px; background: white; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="space-y-4 no-print">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard/vagas')}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  {job?.title ?? 'Candidatos'}<span className="text-[#2C82B5]">.</span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {candidates.length} {candidates.length === 1 ? 'Currículo' : 'Currículos'}
                {approved.length > 0 && <span className="ml-2 text-emerald-600 font-bold">· {approved.length} aprovado(s)</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <FileText className="w-3.5 h-3.5" /> Relatório
            </button>
            <button
              disabled={approved.length === 0}
              onClick={() => setShowScheduleModal(true)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all',
                approved.length > 0
                  ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-[0_4px_14px_rgba(0,0,0,0.15)]'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed',
              )}
            >
              <Calendar className="w-3.5 h-3.5" /> Agendar Entrevistas
              {approved.length > 0 && (
                <span className="bg-[#2C82B5] text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{approved.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* ── Empty state ── */}
        {candidates.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-[2rem] border border-slate-100 shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-[1.5rem] flex items-center justify-center mb-4">
              <Briefcase className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-base font-black text-slate-700 mb-1">Nenhum currículo recebido</h3>
            <p className="text-sm text-slate-400 max-w-xs">Os candidatos que enviarem PDF para esta vaga aparecerão aqui.</p>
          </div>
        )}

        {/* ── Candidate list ── */}
        <div className="space-y-2">
          {sorted.map((c, idx) => {
            const name     = getName(c)
            const score    = getScore(c)
            const ar       = c.analysis_result
            const isOpen   = expandedId === c.id
            const isApproved = c.status === 'APPROVED'
            const isLoading  = updatingId === c.id
            const isDeleting = deletingId === c.id
            const rank     = idx + 1

            return (
              <div
                key={c.id}
                className={cn(
                  'relative rounded-2xl border bg-white transition-all duration-200 overflow-hidden',
                  isApproved
                    ? 'border-emerald-200 shadow-sm'
                    : isOpen
                    ? 'border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.07)]'
                    : 'border-slate-100 shadow-sm hover:border-slate-200 hover:shadow',
                )}
                onMouseLeave={() => confirmDeleteId === c.id && setConfirmDeleteId(null)}
              >
                {/* Accent bar esquerda para aprovados */}
                {isApproved && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-400 rounded-l-2xl" />
                )}

                {/* ── Row ── */}
                <div className="flex items-center gap-4 px-5 py-3.5">

                  {/* Score circle */}
                  <div
                    className="cursor-pointer"
                    onClick={() => setExpandedId(isOpen ? null : c.id)}
                  >
                    <ScoreCircle score={score} rank={rank} />
                  </div>

                  {/* Name + tags */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedId(isOpen ? null : c.id)}
                  >
                    <p className="text-sm font-black text-slate-900 truncate">{name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {ar?.yearsExperience && ar.yearsExperience !== '-' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200">
                          <Briefcase className="w-2.5 h-2.5" />
                          {ar.yearsExperience}
                        </span>
                      )}
                      {ar?.city && ar.city !== '-' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200">
                          <MapPin className="w-2.5 h-2.5" />
                          {ar.city}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* View PDF */}
                    <button
                      onClick={() => handleViewPdf(c)}
                      disabled={!c.file_path}
                      className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-50 border border-slate-200 text-slate-400 hover:text-[#2C82B5] hover:bg-blue-50 hover:border-blue-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      title="Ver PDF original"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    {confirmDeleteId === c.id ? (
                      <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-2 py-1">
                        <span className="text-[10px] font-black text-red-600">Apagar?</span>
                        <button
                          onClick={() => handleDelete(c.id)}
                          disabled={isDeleting}
                          className="w-5 h-5 flex items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all"
                        >
                          {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="w-5 h-5 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(c.id)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-50 border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-all"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Approve button */}
                    <button
                      disabled={isLoading}
                      onClick={() => handleApprove(c)}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all',
                        isApproved
                          ? 'bg-emerald-500 text-white shadow-[0_2px_10px_rgba(16,185,129,0.35)] hover:bg-emerald-600'
                          : 'bg-slate-900 text-white hover:bg-slate-700 shadow-sm',
                      )}
                    >
                      {isLoading
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : isApproved
                        ? <><ThumbsUp className="w-3.5 h-3.5 fill-current" /> Aprovado</>
                        : <><ThumbsUp className="w-3.5 h-3.5" /> Aprovar</>
                      }
                    </button>

                    {/* Expand */}
                    <button
                      onClick={() => setExpandedId(isOpen ? null : c.id)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                    >
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* ── Expanded detail ── */}
                {isOpen && (
                  <div className="border-t border-slate-100 px-6 pb-6 pt-5 space-y-5">

                    {/* Analysis summary */}
                    {ar?.summary && (
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#2C82B5] inline-block" />
                          Análise Profissional
                        </p>
                        <p className="text-sm text-slate-600 leading-relaxed">{ar.summary}</p>
                      </div>
                    )}

                    {/* Pros + Cons */}
                    {((ar?.pros?.length ?? 0) > 0 || (ar?.cons?.length ?? 0) > 0) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {ar?.pros && ar.pros.length > 0 && (
                          <div className="rounded-xl p-4 bg-white border border-emerald-200">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2.5 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Pontos Fortes
                            </p>
                            <ul className="space-y-1.5">
                              {ar.pros.map((p, i) => (
                                <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  {p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {ar?.cons && ar.cons.length > 0 && (
                          <div className="rounded-xl p-4 bg-white border border-red-200">
                            <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2.5 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Pontos de Atenção
                            </p>
                            <ul className="space-y-1.5">
                              {ar.cons.map((c, i) => (
                                <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                                  {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Work history */}
                    {ar?.workHistory && ar.workHistory.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                          Experiências Recentes
                        </p>
                        <div className="space-y-1.5">
                          {ar.workHistory.map((w, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-slate-100">
                              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-black text-slate-700">{w.company}</span>
                                <span className="text-xs text-slate-400 mx-1.5">·</span>
                                <span className="text-xs text-slate-500">{w.role}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0">
                                <Clock className="w-3 h-3" /> {w.duration}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Contacts — apenas o número que enviou o currículo via WhatsApp */}
                    {c.candidate_phone && (
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                          Contatos
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 font-medium">
                            <Phone className="w-3 h-3 text-slate-400" /> {c.candidate_phone}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Print area ── */}
      <div className="print-area hidden">
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>{job?.title} — Relatório de Candidatos</h1>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 24 }}>
          Gerado em {new Date().toLocaleDateString('pt-BR')} · {candidates.length} candidatos · {approved.length} aprovados
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              {['#', 'Nome', 'Score', 'Experiência', 'Cidade', 'Telefone', 'Status'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 900, color: '#475569', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{i + 1}</td>
                <td style={{ padding: '8px 10px', fontWeight: 700 }}>{getName(c)}</td>
                <td style={{ padding: '8px 10px', fontWeight: 900, color: getScore(c) >= 7 ? '#059669' : getScore(c) >= 4 ? '#d97706' : '#dc2626' }}>{getScore(c).toFixed(1)}</td>
                <td style={{ padding: '8px 10px', color: '#64748b' }}>{c.analysis_result?.yearsExperience ?? '—'}</td>
                <td style={{ padding: '8px 10px', color: '#64748b' }}>{c.analysis_result?.city ?? '—'}</td>
                <td style={{ padding: '8px 10px', color: '#64748b' }}>{c.candidate_phone ?? '—'}</td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: c.status === 'APPROVED' ? '#059669' : c.status === 'REJECTED' ? '#dc2626' : '#94a3b8' }}>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Schedule Modal ── */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl p-8 relative">
            <button onClick={() => setShowScheduleModal(false)} className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
              <X className="w-4 h-4" />
            </button>

            <div className="w-14 h-14 bg-slate-900 rounded-[1.25rem] flex items-center justify-center mb-4">
              <Calendar className="w-6 h-6 text-[#2C82B5]" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-1">Agendar Entrevistas</h2>
            <p className="text-sm text-slate-500 mb-4">
              O candidato receberá um link via WhatsApp para escolher o melhor horário disponível na sua agenda.
            </p>

            {/* Candidate list — collapsible */}
            <button
              type="button"
              onClick={() => setShowCandidateList(v => !v)}
              className="flex items-center justify-between w-full px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm mb-5 hover:bg-slate-100 transition-colors"
            >
              <span className="font-semibold text-slate-700">
                {approved.length} candidato{approved.length !== 1 ? 's' : ''} aprovado{approved.length !== 1 ? 's' : ''}
              </span>
              {showCandidateList
                ? <ChevronUp className="w-4 h-4 text-slate-400" />
                : <ChevronDown className="w-4 h-4 text-slate-400" />
              }
            </button>
            {showCandidateList && (
              <div className="mb-5 space-y-1.5">
                {approved.map(c => (
                  <div key={c.id} className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white border border-slate-100">
                    <div className="w-6 h-6 rounded-full bg-[#2C82B5]/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-black text-[#2C82B5]">{getName(c).charAt(0)}</span>
                    </div>
                    <p className="text-[13px] font-semibold text-slate-700 truncate">{getName(c)}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4">
              {/* Formato */}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Formato</label>
                <div className="flex gap-2">
                  {['Online', 'Presencial'].map(f => (
                    <button key={f} type="button" onClick={() => setScheduleForm(s => ({ ...s, format: f }))}
                      className={cn('flex-1 py-2 rounded-2xl text-sm font-bold border transition-all',
                        scheduleForm.format === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400')}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {scheduleForm.format === 'Online' && (
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Link da Reunião</label>
                  <input type="url" value={scheduleForm.meetingLink} onChange={e => setScheduleForm(f => ({ ...f, meetingLink: e.target.value }))}
                    placeholder="https://meet.google.com/..." className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50 placeholder:text-slate-300" />
                </div>
              )}

              {/* Entrevistador */}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Entrevistador <span className="text-red-500">*</span></label>
                <input type="text" value={scheduleForm.interviewer} onChange={e => setScheduleForm(f => ({ ...f, interviewer: e.target.value }))}
                  placeholder="Nome do responsável" className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50 placeholder:text-slate-300" />
              </div>

              <button onClick={handleSchedule} disabled={scheduling || !scheduleForm.interviewer.trim() || approved.length === 0}
                className="w-full py-3.5 rounded-2xl text-white font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                style={{ background: 'linear-gradient(135deg, #2C82B5 0%, #2570a0 100%)' }}>
                {scheduling ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando links...</> : <><Send className="w-4 h-4" /> Enviar links de agendamento</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
