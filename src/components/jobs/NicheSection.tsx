import { useState, useRef, useEffect } from 'react'
import {
  ChevronDown, ChevronRight, Pin, Sparkles, Trash2,
  ArrowUp, ArrowDown, Briefcase, Check, X, FolderInput,
} from 'lucide-react'
import { type Niche, type Job } from '../../types'
import { JobCard } from './JobCard'

interface NicheSectionProps {
  niche: Niche
  jobs: Job[]
  allNiches: Niche[]
  isCollapsed: boolean
  onToggle: () => void
  onPin: (id: string) => void
  onDelete: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  isFirst: boolean
  isLast: boolean
  onJobClick: (job: Job) => void
  onJobDelete: (id: string) => void
  onJobPin: (id: string) => void
  onJobEdit: (job: Job) => void
  onMoveJob: (jobId: string, targetNicheId: string) => void
  deletingJobId?: string
}

function JobWithMoveMenu({
  job, allNiches, currentNicheId,
  onJobClick, onJobDelete, onJobPin, onJobEdit, onMoveJob, isDeleting,
}: {
  job: Job
  allNiches: Niche[]
  currentNicheId: string
  onJobClick: (j: Job) => void
  onJobDelete: (id: string) => void
  onJobPin: (id: string) => void
  onJobEdit: (j: Job) => void
  onMoveJob: (jobId: string, targetNicheId: string) => void
  isDeleting?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const otherNiches = allNiches.filter(n => n.id !== currentNicheId)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative group/wrap">
      <JobCard
        job={job}
        onClick={onJobClick}
        onDelete={onJobDelete}
        onPin={onJobPin}
        onEdit={onJobEdit}
        isDeleting={isDeleting}
      />

      {otherNiches.length > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          className="absolute top-3 left-3 z-20 opacity-0 group-hover/wrap:opacity-100 transition-opacity bg-white border border-slate-200 rounded-xl px-2 py-1 flex items-center gap-1 shadow-sm text-[10px] font-bold text-slate-500 hover:text-slate-900 hover:border-slate-400"
          title="Mover para outro nicho"
        >
          <FolderInput className="w-3 h-3" />
          Mover
        </button>
      )}

      {open && (
        <div className="absolute top-10 left-3 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 min-w-[160px]">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3 pt-1 pb-2">
            Mover para
          </p>
          {otherNiches.map(n => (
            <button
              key={n.id}
              onClick={e => { e.stopPropagation(); onMoveJob(job.id, n.id); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#2C82B5]" />
              {n.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function NicheSection({
  niche, jobs, allNiches, isCollapsed, onToggle,
  onPin, onDelete, onMoveUp, onMoveDown,
  isFirst, isLast,
  onJobClick, onJobDelete, onJobPin, onJobEdit, onMoveJob,
  deletingJobId,
}: NicheSectionProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const totalCvs = jobs.reduce((sum, j) => sum + j.candidates.length, 0)

  return (
    <div className={`rounded-[2rem] border transition-all duration-200 shadow-[0px_2px_12px_rgba(0,0,0,0.03)] ${niche.is_pinned ? 'border-[#2C82B5]/40 bg-[#f0f7fd]' : 'border-slate-100 bg-white'}`}>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={onToggle}
          className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {niche.is_pinned && <Sparkles className="w-4 h-4 text-[#2C82B5] fill-current shrink-0" />}

        <button onClick={onToggle} className="flex-1 text-left min-w-0">
          <span className="font-black text-slate-900 text-base tracking-tight truncate block">
            {niche.name}
          </span>
        </button>

        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
            {jobs.length} {jobs.length === 1 ? 'vaga' : 'vagas'}
          </span>
          {totalCvs > 0 && (
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-full">
              {totalCvs} CVs
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {!confirmDelete ? (
            <>
              <button
                onClick={() => onPin(niche.id)}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${niche.is_pinned ? 'bg-[#2C82B5]/10 text-[#2C82B5]' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                title={niche.is_pinned ? 'Desafixar' : 'Fixar no topo'}
              >
                <Pin className={`w-3.5 h-3.5 ${niche.is_pinned ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={() => onMoveUp(niche.id)}
                disabled={isFirst}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onMoveDown(niche.id)}
                disabled={isLast}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl h-8">
              <span className="text-[9px] font-black text-slate-600 px-1.5 uppercase">Apagar?</span>
              <button
                onClick={() => { onDelete(niche.id); setConfirmDelete(false) }}
                className="w-5 h-5 flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-500 border border-red-500"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="w-5 h-5 flex items-center justify-center rounded bg-white text-black hover:bg-slate-100 border border-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-5 pb-5">
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-slate-200 rounded-2xl">
              <Briefcase className="w-7 h-7 mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-500">Nenhuma vaga neste nicho</p>
              <p className="text-xs text-slate-400 mt-0.5">Clique em "+ Nova Vaga" e selecione este nicho.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {jobs.map(job => (
                <JobWithMoveMenu
                  key={job.id}
                  job={job}
                  allNiches={allNiches}
                  currentNicheId={niche.id}
                  onJobClick={onJobClick}
                  onJobDelete={onJobDelete}
                  onJobPin={onJobPin}
                  onJobEdit={onJobEdit}
                  onMoveJob={onMoveJob}
                  isDeleting={deletingJobId === job.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
