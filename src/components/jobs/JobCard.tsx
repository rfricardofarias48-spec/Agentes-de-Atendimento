import { useState } from 'react'
import { Briefcase, ChevronRight, Users, Trash2, Pin, Sparkles, Pencil, Check, X } from 'lucide-react'
import { type Job } from '../../types'

interface JobCardProps {
  job: Job
  onClick: (job: Job) => void
  onDelete: (id: string) => void
  onPin: (id: string) => void
  onEdit: (job: Job) => void
  isDeleting?: boolean
}

export function JobCard({ job, onClick, onDelete, onPin, onEdit, isDeleting = false }: JobCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const d = new Date(job.created_at)
  const formattedDate = `(${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')})`

  return (
    <div
      className={`bg-white border border-slate-100 rounded-[2rem] p-6 relative shadow-[0px_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0px_4px_25px_rgba(0,0,0,0.05)] hover:-translate-y-1 transition-all duration-300 flex flex-col h-full select-none ${isDeleting ? 'opacity-70 grayscale pointer-events-none' : ''} ${job.isPinned ? 'ring-2 ring-[#2C82B5] ring-offset-2' : ''}`}
      onMouseLeave={() => confirmDelete && setConfirmDelete(false)}
    >
      {/* Clickable overlay */}
      <div
        className={`absolute inset-0 z-0 ${isDeleting ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => !isDeleting && onClick(job)}
      />

      {/* Header: icon + actions */}
      <div className="flex justify-between items-start mb-5 relative z-10 pointer-events-none">
        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600 shrink-0 border border-slate-100">
          {job.isPinned
            ? <Sparkles className="w-5 h-5 text-[#2C82B5] fill-current" />
            : <Briefcase className="w-5 h-5" />}
        </div>

        <div
          className="flex gap-2 pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          {!confirmDelete ? (
            <>
              <button
                onClick={e => { e.stopPropagation(); onPin(job.id) }}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${job.isPinned ? 'bg-slate-100 text-[#2C82B5]' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                title={job.isPinned ? 'Desafixar' : 'Fixar'}
              >
                <Pin className={`w-3.5 h-3.5 ${job.isPinned ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onEdit(job) }}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all bg-slate-50"
                title="Editar"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); if (!isDeleting) setConfirmDelete(true) }}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all bg-slate-50"
                title="Excluir"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl h-8">
              <span className="text-[9px] font-black text-slate-600 px-2 uppercase">Apagar?</span>
              <button
                onClick={e => { e.stopPropagation(); onDelete(job.id) }}
                className="w-5 h-5 flex items-center justify-center rounded bg-red-600 text-white hover:bg-red-500 border border-red-500"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}
                className="w-5 h-5 flex items-center justify-center rounded bg-white text-black hover:bg-slate-100 border border-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Title + description */}
      <div className="mb-auto pointer-events-none">
        <h3 className="text-xl font-black text-slate-900 tracking-tighter leading-none">
          {job.title}{' '}
          <span className="text-[10px] font-bold text-slate-400 ml-1 align-middle">{formattedDate}</span>
        </h3>
        <div className="h-1 w-10 bg-slate-200 mt-3 mb-4 rounded-full" />
        <p className="text-[11px] font-medium text-slate-500 leading-relaxed line-clamp-3">
          {job.description || 'Descrição não informada pelo recrutador.'}
        </p>
      </div>

      {/* Footer */}
      <div className="pt-5 mt-2 flex items-center justify-between pointer-events-none">
        <div className="bg-slate-50 px-2.5 py-1.5 rounded-full flex items-center gap-1.5 border border-slate-100">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-black text-slate-600">
            {job.candidates.length} {job.candidates.length === 1 ? 'CV' : 'CVs'}
          </span>
        </div>
        <div className="bg-slate-900 text-white px-4 py-1.5 rounded-full flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wide">Analisar</span>
          <ChevronRight className="w-3 h-3 text-[#2C82B5]" />
        </div>
      </div>
    </div>
  )
}
