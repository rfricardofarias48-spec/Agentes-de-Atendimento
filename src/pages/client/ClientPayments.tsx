import { useEffect, useState } from 'react'
import { Check, Zap, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Organization } from '../../types'
import { cn } from '../../lib/utils'

// ── Plan metadata ──────────────────────────────────────────────
const PLAN_META: Record<string, { label: string; price: number }> = {
  starter: { label: 'Essencial', price: 299.90 },
  pro:     { label: 'Pro',       price: 449.90 },
  clinic:  { label: 'Max',       price: 849.90 },
}

const PLANS = [
  {
    key: 'starter',
    name: 'Essencial',
    price_monthly: 299.90,
    description: 'Para o profissional autônomo automatizar agenda e atendimento.',
    highlight: false,
    badge: null,
    features: [
      'Até 100 agendamentos/mês',
      'Agendamento, reagendamento e cancelamento',
      'Orientações Pré-Consulta',
      'Orçamentos',
      'Atendimento Humano (1 assento no Chatwoot)',
    ],
    cta: 'Assinar Essencial',
  },
  {
    key: 'pro',
    name: 'Pro',
    price_monthly: 449.90,
    description: 'Mais volume e atendentes para clínicas em crescimento.',
    highlight: true,
    badge: 'Mais Popular',
    features: [
      'Até 200 agendamentos/mês',
      'Agendamento, reagendamento e cancelamento',
      'Orientações Pré-Consulta',
      'Orçamentos',
      'Atendimento Humano (2 assentos no Chatwoot)',
    ],
    cta: 'Assinar Pro',
  },
  {
    key: 'clinic',
    name: 'Max',
    price_monthly: 849.90,
    description: 'Alta capacidade e suporte ampliado para clínicas de grande volume.',
    highlight: false,
    badge: null,
    features: [
      'Até 400 agendamentos/mês',
      'Agendamento, reagendamento e cancelamento',
      'Orientações Pré-Consulta',
      'Orçamentos',
      'Atendimento Humano (3 assentos no Chatwoot)',
    ],
    cta: 'Assinar Max',
  },
]

const DISCOUNT = 0.20

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ClientPayments() {
  const { orgId } = useAuth()
  const [org, setOrg] = useState<Organization | null>(null)
  const [annual, setAnnual] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [ctaError, setCtaError] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    supabase.from('organizations').select('*').eq('id', orgId).single()
      .then(({ data }) => { if (data) setOrg(data) })
  }, [orgId])

  const planMeta = org ? (PLAN_META[org.plan] ?? { label: org.plan, price: 0 }) : null
  const usagePct = org ? Math.min(100, (org.conversations_used / org.max_conversations_month) * 100) : 0

  async function handleSubscribe(planKey: string) {
    setCtaError(null)
    setLoadingPlan(planKey)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Usuário não identificado')

      const res = await fetch('/api/sales/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: org?.name ?? user.email,
          clientEmail: user.email,
          plan: planKey,
          billing: annual ? 'anual' : 'mensal',
        }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error || 'Erro ao gerar link')
      window.open(data.url, '_blank')
    } catch (e) {
      setCtaError(String(e))
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Minha Assinatura</h1>
        <p className="text-sm text-gray-500">Escolha o plano ideal para a sua clínica</p>
      </div>

      {/* ── Active Plan Banner ──────────────────────────────────── */}
      {org && planMeta && (
        <div className="bg-[#111111] rounded-[1.75rem] px-8 py-5 relative overflow-hidden">

          {/* Top row */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest">
              Plano Ativo
            </span>
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <Zap className="w-4 h-4 text-brand-400" />
            </div>
          </div>

          {/* Plan name + usage */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <h2 className="text-4xl font-black text-white uppercase tracking-tight leading-none">
              {planMeta.label}
            </h2>

            {/* Usage counter */}
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                Conversas este mês
              </p>
              <p className="text-2xl font-black text-white">
                {org.conversations_used}
                <span className="text-slate-500 text-base font-medium"> / {org.max_conversations_month}</span>
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${usagePct}%`,
                  background: usagePct > 80 ? '#f43f5e' : '#4ade80',
                }}
              />
            </div>
          </div>

          {/* Decorative glow */}
          <div className="absolute -right-16 -bottom-16 w-48 h-48 bg-brand-500 rounded-full blur-[80px] opacity-10 pointer-events-none" />
        </div>
      )}

      {/* ── Plans Available ─────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Planos Disponíveis</span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* Billing toggle */}
      <div className="flex justify-center">
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
          <button
            onClick={() => setAnnual(false)}
            className={cn(
              'px-5 py-2 rounded-xl text-sm font-bold transition-all',
              !annual ? 'bg-gray-900 text-white' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            Mensal
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={cn(
              'flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all',
              annual ? 'bg-gray-900 text-white' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            Anual
            <span className="bg-brand-400 text-gray-900 text-[10px] font-black px-1.5 py-0.5 rounded-full">
              -20%
            </span>
          </button>
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {PLANS.map(plan => {
          const price = annual ? plan.price_monthly * (1 - DISCOUNT) : plan.price_monthly
          const selectedBilling = annual ? 'anual' : 'mensal'
          const samePlan = org?.plan === plan.key
          // Mesmo plano E mesmo período → desabilitado
          const isCurrent = samePlan && (org?.billing ?? 'mensal') === selectedBilling
          // Mesmo plano mas período diferente → permite migrar para anual
          const isUpgradeBilling = samePlan && !isCurrent && selectedBilling === 'anual'

          return (
            <div
              key={plan.key}
              className={cn(
                'relative flex flex-col rounded-[2rem] px-6 py-8',
                plan.highlight
                  ? 'bg-[#111111] text-white shadow-2xl md:-mx-1 md:py-10 z-10'
                  : 'bg-white border border-slate-100 shadow-[0px_4px_24px_rgba(0,0,0,0.05)]',
              )}
            >
              {/* Badge */}
              {plan.badge && (
                <span className="absolute top-5 right-5 bg-brand-400 text-gray-900 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full">
                  {plan.badge}
                </span>
              )}

              {/* Plan name */}
              <p className={cn(
                'text-xs font-black uppercase tracking-widest mb-2',
                plan.highlight ? 'text-slate-500' : 'text-slate-400',
              )}>
                {plan.name}
              </p>

              {/* Price */}
              <div className="mb-1">
                <div className="flex items-baseline gap-1">
                  <span className={cn('text-4xl font-black tracking-tighter', plan.highlight ? 'text-white' : 'text-gray-900')}>
                    R$ {fmt(price)}
                  </span>
                  <span className={cn('text-sm font-medium', plan.highlight ? 'text-slate-400' : 'text-slate-400')}>
                    /mês
                  </span>
                </div>
                {annual && (
                  <p className="text-xs font-medium text-brand-500 mt-0.5">
                    Cobrado como R$ {fmt(price * 12)}/ano
                  </p>
                )}
              </div>

              {/* Description */}
              <p className={cn('text-sm leading-relaxed mt-2 mb-7', plan.highlight ? 'text-slate-400' : 'text-slate-500')}>
                {plan.description}
              </p>

              {/* Features */}
              <ul className="space-y-2 flex-1 mb-5">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 w-[18px] h-[18px] shrink-0 rounded-md bg-brand-400 flex items-center justify-center">
                      <Check className="w-3 h-3 text-gray-900" strokeWidth={3} />
                    </span>
                    <span className={cn('text-sm leading-snug', plan.highlight ? 'text-slate-200' : 'text-slate-600')}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                disabled={isCurrent || loadingPlan === plan.key}
                onClick={() => !isCurrent && handleSubscribe(plan.key)}
                className={cn(
                  'w-full py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                  isCurrent
                    ? 'bg-brand-400/20 text-brand-600 cursor-default border border-brand-400/30'
                    : plan.highlight
                      ? 'bg-brand-400 text-gray-900 hover:bg-brand-300 active:bg-brand-500 disabled:opacity-60'
                      : 'border border-slate-200 text-gray-900 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60',
                )}
              >
                {loadingPlan === plan.key
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Aguarde...</>
                  : isCurrent
                    ? 'Plano Atual'
                    : isUpgradeBilling
                      ? 'Migrar para Anual'
                      : plan.cta
                }
              </button>
            </div>
          )
        })}
      </div>

      {ctaError && (
        <p className="text-xs text-center font-medium text-red-500 bg-red-50 px-4 py-2.5 rounded-xl">
          {ctaError}
        </p>
      )}
    </div>
  )
}
