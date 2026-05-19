import { useEffect, useState, useMemo } from 'react'
import { UserCheck, Briefcase, Phone, FileText, Loader2, Download, Search, Star } from 'lucide-react'
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
  const color =
    score >= 7 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    : score >= 4 ? 'bg-amber-50 text-amber-700 border border-amber-200'
    : 'bg-red-50 text-red-600 border border-red-200'
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full ${color}`}>
      <Star className="w-2.5 h-2.5" />
      {score.toFixed(1)} / 10
    </span>
  )
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function ClientAprovados() {
  const { orgId } = useAuth()
  const [candidates, setCandidates] = useState<ApprovedCandidate[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch]     = useState('')
  const [vagaFilter, setVaga]   = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    supabase
      .from('candidates')
      .select('*, jobs ( id, title, org_id )')
      .eq('status', 'APROVADO')
      .eq('jobs.org_id', orgId)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setCandidates(data.map((row: Record<string, unknown>) => ({
            ...row,
            job_title:       (row.jobs as { title?: string } | null)?.title ?? '—',
            candidate_name:  (row.analysis_result as { candidateName?: string } | null)?.candidateName,
            candidate_phone: ((row.analysis_result as { phoneNumbers?: string[] } | null)?.phoneNumbers ?? [])[0],
          })) as ApprovedCandidate[])
        }
        setLoading(false)
      })
  }, [orgId])

  const jobTitles = useMemo(() => [...new Set(candidates.map(c => c.job_title ?? '').filter(Boolean))], [candidates])

  const filtered = useMemo(() => candidates.filter(c => {
    const name = (c.candidate_name ?? '').toLowerCase()
    if (search && !name.includes(search.toLowerCase())) return false
    if (vagaFilter && c.job_title !== vagaFilter) return false
    const date = c.updated_at ?? c.created_at
    if (dateFrom && date < dateFrom) return false
    if (dateTo   && date > dateTo)   return false
    return true
  }), [candidates, search, vagaFilter, dateFrom, dateTo])

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
    <div className="space-y-5">

      {/* Header */}
      <div className="bg-white border border-slate-100 rounded-2xl px-6 py-5 shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
          <UserCheck className="w-6 h-6 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">
            Aprovados<span className="text-brand-500">.</span>
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Candidatos aprovados no processo seletivo.</p>
        </div>
        <div className="shrink-0">
          <span className="text-sm font-bold text-slate-400">
            {loading ? '—' : `${candidates.length} candidato${candidates.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 shadow-sm flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300"
          />
        </div>

        {/* Vaga filter */}
        <select
          value={vagaFilter}
          onChange={e => setVaga(e.target.value)}
          className="h-9 px-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white min-w-[150px]"
        >
          <option value="">Todas as vagas</option>
          {jobTitles.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">Aprovação:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <span className="text-xs text-slate-400">até</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>

        {(search || vagaFilter || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(''); setVaga(''); setDateFrom(''); setDateTo('') }}
            className="h-9 px-3 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center py-20 text-center bg-slate-50/50">
          <div className="w-14 h-14 bg-white border border-slate-200 rounded-2xl flex items-center justify-center mb-3 shadow-sm">
            <UserCheck className="w-6 h-6 text-slate-300" />
          </div>
          <h3 className="text-sm font-black text-slate-700 mb-1">
            {candidates.length === 0 ? 'Nenhum candidato aprovado' : 'Nenhum resultado encontrado'}
          </h3>
          <p className="text-xs text-slate-400 max-w-xs">
            {candidates.length === 0
              ? 'Aprove candidatos nas entrevistas para vê-los aqui.'
              : 'Tente ajustar os filtros para encontrar o que procura.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Candidato</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Vaga</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Score</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Experiência</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Cidade</th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Aprovado em</th>
                <th className="text-right px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">CV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(c => {
                const name  = c.candidate_name ?? c.analysis_result?.candidateName ?? 'Candidato'
                const phone = c.candidate_phone ?? c.analysis_result?.phoneNumbers?.[0]
                const score = c.analysis_result?.matchScore
                const initials = getInitials(name)

                return (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">

                    {/* Candidato */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-black text-emerald-700">{initials}</span>
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-[13px] leading-none">{name}</p>
                          {phone && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Phone className="w-2.5 h-2.5 text-slate-400" />
                              <span className="text-[10px] text-slate-400">{phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Vaga */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-600 text-[13px] truncate max-w-[150px]">{c.job_title}</span>
                      </div>
                    </td>

                    {/* Score */}
                    <td className="px-5 py-3.5">
                      <ScoreBadge score={score} />
                    </td>

                    {/* Experiência */}
                    <td className="px-5 py-3.5">
                      <span className="text-[13px] text-slate-500">
                        {c.analysis_result?.yearsExperience && c.analysis_result.yearsExperience !== '-'
                          ? c.analysis_result.yearsExperience
                          : <span className="text-slate-300">—</span>}
                      </span>
                    </td>

                    {/* Cidade */}
                    <td className="px-5 py-3.5">
                      <span className="text-[13px] text-slate-500">
                        {c.analysis_result?.city && c.analysis_result.city !== '-'
                          ? c.analysis_result.city
                          : <span className="text-slate-300">—</span>}
                      </span>
                    </td>

                    {/* Data */}
                    <td className="px-5 py-3.5">
                      <span className="text-[13px] text-slate-500">{fmtDate(c.updated_at ?? c.created_at)}</span>
                    </td>

                    {/* Download CV */}
                    <td className="px-5 py-3.5 text-right">
                      {c.file_path ? (
                        <button
                          onClick={() => handleDownload(c.file_path!, name)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                          title="Baixar currículo"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          CV
                          <Download className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-slate-300 text-[13px]">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="px-5 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              {filtered.length} candidato{filtered.length !== 1 ? 's' : ''}
              {filtered.length !== candidates.length ? ` de ${candidates.length}` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
