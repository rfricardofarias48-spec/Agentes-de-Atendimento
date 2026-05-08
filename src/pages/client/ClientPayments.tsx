import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

const PLANS = [
  {
    key: 'essencial',
    name: 'Essencial',
    price_monthly: 299.90,
    description: 'Focado no profissional autônomo que precisa automatizar a agenda e o preparo do paciente.',
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
    description: 'Para clínicas em crescimento que precisam de mais volume e mais atendentes simultâneos.',
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
    key: 'max',
    name: 'Max',
    price_monthly: 849.90,
    description: 'Para clínicas de alto volume que exigem capacidade máxima e suporte ampliado.',
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

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ClientPayments() {
  const [annual, setAnnual] = useState(false)

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Minha Assinatura</h1>
        <p className="text-sm text-gray-500">Escolha o plano ideal para a sua clínica</p>
      </div>

      {/* Billing toggle — equal ao da referência */}
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
            <span className="bg-emerald-400 text-gray-900 text-[10px] font-black px-1.5 py-0.5 rounded-full">
              -20%
            </span>
          </button>
        </div>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
        {PLANS.map(plan => {
          const monthly = plan.price_monthly
          const price = annual ? monthly * (1 - DISCOUNT) : monthly

          return (
            <div
              key={plan.key}
              className={cn(
                'relative flex flex-col rounded-[2rem] p-8',
                plan.highlight
                  ? 'bg-[#111111] text-white shadow-2xl md:-mx-1 md:py-10 z-10'
                  : 'bg-white border border-slate-100 shadow-[0px_4px_24px_rgba(0,0,0,0.05)]',
              )}
            >
              {/* Badge */}
              {plan.badge && (
                <span className="absolute top-7 right-7 bg-emerald-400 text-gray-900 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full">
                  {plan.badge}
                </span>
              )}

              {/* Plan name */}
              <p className={cn(
                'text-xs font-black uppercase tracking-widest mb-4',
                plan.highlight ? 'text-slate-500' : 'text-slate-400',
              )}>
                {plan.name}
              </p>

              {/* Price */}
              <div className="mb-1">
                <div className="flex items-baseline gap-0.5">
                  <span className={cn('text-lg font-bold', plan.highlight ? 'text-white' : 'text-gray-900')}>
                    R$
                  </span>
                  <span className={cn('text-5xl font-black tracking-tighter', plan.highlight ? 'text-white' : 'text-gray-900')}>
                    &nbsp;{fmt(price)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn('text-sm', plan.highlight ? 'text-slate-400' : 'text-slate-400')}>
                    /mês
                  </span>
                  {annual && (
                    <span className="text-xs text-slate-400 line-through">
                      R$ {fmt(monthly)}
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              <p className={cn('text-sm leading-relaxed mt-3 mb-6', plan.highlight ? 'text-slate-400' : 'text-slate-500')}>
                {plan.description}
              </p>

              {/* Features */}
              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className={cn(
                      'mt-0.5 w-[18px] h-[18px] shrink-0 rounded-md flex items-center justify-center',
                      plan.highlight ? 'bg-emerald-400' : 'bg-emerald-400',
                    )}>
                      <Check className="w-3 h-3 text-gray-900" strokeWidth={3} />
                    </span>
                    <span className={cn('text-sm leading-snug', plan.highlight ? 'text-slate-200' : 'text-slate-600')}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <button className={cn(
                'w-full py-3.5 rounded-2xl font-bold text-sm transition-all',
                plan.highlight
                  ? 'bg-emerald-400 text-gray-900 hover:bg-emerald-300 active:bg-emerald-500'
                  : 'border border-slate-200 text-gray-900 bg-white hover:bg-slate-50 hover:border-slate-300',
              )}>
                {plan.cta}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
