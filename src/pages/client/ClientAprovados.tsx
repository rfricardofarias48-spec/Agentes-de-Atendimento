import { useEffect, useState, useMemo } from 'react'
import { Briefcase, Eye, Loader2, Search, UserCheck, MessageCircle, Phone, Trash2, AlertTriangle } from 'lucide-react'
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
  const [copied, setCopied] = useState<string | null>(null)
  const [chatwootLoading, setChatwootLoading] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ApprovedCandidate | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  async function handleViewResume(filePath: string) {
    const { data } = await supabase.storage.from('resumes').createSignedUrl(filePath, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  function handleCopyPhone(id: string, phone: string) {
    navigator.clipboard.writeText(phone).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  async function handleOpenChatwoot(candidateId: string, rawPhone: string) {
    if (!orgId || !rawPhone) return
    setChatwootLoading(candidateId)
    try {
      const res = await fetch(
        `/api/candidates/schedule-interviews?action=chatwoot-link&phone=${encodeURIComponent(rawPhone)}&orgId=${orgId}`
      )
      const json = await res.json() as { url?: string; error?: string }
      if (json.url) {
        window.open(json.url, '_blank')
      } else {
        // Fallback: open contacts search
        if (org?.chatwoot_url && org?.chatwoot_account_id) {
          window.open(`${org.chatwoot_url}/app/accounts/${org.chatwoot_account_id}/contacts?q=${encodeURIComponent(rawPhone)}`, '_blank')
        } else if (org?.chatwoot_url) {
          window.open(org.chatwoot_url, '_blank')
        }
      }
    } finally {
      setChatwootLoading(null)
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmDelete) return
    setDeleting(true)
    const { id, file_path, candidate_phone } = confirmDelete
    try {
      await Promise.all([
        supabase.from('interviews').delete().eq('candidate_id', id),
        supabase.from('interview_bookings').delete().eq('candidate_id', id),
        ...(candidate_phone
          ? [supabase.from('appointments').delete().eq('patient_phone', candidate_phone)]
          : []),
      ])
      if (file_path) {
        await supabase.storage.from('resumes').remove([file_path])
      }
      await supabase.from('candidates').delete().eq('id', id)
      setCandidates(prev => prev.filter(c => c.id !== id))
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => { onRegisterExport?.(exportCsv) }, [filtered]) // eslint-disable-line

  function exportCsv() {
    const rows = [
      ['Candidato', 'Telefone', 'Vaga', 'Entrevistador', 'Aprovado em'].join(','),
      ...filtered.map(c => [
        fmtName(c.candidate_name),
        fmtPhone(c.candidate_phone),
        c.job_title ?? '',
        c.interviewer_name ?? '',
        fmtDate(c.updated_at ?? c.created_at),
      ].join(',')),
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
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Data Final</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400" />
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
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Entrevistador</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Aprovado em</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Currículo</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Contato</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(c => {
                  const name     = fmtName(c.candidate_name)
                  const phone    = fmtPhone(c.candidate_phone)
                  const rawPhone = (c.candidate_phone ?? '').replace(/\D/g, '')
                  const waPhone  = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`
                  const hasChatwoot = !!(org?.chatwoot_url && org?.chatwoot_account_id)

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">

                      {/* Nome */}
                      <td className="px-4 py-2 text-center">
                        <p className="font-bold text-slate-900 text-[13px]">{name}</p>
                      </td>

                      {/* Vaga */}
                      <td className="px-4 py-2 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-600 text-[13px] truncate max-w-[130px]">{c.job_title}</span>
                        </div>
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

                      {/* CV — eye icon opens in new tab */}
                      <td className="px-4 py-2 text-center">
                        {c.file_path ? (
                          <button
                            onClick={() => handleViewResume(c.file_path!)}
                            title="Ver currículo"
                            className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[13px]">—</span>
                        )}
                      </td>

                      {/* Contato — 3 inline icon buttons */}
                      <td className="px-4 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">

                          {/* WhatsApp */}
                          {rawPhone ? (
                            <a
                              href={`https://wa.me/${waPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir WhatsApp"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </a>
                          ) : (
                            <span className="w-7 h-7" />
                          )}

                          {/* Copy phone */}
                          {phone ? (
                            <button
                              onClick={() => handleCopyPhone(c.id, phone)}
                              title={copied === c.id ? 'Copiado!' : `Copiar número: ${phone}`}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              {copied === c.id
                                ? <span className="text-[9px] font-black text-emerald-600">OK</span>
                                : <Phone className="w-3.5 h-3.5" />
                              }
                            </button>
                          ) : (
                            <span className="w-7 h-7" />
                          )}

                          {/* Chatwoot conversation */}
                          {hasChatwoot ? (
                            <button
                              onClick={() => handleOpenChatwoot(c.id, rawPhone)}
                              title="Abrir conversa no Chatwoot"
                              disabled={chatwootLoading === c.id}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 transition-colors hover:bg-[#2C82B5]/10 hover:text-[#2C82B5] disabled:opacity-50"
                            >
                              {chatwootLoading === c.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <MessageCircle className="w-3.5 h-3.5" />
                              }
                            </button>
                          ) : (
                            <span className="w-7 h-7" />
                          )}

                        </div>
                      </td>

                      {/* Finalizar / deletar */}
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => setConfirmDelete(c)}
                          title="Finalizar e remover candidato"
                          className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            onClick={() => !deleting && setConfirmDelete(null)}
          />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-[380px] overflow-hidden animate-in zoom-in-95 fade-in duration-200">
            <div className="px-7 pt-7 pb-6">
              {/* Icon */}
              <div className="w-14 h-14 rounded-[1.25rem] flex items-center justify-center mb-5 bg-red-50">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>

              <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-red-400">
                Ação irreversível
              </p>
              <h2 className="text-xl font-black text-slate-900 leading-tight mb-4">
                Finalizar candidato?
              </h2>
              <p className="text-[13px] text-slate-600 leading-relaxed">
                Você está prestes a remover permanentemente{' '}
                <span className="font-black text-slate-900">{fmtName(confirmDelete.candidate_name)}</span>{' '}
                e todo o seu histórico — entrevistas, agendamentos e currículo.{' '}
                <span className="font-bold text-slate-700">Essa ação não pode ser desfeita.</span>
              </p>
            </div>

            <div className="h-px bg-slate-100 mx-7" />

            <div className="px-7 py-5 flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl border border-slate-200 text-[13px] font-black text-slate-500 hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirmed}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-600 text-[13px] font-black text-white shadow-lg transition-all disabled:opacity-70 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Sim, remover
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
