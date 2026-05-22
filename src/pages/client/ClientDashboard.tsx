import { type ReactNode, useEffect, useState, useMemo } from 'react'
import { CalendarDays, BadgeCheck, Clock, TrendingUp, Zap, ExternalLink, AlertTriangle, Inbox, Calendar, Copy, Eye, EyeOff, LogIn, FileText, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Organization } from '../../types'
import { toBRT } from '../../lib/date'
import { cn } from '../../lib/utils'

type Period = 'day' | 'week' | 'month'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day',   label: 'Hoje'   },
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mês'    },
]

function getPeriodStart(period: Period): Date {
  const brt = toBRT(new Date())
  if (period === 'day') return new Date(brt.getFullYear(), brt.getMonth(), brt.getDate())
  if (period === 'week') {
    const d = new Date(brt); d.setDate(brt.getDate() - 6); d.setHours(0, 0, 0, 0); return d
  }
  return new Date(brt.getFullYear(), brt.getMonth(), 1)
}

const CARD_ACCENTS = {
  brand:   { border: '#2C82B5', iconBg: 'rgba(44,130,181,0.15)',  iconColor: '#2C82B5'  },
  violet:  { border: '#7c3aed', iconBg: 'rgba(124,58,237,0.15)',  iconColor: '#7c3aed'  },
  emerald: { border: '#059669', iconBg: 'rgba(5,150,105,0.15)',   iconColor: '#059669'  },
  amber:   { border: '#d97706', iconBg: 'rgba(217,119,6,0.12)',   iconColor: '#d97706'  },
}

interface Interview {
  id: string
  candidate_id: string
  candidate_name: string | null
  candidate_phone: string | null
  slot_date: string
  slot_time: string
  format: string
  interviewer_name: string | null
  meeting_link: string | null
  status: string
  org_id: string
  created_at: string
  jobs?: { title: string } | null
}

interface Candidate {
  id: string
  created_at: string
  status: string
}

export default function ClientDashboard() {
  const { orgId } = useAuth()
  const [org, setOrg] = useState<Organization | null>(null)
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [notificationPhone, setNotificationPhone] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('month')
  const [loading, setLoading] = useState(true)
  const [chartReady, setChartReady] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30)
      const [{ data: orgData }, { data: interviewData }, { data: candidateData }, { data: settingsData }] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', orgId!).single(),
        supabase.from('interviews').select('*, jobs(title)').eq('org_id', orgId!).order('slot_date', { ascending: true }).order('slot_time', { ascending: true }),
        supabase.from('candidates').select('id, created_at, status').eq('org_id', orgId!),
        supabase.from('agent_settings').select('notification_phone').eq('org_id', orgId!).single(),
      ])
      if (orgData) setOrg(orgData)
      if (interviewData) setInterviews(interviewData as Interview[])
      if (candidateData) setCandidates(candidateData as Candidate[])
      if (settingsData) setNotificationPhone(settingsData.notification_phone ?? null)
      setLoading(false)
    }
    load()
  }, [orgId])

  const filtered = useMemo(() => {
    const start = getPeriodStart(period)
    const filteredCandidates = candidates.filter(c => new Date(c.created_at) >= start)
    const filteredInterviews = interviews.filter(i => new Date(i.created_at) >= start)
    const realized = filteredInterviews.filter(i => i.status === 'REALIZADA').length
    // Tempo economizado: 45 min por currículo + 20 min por entrevista coordenada
    const totalMinutes = filteredCandidates.length * 45 + filteredInterviews.length * 20
    const hours = Math.floor(totalMinutes / 60)
    const mins  = totalMinutes % 60
    const tempoLabel = totalMinutes === 0 ? '0' : hours > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : `${mins}m`
    return {
      curriculos:  filteredCandidates.length,
      entrevistas: filteredInterviews.length,
      realizadas:  realized,
      tempoLabel,
      tempoMinutes: totalMinutes,
    }
  }, [candidates, interviews, period])

  // Chart: currículos por dia (últimos 15 dias)
  const chartData = useMemo(() => {
    const brt = toBRT(new Date()); brt.setHours(0, 0, 0, 0)
    return Array.from({ length: 15 }, (_, i) => {
      const day  = new Date(brt); day.setDate(brt.getDate() - (14 - i))
      const next = new Date(day); next.setDate(day.getDate() + 1)
      const count = candidates.filter(c => {
        const d = toBRT(new Date(c.created_at)); return d >= day && d < next
      }).length
      const dd = String(day.getDate()).padStart(2, '0')
      const mm = String(day.getMonth() + 1).padStart(2, '0')
      return { label: `${dd}/${mm}`, count, isToday: day.getTime() === brt.getTime() }
    })
  }, [candidates])

  useEffect(() => {
    if (!loading) { const t = setTimeout(() => setChartReady(true), 120); return () => clearTimeout(t) }
  }, [loading])

  // Entrevistas agendadas (não realizadas) para listar
  const upcomingInterviews = interviews.filter(i => i.status !== 'REALIZADA').slice(0, 6)

  const handleConfirm = async (interview: Interview, outcome: 'approved' | 'rejected') => {
    setConfirming(true)
    try {
      await fetch('/api/candidates/schedule-interviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId:  interview.id,
          candidateId:  interview.candidate_id,
          orgId:        interview.org_id,
          outcome,
        }),
      })
      setInterviews(prev => prev.map(i => i.id === interview.id ? { ...i, status: 'REALIZADA' } : i))
    } finally {
      setConfirming(false)
      setConfirmingId(null)
    }
  }

  const firstName = org?.name?.split(' ')[0] ?? '—'

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-[2.5px] border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5 w-full">

      {/* ── Greeting + period ───────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h1 className="text-[1.75rem] font-semibold text-gray-900 leading-none">Olá, {firstName}</h1>
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
          {PERIODS.map(({ key, label }) => (
            <button key={key} onClick={() => setPeriod(key)}
              className={cn('px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all duration-200',
                period === key ? 'text-white shadow-[0_2px_8px_rgba(37,112,160,0.28)]' : 'text-slate-400 hover:text-slate-600')}
              style={period === key ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)' } : {}}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* ── 4 Metric Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Currículos"  value={filtered.curriculos}  accent={CARD_ACCENTS.brand}
          icon={<FileText className="w-5 h-5" style={{ color: CARD_ACCENTS.brand.iconColor }} />} />
        <MetricCard label="Entrevistas" value={filtered.entrevistas} accent={CARD_ACCENTS.violet}
          icon={<CalendarDays className="w-5 h-5" style={{ color: CARD_ACCENTS.violet.iconColor }} />} />
        <MetricCard label="Realizadas"  value={filtered.realizadas}  accent={CARD_ACCENTS.emerald}
          icon={<BadgeCheck className="w-5 h-5" style={{ color: CARD_ACCENTS.emerald.iconColor }} />} />
        <MetricCard label="Tempo economizado" value={filtered.tempoLabel} accent={CARD_ACCENTS.amber} isText
          icon={<Clock className="w-5 h-5" style={{ color: CARD_ACCENTS.amber.iconColor }} />}
          subtitle={filtered.tempoMinutes > 0 ? `${filtered.curriculos} CVs · ${filtered.entrevistas} entrevistas` : 'Nenhuma atividade'} />
      </div>

      {/* ── Chart ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(160deg,#1e2a3a 0%,#243447 100%)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
        <style>{`@keyframes floatIn{from{opacity:0;transform:translateY(5px) translateX(-50%)}to{opacity:1;transform:translateY(0) translateX(-50%)}}`}</style>
        <div className="px-6 pt-5 pb-5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'rgba(44,130,181,0.2)' }}>
                <TrendingUp className="w-3.5 h-3.5" style={{ color: '#5bafd4' }} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] leading-none mb-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>Últimos 15 dias</p>
                <p className="text-sm font-bold leading-none" style={{ color: '#e2e8f0' }}>Currículos recebidos por dia</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black leading-none tabular-nums" style={{ color: '#f1f5f9' }}>
                <AnimatedNumber value={chartData.reduce((s, d) => s + d.count, 0)} ready={chartReady} delay={650} />
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mt-1" style={{ color: 'rgba(148,163,184,0.5)' }}>currículos</p>
            </div>
          </div>
          <div className="relative" style={{ height: '140px' }}>
            <div className="absolute inset-0 flex items-end gap-1">
              {chartData.map((day, i) => (
                <ChartBar key={i} label={day.label} count={day.count} index={i}
                  maxCount={Math.max(...chartData.map(d => d.count), 1)} ready={chartReady} />
              ))}
            </div>
          </div>
          <div className="mt-3 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="flex gap-1 mt-2.5">
            {chartData.map((day, i) => (
              <div key={i} className="flex-1 text-center">
                <span className="text-[10px] font-bold tabular-nums transition-opacity duration-300"
                  style={{ opacity: chartReady ? 1 : 0, transitionDelay: `${i * 30 + 200}ms`, color: day.isToday ? 'rgba(255,255,255,0.9)' : 'rgba(148,163,184,0.4)' }}>
                  {day.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* Próximas entrevistas — 3 cols */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #2C82B5, #1e5f88)' }} />
              <h3 className="text-[13px] font-bold text-gray-900">Próximas Entrevistas</h3>
            </div>
          </div>

          {upcomingInterviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
                <Calendar className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-[13px] font-semibold text-slate-400">Nenhuma entrevista agendada.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50/80">
              {upcomingInterviews.map((iv) => {
                const isConfirming = confirmingId === iv.id
                const dateStr = new Date(iv.slot_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                return (
                  <div key={iv.id} className="px-6 py-3.5 hover:bg-slate-50/70 transition-colors">
                    <div className="flex items-center gap-3">
                      {/* Date badge */}
                      <div className="shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center border border-slate-100 bg-slate-50">
                        <span className="text-[11px] font-black text-slate-700 leading-none">{dateStr}</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">{iv.slot_time?.substring(0,5)}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-gray-900 truncate leading-none">
                          {iv.candidate_name || 'Candidato'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {(iv.jobs as { title?: string } | null)?.title ?? '—'} · {iv.format}
                          {iv.interviewer_name ? ` · ${iv.interviewer_name}` : ''}
                        </p>
                      </div>

                      {/* Confirm button or outcome */}
                      {isConfirming ? (
                        <div className="flex items-center gap-2 shrink-0">
                          {confirming ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                          ) : (
                            <>
                              <button onClick={() => handleConfirm(iv, 'approved')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-[11px] font-black hover:bg-emerald-600 transition-all">
                                <ThumbsUp className="w-3 h-3" /> Aprovado
                              </button>
                              <button onClick={() => handleConfirm(iv, 'rejected')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 text-slate-600 text-[11px] font-black hover:bg-red-100 hover:text-red-600 transition-all">
                                <ThumbsDown className="w-3 h-3" /> Reprovado
                              </button>
                              <button onClick={() => setConfirmingId(null)}
                                className="text-[11px] text-slate-400 hover:text-slate-600 px-1">✕</button>
                            </>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => setConfirmingId(iv.id)}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:border-[#2C82B5] hover:text-[#2C82B5] transition-all">
                          <BadgeCheck className="w-3.5 h-3.5" /> Confirmar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Agent card — 2 cols */}
        <AgentCard org={org} interviewCount={interviews.length} notificationPhone={notificationPhone} />
      </div>

    </div>
  )
}

// ── Agent Card ────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }
  return (
    <button onClick={copy} className="shrink-0 p-1 rounded-md hover:bg-slate-100 transition-colors" title="Copiar">
      {copied ? <BadgeCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
    </button>
  )
}

function AgentCard({ org, interviewCount, notificationPhone }: { org: Organization | null; interviewCount: number; notificationPhone: string | null }) {
  const used   = org?.conversations_used ?? 0
  const limit  = org?.max_conversations_month ?? 1
  const pct    = Math.min((used / limit) * 100, 100)
  const remaining = Math.max(limit - used, 0)
  const barGradient = pct > 85 ? 'linear-gradient(90deg,#f43f5e,#fb7185)' : pct > 65 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#2C82B5,#5bafd4)'
  const [progressWidth, setProgressWidth] = useState(0)
  const [showPass, setShowPass] = useState(false)
  useEffect(() => { const t = setTimeout(() => setProgressWidth(pct), 300); return () => clearTimeout(t) }, [pct])
  const hasCredentials = !!(org?.chatwoot_login_email && org?.chatwoot_login_password)

  return (
    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #2C82B5, #1e5f88)' }} />
          <h3 className="text-[13px] font-bold text-gray-900">Agente Bento</h3>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-600">Online</span>
        </div>
      </div>

      <div className="px-5 py-4 flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Conversas este mês</span>
            <span className="text-[12px] font-black text-gray-900 tabular-nums">{used} / {limit}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.05)' }}>
            <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${progressWidth}%`, background: barGradient }} />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-slate-400">{remaining} restantes</span>
            {pct > 85 && <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-500"><AlertTriangle className="w-3 h-3" /> Limite próximo</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl px-3.5 py-3 flex items-center gap-2.5" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 leading-none">Resposta</p>
              <p className="text-[12px] font-black text-gray-900 mt-0.5 leading-none">Instantânea</p>
            </div>
          </div>
          <div className="rounded-xl px-3.5 py-3 flex items-center gap-2.5" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
            <Inbox className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 leading-none">Entrevistas</p>
              <p className="text-[12px] font-black text-gray-900 mt-0.5 leading-none tabular-nums">{interviewCount} total</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl px-3.5 py-3 flex items-center gap-2.5" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
          <div className="w-5 h-5 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
            <span className="text-[10px]">📱</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 leading-none">Alertas para</p>
            {notificationPhone
              ? <p className="text-[12px] font-black text-gray-900 mt-0.5 leading-none tabular-nums truncate">+{notificationPhone}</p>
              : <p className="text-[11px] text-slate-400 mt-0.5 leading-none">Não configurado</p>}
          </div>
        </div>

        {hasCredentials && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(44,130,181,0.18)', background: 'rgba(44,130,181,0.03)' }}>
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b" style={{ borderColor: 'rgba(44,130,181,0.12)' }}>
              <LogIn className="w-3.5 h-3.5 shrink-0" style={{ color: '#2C82B5' }} />
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#2C82B5' }}>Acesso ao Painel de Conversas</p>
            </div>
            <div className="px-3.5 py-3 flex flex-col gap-2">
              <p className="text-[10px] text-slate-500 leading-relaxed">Use estas credenciais para fazer login no Chatwoot e ver as conversas do seu Bento em tempo real.</p>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(44,130,181,0.12)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 leading-none">E-mail</p>
                  <p className="text-[11px] font-semibold text-gray-800 mt-0.5 leading-none truncate">{org!.chatwoot_login_email}</p>
                </div>
                <CopyButton value={org!.chatwoot_login_email!} />
              </div>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(44,130,181,0.12)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 leading-none">Senha</p>
                  <p className="text-[11px] font-semibold text-gray-800 mt-0.5 leading-none font-mono">{showPass ? org!.chatwoot_login_password : '••••••••••••'}</p>
                </div>
                <button onClick={() => setShowPass(p => !p)} className="shrink-0 p-1 rounded-md hover:bg-slate-100 transition-colors">
                  {showPass ? <EyeOff className="w-3.5 h-3.5 text-slate-400" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                <CopyButton value={org!.chatwoot_login_password!} />
              </div>
            </div>
          </div>
        )}

        <button onClick={() => org?.chatwoot_url && window.open(org.chatwoot_url, '_blank')}
          disabled={!org?.chatwoot_url}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all duration-200 hover:shadow-[0_6px_20px_rgba(44,130,181,0.38)] hover:-translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}>
          <ExternalLink className="w-4 h-4" />
          {hasCredentials ? 'Abrir Chatwoot' : 'Ver Agente em Ação'}
        </button>
        {hasCredentials && <p className="text-center text-[10px] text-slate-400 -mt-2">Faça login com as credenciais acima ao abrir pela primeira vez</p>}
      </div>
    </div>
  )
}

// ── Metric Card ────────────────────────────────────────────────────

interface MetricCardProps {
  label: string; value: number | string; icon: ReactNode; isText?: boolean
  accent: { border: string; iconBg: string; iconColor: string }
  subtitle?: string
}

function MetricCard({ label, value, icon, accent, isText, subtitle }: MetricCardProps) {
  return (
    <div className="relative bg-white rounded-2xl px-4 pt-3 pb-4 cursor-default transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
      style={{ border: '1px solid #eef0f3', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div className="absolute top-0 left-4 right-4 h-[3px] rounded-b-full" style={{ background: accent.border }} />
      <div className="flex items-center gap-2 mt-1.5 mb-2.5">
        <div style={{ color: accent.border }}>{icon}</div>
        <p className="text-[11px] font-semibold text-slate-400 tracking-wide">{label}</p>
      </div>
      <p className={cn('font-black leading-none tabular-nums text-gray-900', isText ? 'text-[1.6rem]' : 'text-[2rem]')}>{value}</p>
      {subtitle && <p className="text-[10px] text-slate-400 mt-1">{subtitle}</p>}
    </div>
  )
}

// ── Animated Number ────────────────────────────────────────────────

function AnimatedNumber({ value, ready, delay = 0 }: { value: number; ready: boolean; delay?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (!ready || value === 0) { setDisplay(value); return }
    setDisplay(0); let startTs: number | null = null; let raf: number
    const timer = setTimeout(() => {
      const animate = (ts: number) => {
        if (startTs === null) startTs = ts
        const p = Math.min((ts - startTs) / 900, 1)
        setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * value))
        if (p < 1) raf = requestAnimationFrame(animate)
      }
      raf = requestAnimationFrame(animate)
    }, delay)
    return () => { clearTimeout(timer); cancelAnimationFrame(raf) }
  }, [value, ready, delay])
  return <>{display}</>
}

// ── Chart Bar ──────────────────────────────────────────────────────

function ChartBar({ count, index, maxCount, ready }: { count: number; index: number; maxCount: number; ready: boolean; label: string }) {
  const [displayCount, setDisplayCount] = useState(0)
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    if (!ready || count === 0) { setDisplayCount(count); return }
    setDisplayCount(0); let startTs: number | null = null; let raf: number
    const timer = setTimeout(() => {
      const animate = (ts: number) => {
        if (startTs === null) startTs = ts
        const p = Math.min((ts - startTs) / 700, 1)
        setDisplayCount(Math.round((1 - Math.pow(1 - p, 3)) * count))
        if (p < 1) raf = requestAnimationFrame(animate)
      }
      raf = requestAnimationFrame(animate)
    }, index * 55 + 180)
    return () => { clearTimeout(timer); cancelAnimationFrame(raf) }
  }, [ready, count, index])

  const CHART_H = 140
  const heightPx = count > 0 ? Math.max((count / maxCount) * CHART_H * 0.88, 16) : 4


  return (
    <div className="flex-1 relative flex flex-col justify-end px-[3px]" style={{ height: `${CHART_H}px` }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {hovered && count > 0 && (
        <div className="absolute left-1/2 z-30 pointer-events-none" style={{ bottom: `${heightPx + 10}px`, animation: 'floatIn 0.18s ease-out both' }}>
          <div className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap"
            style={{ background: 'rgba(15,25,40,0.92)', color: '#e2e8f0', transform: 'translateX(-50%)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {displayCount} {displayCount === 1 ? 'currículo' : 'currículos'}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(15,25,40,0.92)' }} />
        </div>
      )}
      <div className="text-center mb-1.5 transition-all duration-200"
        style={{ opacity: ready && count > 0 ? 1 : 0, transitionDelay: `${index * 55 + 450}ms`, transform: hovered ? 'scale(1.2)' : 'scale(1)' }}>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: 'rgba(255,255,255,0.7)' }}>{displayCount}</span>
      </div>
      <div className="w-full relative overflow-hidden"
        style={{
          height: ready ? `${heightPx}px` : '0px',
          background: count > 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.07)',
          borderRadius: count === 0 ? '3px' : '8px 8px 3px 3px',
          transition: `height 0.65s cubic-bezier(0.34,1.56,0.64,1) ${index * 55}ms`,
          filter: hovered && count > 0 ? 'brightness(0.92)' : 'brightness(1)',
          transform: hovered && count > 0 ? 'scaleX(1.06)' : 'scaleX(1)',
          transformOrigin: 'bottom center',
        }}
      />
    </div>
  )
}
