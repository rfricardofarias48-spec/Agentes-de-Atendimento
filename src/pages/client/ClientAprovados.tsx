import { useEffect, useState, useMemo, useRef } from 'react'
import { Briefcase, FileText, Loader2, Download, Search, Star, UserCheck, MessageCircle, Phone, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

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
  interviewer_name?: string
  analysis_result?: {
    candidateName?: string
    matchScore?: number
    yearsExperience?: string
    city?: string
    phoneNumbers?: string[]
  } | null
}

interface OrgInfo {
  chatwoot_url?: string | null
  chatwoot_account_id?: number | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function fmtName(full: string | null | undefined): string {
  if (!full) return '—'
  const parts = full.trim().split(/\s+/).filter(Boolean)
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  if (parts.length === 1) return cap(parts[0])
  return `${cap(parts[0])} ${cap(parts[parts.length - 1])}`
}

function fmtPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  if (local.length < 8) return local
  return local.slice(0, -4) + '-' + local.slice(-4)
}

export default function ClientAprovados({ onRegisterExport }: { onRegisterExport?: (fn: () => void) => void }) {
  const { orgId } = useAuth()
  const [candidates, setCandidates] = useState<ApprovedCandidate[]>([])
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [contactOpen, setContactOpen] = useState<string | null>(null)
  const contactRef = useRef<HTMLDivElement | null>(null)

  const [search, setSearch]     = useState('')
  const [vagaFilter, setVaga]   = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  useEffect(() => {
    if (!orgId) return
    setLoading(true)

    Promise.all([
      supabase
        .from('candidates')
        .select('*, jobs ( id, title )')
        .eq('is_selected', true)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('interviews')
        .select('candidate_id, interviewer_name')
        .eq('org_id', orgId)
        .eq('status', 'APROVADO'),
      supabase
        .from('organizations')
        .select('chatwoot_url, chatwoot_account_id')
        .eq('id', orgId)
        .single(),
    ]).then(([{ data: candData }, { data: ivData }, { data: orgData }]) => {
      if (orgData) setOrg(orgData)

      const ivMap = new Map<string, string>()
      for (const iv of ivData ?? []) {
        if (iv.candidate_id && iv.interviewer_name) ivMap.set(iv.candidate_id, iv.interviewer_name)
      }

      if (candData) {
        setCandidates(candData.map((row: Record<string, unknown>) => ({
          ...row,
          job_title:       (row.jobs as { title?: string } | null)?.title ?? '—',
          candidate_name:  (row.analysis_result as { candidateName?: string } | null)?.candidateName
                           ?? (row['candidate_name'] as string | undefined)
                           ?? (row['Nome Completo'] as string | undefined),
          candidate_phone: ((row.analysis_result as { phoneNumbers?: string[] } | null)?.phoneNumbers ?? [])[0]
                           ?? (row['candidate_phone'] as string | undefined)
                           ?? (row['WhatsApp com DDD'] as string | undefined),
          interviewer_name: ivMap.get(row.id as string) ?? null,
        })) as ApprovedCandidate[])
      }
      setLoading(false)
    })
  }, [orgId])

  // Close contact popover on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (contactRef.current && !contactRef.current.contains(e.target as Node)) {
        setContactOpen(null)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const jobTitles = useMemo(() => [...new Set(candidates.map(c => c.job_title ?? '').filter(Boolean))], [candidates])

  const filtered = useMemo(() => candidates.filter(c => {
    const name = fmtName(c.candidate_name).toLowerCase()
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

  useEffect(() => { onRegisterExport?.(exportCsv) }, [filtered]) // eslint-disable-line

  function exportCsv() {
    const rows = [
      ['Candidato', 'Telefone', 'Vaga', 'Entrevistador', 'Score', 'Experiência', 'Cidade', 'Aprovado em'].join(','),
      ...filtered.map(c => {
        const name  = fmtName(c.candidate_name)
        const phone = fmtPhone(c.candidate_phone)
        const score = c.analysis_result?.matchScore?.toFixed(1) ?? ''
        const exp   = c.analysis_result?.yearsExperience ?? ''
        const city  = c.analysis_result?.city ?? ''
        return [name, phone, c.job_title ?? '', c.interviewer_name ?? '', score, exp, city, fmtDate(c.updated_at ?? c.created_at)].join(',')
      }),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'aprovados.csv'
    a.click()
  }

  return (
    <div className="space-y-5">

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 shadow-sm flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Vaga</label>
          <select
            value={vagaFilter}
            onChange={e => setVaga(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
          >
            <option value="">Todas</option>
            {jobTitles.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

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

        {(search || vagaFilter || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(''); setVaga(''); setDateFrom(''); setDateTo('') }}
            className="h-9 px-3 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors self-end"
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
              <UserCheck className="w-6 h-6 text-slate-400" />
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Nome</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Vaga</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Score</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Entrevistador</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Aprovado em</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">CV</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Fazer contato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(c => {
                  const name     = fmtName(c.candidate_name)
                  const phone    = fmtPhone(c.candidate_phone)
                  const rawPhone = (c.candidate_phone ?? '').replace(/\D/g, '')
                  const waPhone  = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`
                  const score    = c.analysis_result?.matchScore
                  const scoreColor =
                    score == null ? ''
                    : score >= 7  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : score >= 4  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    :               'bg-red-50 text-red-600 border border-red-200'

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">

                      {/* Nome + contato */}
                      <td className="px-4 py-2 text-center">
                        <p className="font-bold text-slate-900 text-[13px] leading-none">
                          {name}
                          {phone && (
                            <span className="ml-1.5 text-[11px] font-normal text-slate-400">({phone})</span>
                          )}
                        </p>
                      </td>

                      {/* Vaga */}
                      <td className="px-4 py-2 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-600 text-[13px] truncate max-w-[130px]">{c.job_title}</span>
                        </div>
                      </td>

                      {/* Score */}
                      <td className="px-4 py-2 text-center">
                        {score != null ? (
                          <span className={cn('inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full', scoreColor)}>
                            <Star className="w-2.5 h-2.5" />
                            {score.toFixed(1)} / 10
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[13px]">—</span>
                        )}
                      </td>

                      {/* Entrevistador */}
                      <td className="px-4 py-2 text-center">
                        <span className="text-[13px] text-slate-600">
                          {c.interviewer_name ?? <span className="text-slate-300">—</span>}
                        </span>
                      </td>

                      {/* Aprovado em */}
                      <td className="px-4 py-2 text-center">
                        <span className="text-[13px] text-slate-600 whitespace-nowrap">
                          {fmtDate(c.updated_at ?? c.created_at)}
                        </span>
                      </td>

                      {/* CV */}
                      <td className="px-4 py-2 text-center">
                        {c.file_path ? (
                          <button
                            onClick={() => handleDownload(c.file_path!, name)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            <FileText className="w-3 h-3" />
                            CV
                            <Download className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[13px]">—</span>
                        )}
                      </td>

                      {/* Fazer contato */}
                      <td className="px-4 py-2 text-center">
                        <div className="relative inline-block" ref={contactOpen === c.id ? contactRef : null}>
                          <button
                            onClick={() => setContactOpen(contactOpen === c.id ? null : c.id)}
                            className={cn(
                              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors border',
                              contactOpen === c.id
                                ? 'text-white border-transparent'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            )}
                            style={contactOpen === c.id ? { background: '#2C82B5', borderColor: '#2C82B5' } : {}}
                          >
                            <MessageCircle className="w-3 h-3" />
                            Contato
                          </button>

                          {contactOpen === c.id && (
                            <div className="absolute right-0 top-full mt-2 z-30 w-52 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                              {/* Phone header */}
                              <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span className="text-[12px] font-black text-slate-700">
                                    {phone || 'Sem telefone'}
                                  </span>
                                </div>
                                <button
                                  onClick={() => setContactOpen(null)}
                                  className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-slate-500 rounded transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Buttons */}
                              <div className="p-2 flex flex-col gap-1">
                                {rawPhone && (
                                  <a
                                    href={`https://wa.me/${waPhone}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                                  >
                                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                                      <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                      </svg>
                                    </div>
                                    <div>
                                      <p className="text-[12px] font-black text-slate-800 leading-none">WhatsApp</p>
                                      <p className="text-[10px] text-slate-400 mt-0.5">Abrir conversa</p>
                                    </div>
                                  </a>
                                )}

                                {org?.chatwoot_url && (
                                  <a
                                    href={org.chatwoot_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                                  >
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(44,130,181,0.1)' }}>
                                      <MessageCircle className="w-3.5 h-3.5" style={{ color: '#2C82B5' }} />
                                    </div>
                                    <div>
                                      <p className="text-[12px] font-black text-slate-800 leading-none">Chatwoot</p>
                                      <p className="text-[10px] text-slate-400 mt-0.5">Ver conversa</p>
                                    </div>
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
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
    </div>
  )
}
