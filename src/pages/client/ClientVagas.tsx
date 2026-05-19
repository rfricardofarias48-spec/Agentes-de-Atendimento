import { useEffect, useState, useCallback } from 'react'
import { Briefcase, Plus, RefreshCw, X, Loader2, Folder, Download, Calendar } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Job, type Niche } from '../../types'
import { NicheSection } from '../../components/jobs/NicheSection'
import EntrevistasTab from './ClientEntrevistas'
import AprovadosTab from './ClientAprovados'
import { cn } from '../../lib/utils'

type SubTab = 'vagas' | 'entrevistas' | 'aprovados'

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'vagas',       label: 'Minhas Vagas' },
  { key: 'entrevistas', label: 'Entrevistas' },
  { key: 'aprovados',   label: 'Aprovados' },
]

function generateShortCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

const TAB_META: Record<SubTab, { title: string; subtitle: string }> = {
  vagas:       { title: 'Minhas Vagas',  subtitle: 'Gerencie vagas, entrevistas e candidatos aprovados.' },
  entrevistas: { title: 'Entrevistas',   subtitle: 'Acompanhe os agendamentos feitos pelo agente.' },
  aprovados:   { title: 'Aprovados',     subtitle: 'Candidatos aprovados no processo seletivo.' },
}

export default function ClientVagas() {
  const { orgId } = useAuth()
  const navigate  = useNavigate()
  const [activeTab, setActiveTab] = useState<SubTab>('vagas')
  const [exportFn, setExportFn]   = useState<(() => void) | null>(null)

  // ── state ────────────────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<Job[]>([])
  const [niches, setNiches] = useState<Niche[]>([])
  const [collapsedNiches, setCollapsedNiches] = useState<Set<string>>(new Set())
  const [deletingJobId, setDeletingJobId] = useState<string | undefined>()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [showJobModal, setShowJobModal] = useState(false)
  const [showNicheModal, setShowNicheModal] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)

  const [selectedNicheId, setSelectedNicheId] = useState<string | null>(null)
  const [jobTitle, setJobTitle] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [jobCriteria, setJobCriteria] = useState('')
  const [jobAutoAnalyze, setJobAutoAnalyze] = useState(true)
  const [jobSaving, setJobSaving] = useState(false)

  const [newNicheName, setNewNicheName] = useState('')
  const [nicheSaving, setNicheSaving] = useState(false)
  const [inlineNicheName, setInlineNicheName] = useState('')
  const [showInlineNiche, setShowInlineNiche] = useState(false)
  const [inlineNicheLoading, setInlineNicheLoading] = useState(false)

  // ── fetch ────────────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    if (!orgId) return
    const { data } = await supabase
      .from('jobs').select('*, candidates(*)').eq('org_id', orgId).order('created_at', { ascending: false })
    if (data) setJobs(data as Job[])
  }, [orgId])

  const fetchNiches = useCallback(async () => {
    if (!orgId) return
    const { data } = await supabase
      .from('niches').select('*').eq('org_id', orgId)
      .order('is_pinned', { ascending: false }).order('order_pos', { ascending: true })
    if (data) setNiches(data as Niche[])
  }, [orgId])

  useEffect(() => { fetchJobs(); fetchNiches() }, [fetchJobs, fetchNiches])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await Promise.all([fetchJobs(), fetchNiches()])
    setTimeout(() => setIsRefreshing(false), 700)
  }

  // ── modal helpers ─────────────────────────────────────────────────────────
  function openNewJobModal() {
    setEditingJob(null); setJobTitle(''); setJobDescription(''); setJobCriteria(''); setJobAutoAnalyze(true)
    setSelectedNicheId(niches[0]?.id ?? null); setShowInlineNiche(false); setInlineNicheName('')
    setShowJobModal(true)
  }
  function openEditJobModal(job: Job) {
    setEditingJob(job); setJobTitle(job.title); setJobDescription(job.description)
    setJobCriteria(job.criteria); setSelectedNicheId(job.niche_id); setJobAutoAnalyze(job.auto_analyze ?? true)
    setShowInlineNiche(false); setInlineNicheName(''); setShowJobModal(true)
  }

  // ── job handlers ──────────────────────────────────────────────────────────
  const handleJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId || !jobTitle.trim()) return
    setJobSaving(true)
    if (editingJob) {
      const { error } = await supabase.from('jobs')
        .update({ title: jobTitle, description: jobDescription, criteria: jobCriteria, auto_analyze: jobAutoAnalyze }).eq('id', editingJob.id)
      if (error) { alert(`Erro ao editar vaga: ${error.message}`); setJobSaving(false); return }
      setJobs(prev => prev.map(j => j.id === editingJob.id ? { ...j, title: jobTitle, description: jobDescription, criteria: jobCriteria, auto_analyze: jobAutoAnalyze } : j))
    } else {
      const { data, error } = await supabase.from('jobs')
        .insert([{
          org_id: orgId,
          title: jobTitle,
          description: jobDescription,
          criteria: jobCriteria,
          short_code: generateShortCode(),
          niche_id: selectedNicheId || null,
          is_pinned: false,
          auto_analyze: jobAutoAnalyze,
        }])
        .select('*, candidates(*)').single()
      if (error) { alert(`Erro ao criar vaga: ${error.message}`); setJobSaving(false); return }
      if (data) setJobs(prev => [data as Job, ...prev])
    }
    setJobSaving(false); setShowJobModal(false)
  }

  const handleDeleteJob = async (id: string) => {
    setDeletingJobId(id)
    await supabase.from('jobs').delete().eq('id', id)
    setJobs(prev => prev.filter(j => j.id !== id))
    setDeletingJobId(undefined)
  }
  const handlePinJob = async (id: string) => {
    const job = jobs.find(j => j.id === id); if (!job) return
    const newPinned = !job.is_pinned
    await supabase.from('jobs').update({ is_pinned: newPinned }).eq('id', id)
    setJobs(prev => prev.map(j => j.id === id ? { ...j, is_pinned: newPinned } : j))
  }
  const handleMoveJob = async (jobId: string, targetNicheId: string) => {
    await supabase.from('jobs').update({ niche_id: targetNicheId }).eq('id', jobId)
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, niche_id: targetNicheId } : j))
  }

  // ── niche handlers ────────────────────────────────────────────────────────
  const handleCreateNiche = async () => {
    if (!newNicheName.trim() || !orgId) return
    setNicheSaving(true)
    const { data, error } = await supabase.from('niches')
      .insert([{ org_id: orgId, name: newNicheName.trim(), order_pos: niches.length, is_pinned: false }])
      .select().single()
    if (error) { alert(`Erro ao criar nicho: ${error.message}`); setNicheSaving(false); return }
    if (data) { setNiches(prev => [...prev, data as Niche]); setNewNicheName(''); setShowNicheModal(false) }
    setNicheSaving(false)
  }
  const handleCreateInlineNiche = async () => {
    if (!inlineNicheName.trim() || !orgId) return
    setInlineNicheLoading(true)
    const { data, error } = await supabase.from('niches')
      .insert([{ org_id: orgId, name: inlineNicheName.trim(), order_pos: niches.length, is_pinned: false }])
      .select().single()
    if (!error && data) {
      const n = data as Niche
      setNiches(prev => [...prev, n]); setSelectedNicheId(n.id); setInlineNicheName(''); setShowInlineNiche(false)
    }
    setInlineNicheLoading(false)
  }
  const handleDeleteNiche = async (id: string) => {
    if (jobs.some(j => j.niche_id === id)) { alert('Remova todas as vagas deste nicho antes de excluí-lo.'); return }
    await supabase.from('niches').delete().eq('id', id)
    setNiches(prev => prev.filter(n => n.id !== id))
  }
  const handlePinNiche = async (id: string) => {
    const niche = niches.find(n => n.id === id); if (!niche) return
    const newPinned = !niche.is_pinned
    await supabase.from('niches').update({ is_pinned: newPinned }).eq('id', id)
    setNiches(prev => prev.map(n => n.id === id ? { ...n, is_pinned: newPinned } : n))
  }
  const handleMoveNiche = async (id: string, direction: 'up' | 'down') => {
    const sorted = [...niches].sort((a, b) => a.order_pos - b.order_pos)
    const idx = sorted.findIndex(n => n.id === id)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === sorted.length - 1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const updated = [...sorted];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]]
    const withPos = updated.map((n, i) => ({ ...n, order_pos: i }))
    setNiches(withPos)
    await Promise.all(withPos.map(n => supabase.from('niches').update({ order_pos: n.order_pos }).eq('id', n.id)))
  }
  const handleToggleCollapse = (id: string) => {
    setCollapsedNiches(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const orphanJobs = jobs.filter(j => !j.niche_id)

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* Título dinâmico por aba */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          {TAB_META[activeTab].title}<span className="text-brand-500">.</span>
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">{TAB_META[activeTab].subtitle}</p>
      </div>

      {/* Sub-tabs + botões de ação na mesma linha */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-slate-100 rounded-2xl p-1 shadow-sm">
          {SUB_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-1.5 rounded-xl text-sm font-bold transition-all',
                activeTab === tab.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Botões: Vagas */}
        {activeTab === 'vagas' && (
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
              <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} /> Atualizar
            </button>
            <button onClick={() => setShowNicheModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
              <Plus className="w-3.5 h-3.5" /> Novo Nicho
            </button>
            <button onClick={openNewJobModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all shadow-[0_4px_14px_rgba(44,130,181,0.30)] hover:shadow-[0_6px_20px_rgba(44,130,181,0.42)] hover:-translate-y-[1px]"
              style={{ background: 'linear-gradient(135deg, #2C82B5 0%, #2570a0 100%)' }}>
              <Plus className="w-3.5 h-3.5" /> Nova Vaga
            </button>
          </div>
        )}

        {/* Botões: Entrevistas */}
        {activeTab === 'entrevistas' && (
          <div className="flex items-center gap-2">
            {exportFn && (
              <button onClick={exportFn} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                <Download className="w-3 h-3" /> Exportar
              </button>
            )}
            <button
              onClick={() => navigate('/dashboard/appointments')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-bold transition-all shadow-[0_4px_14px_rgba(44,130,181,0.30)] hover:shadow-[0_6px_20px_rgba(44,130,181,0.42)] hover:-translate-y-[1px]"
              style={{ background: 'linear-gradient(135deg, #2C82B5 0%, #2570a0 100%)' }}
            >
              <Calendar className="w-3 h-3" /> Agenda
            </button>
          </div>
        )}

        {/* Botões: Aprovados */}
        {activeTab === 'aprovados' && exportFn && (
          <button onClick={exportFn} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <Download className="w-3 h-3" /> Exportar
          </button>
        )}
      </div>

      {/* ── Sub-tab: Vagas ───────────────────────────────────────────────── */}
      {activeTab === 'vagas' && (
        <div className="space-y-4">

          {niches.length === 0 && orphanJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-[1.5rem] flex items-center justify-center mb-4">
                <Briefcase className="w-7 h-7 text-slate-400" />
              </div>
              <h3 className="text-base font-black text-slate-700 mb-1">Nenhuma vaga criada</h3>
              <p className="text-sm text-slate-400 max-w-xs">Crie um nicho e clique em "+ Nova Vaga" para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {niches.map((niche, idx) => (
                <NicheSection
                  key={niche.id} niche={niche} jobs={jobs.filter(j => j.niche_id === niche.id)}
                  allNiches={niches} isCollapsed={collapsedNiches.has(niche.id)}
                  onToggle={() => handleToggleCollapse(niche.id)} onPin={handlePinNiche}
                  onDelete={handleDeleteNiche} onMoveUp={id => handleMoveNiche(id, 'up')}
                  onMoveDown={id => handleMoveNiche(id, 'down')} isFirst={idx === 0}
                  isLast={idx === niches.length - 1} onJobClick={() => {}}
                  onJobDelete={handleDeleteJob} onJobPin={handlePinJob}
                  onJobEdit={openEditJobModal} onMoveJob={handleMoveJob} deletingJobId={deletingJobId}
                />
              ))}
              {orphanJobs.length > 0 && (
                <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50/50 px-5 py-4">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Sem nicho</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {orphanJobs.map(job => (
                      <div key={job.id} className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.02)]">
                        <p className="text-xl font-black text-slate-900 tracking-tighter">{job.title}</p>
                        <p className="text-[11px] text-slate-500 mt-2 line-clamp-2">{job.description || 'Descrição não informada.'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Sub-tab: Entrevistas ─────────────────────────────────────────── */}
      {activeTab === 'entrevistas' && (
        <EntrevistasTab onRegisterExport={fn => setExportFn(() => fn)} />
      )}

      {/* ── Sub-tab: Aprovados ───────────────────────────────────────────── */}
      {activeTab === 'aprovados' && (
        <AprovadosTab onRegisterExport={fn => setExportFn(() => fn)} />
      )}

      {/* ── Modal Nova / Editar Vaga ─────────────────────────────────────── */}
      {showJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl p-8 relative">
            <button onClick={() => setShowJobModal(false)} className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
              <X className="w-4 h-4" />
            </button>
            <div className="w-14 h-14 bg-slate-900 rounded-[1.25rem] flex items-center justify-center mb-4">
              <Briefcase className="w-6 h-6 text-[#65a30d]" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-1">{editingJob ? 'Editar Vaga' : 'Nova Vaga'}</h2>
            <p className="text-sm text-slate-500 mb-6">Defina os critérios para a IA analisar.</p>

            <form onSubmit={handleJobSubmit} className="space-y-5">
              {!editingJob && (
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                    Nicho <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {niches.map(n => (
                      <button key={n.id} type="button"
                        onClick={() => { setSelectedNicheId(n.id); setShowInlineNiche(false) }}
                        className={cn('px-4 py-1.5 rounded-2xl text-sm font-bold border transition-all',
                          selectedNicheId === n.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400')}
                      >{n.name}</button>
                    ))}
                    {!showInlineNiche ? (
                      <button type="button"
                        onClick={() => { setShowInlineNiche(true); setSelectedNicheId(null) }}
                        className="px-4 py-1.5 rounded-2xl text-sm font-bold border border-dashed border-slate-300 text-slate-400 hover:border-slate-500 flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> Novo Nicho
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input autoFocus value={inlineNicheName} onChange={e => setInlineNicheName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCreateInlineNiche())}
                          placeholder="Nome do nicho..." className="border border-slate-300 rounded-2xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 w-36" />
                        <button type="button" onClick={handleCreateInlineNiche} disabled={inlineNicheLoading || !inlineNicheName.trim()}
                          className="px-3 py-1.5 rounded-2xl bg-slate-900 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-1">
                          {inlineNicheLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Criar
                        </button>
                        <button type="button" onClick={() => { setShowInlineNiche(false); setInlineNicheName('') }}
                          className="w-7 h-7 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Título do Cargo</label>
                <input required value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                  placeholder="Ex: Desenvolvedor Front-end Senior"
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 placeholder:text-slate-300 bg-slate-50" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                  Descrição <span className="text-slate-400 normal-case font-medium">(opcional)</span>
                </label>
                <textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)}
                  placeholder="Breve resumo das responsabilidades..." rows={3}
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 placeholder:text-slate-300 bg-slate-50 resize-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Requisitos Obrigatórios</label>
                <textarea value={jobCriteria} onChange={e => setJobCriteria(e.target.value)}
                  placeholder="Liste os requisitos chave (ex: React, Inglês Fluente, 3 anos de xp...)" rows={3}
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 placeholder:text-slate-300 bg-slate-50 resize-none" />
              </div>
              <button type="submit" disabled={jobSaving || !jobTitle.trim() || (!editingJob && niches.length > 0 && !selectedNicheId)}
                className="w-full py-3.5 rounded-2xl bg-slate-700 hover:bg-slate-800 text-white font-black text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {jobSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : editingJob ? 'Salvar Alterações' : 'Criar Vaga com IA'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Novo Nicho ─────────────────────────────────────────────── */}
      {showNicheModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl p-8 relative">
            <button onClick={() => setShowNicheModal(false)} className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
              <X className="w-4 h-4" />
            </button>
            <div className="w-14 h-14 bg-slate-900 rounded-[1.25rem] flex items-center justify-center mb-4">
              <Folder className="w-6 h-6 text-[#65a30d]" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-1">Novo Nicho</h2>
            <p className="text-sm text-slate-500 mb-6">Agrupe suas vagas por área ou setor.</p>
            <div className="space-y-4">
              <input autoFocus value={newNicheName} onChange={e => setNewNicheName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateNiche()}
                placeholder="Ex: Tecnologia, Logística, Vendas..."
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 placeholder:text-slate-300 bg-slate-50" />
              <button onClick={handleCreateNiche} disabled={nicheSaving || !newNicheName.trim()}
                className="w-full py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {nicheSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : <><Plus className="w-4 h-4" /> Criar Nicho</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
