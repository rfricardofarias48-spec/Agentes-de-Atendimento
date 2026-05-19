import { useEffect, useState } from 'react'
import { UserCheck, Briefcase, Phone, User, FileText, Loader2, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

interface ApprovedCandidate {
  id: string
  job_id: string
  status: string
  created_at: string
  updated_at?: string
  candidate_name?: string
  candidate_phone?: string
  file_path?: string | null
  job_title?: string
  analysis_result?: {
    candidateName?: string
    matchScore?: number
    yearsExperience?: string
    city?: string
    phoneNumbers?: string[]
  } | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return null
  const color = score >= 7 ? 'bg-emerald-50 text-emerald-700' : score >= 4 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
  return (
    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${color}`}>
      {score.toFixed(1)} / 10
    </span>
  )
}

export default function ClientAprovados() {
  const { orgId } = useAuth()
  const [candidates, setCandidates] = useState<ApprovedCandidate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    setLoading(true)

    supabase
      .from('candidates')
      .select(`
        *,
        jobs ( id, title, org_id )
      `)
      .eq('status', 'APROVADO')
      .eq('jobs.org_id', orgId)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setCandidates(data.map((row: Record<string, unknown>) => ({
            ...row,
            job_title: (row.jobs as { title?: string } | null)?.title ?? '—',
            candidate_name: (row.analysis_result as { candidateName?: string } | null)?.candidateName,
            candidate_phone: ((row.analysis_result as { phoneNumbers?: string[] } | null)?.phoneNumbers ?? [])[0],
          })) as ApprovedCandidate[])
        }
        setLoading(false)
      })
  }, [orgId])

  async function handleDownload(filePath: string, name: string) {
    const { data } = await supabase.storage.from('resumes').createSignedUrl(filePath, 60)
    if (data?.signedUrl) {
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = `${name}.pdf`
      a.click()
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Aprovados<span className="text-brand-500">.</span>
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Candidatos aprovados no processo seletivo.
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-[1.5rem] flex items-center justify-center mb-4">
            <UserCheck className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="text-base font-black text-slate-700 mb-1">Nenhum candidato aprovado ainda</h3>
          <p className="text-sm text-slate-400 max-w-xs">
            Quando um candidato for aprovado no processo seletivo ele aparecerá aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map(c => {
            const name = c.candidate_name ?? c.analysis_result?.candidateName ?? 'Candidato'
            const phone = c.candidate_phone ?? c.analysis_result?.phoneNumbers?.[0]
            const score = c.analysis_result?.matchScore

            return (
              <div
                key={c.id}
                className="bg-white border border-slate-100 rounded-[1.5rem] px-6 py-5 shadow-[0px_2px_12px_rgba(0,0,0,0.03)] flex items-center gap-5 flex-wrap"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-emerald-600" />
                </div>

                {/* Name + phone */}
                <div className="min-w-[150px]">
                  <p className="text-sm font-black text-slate-900 leading-none">{name}</p>
                  {phone && (
                    <div className="flex items-center gap-1 mt-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span className="text-[11px] text-slate-500">{phone}</span>
                    </div>
                  )}
                </div>

                {/* Job */}
                <div className="flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-600">{c.job_title}</span>
                </div>

                {/* Score */}
                <ScoreBadge score={score} />

                {/* Experience + City */}
                {c.analysis_result?.yearsExperience && c.analysis_result.yearsExperience !== '-' && (
                  <span className="text-xs text-slate-400 font-medium">
                    {c.analysis_result.yearsExperience}
                  </span>
                )}
                {c.analysis_result?.city && c.analysis_result.city !== '-' && (
                  <span className="text-xs text-slate-400">{c.analysis_result.city}</span>
                )}

                {/* Date */}
                <span className="text-xs text-slate-400 ml-auto">
                  {fmtDate(c.updated_at ?? c.created_at)}
                </span>

                {/* Download CV */}
                {c.file_path && (
                  <button
                    onClick={() => handleDownload(c.file_path!, name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                    title="Baixar currículo"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    CV
                    <Download className="w-3 h-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
