import { useState } from 'react'
import {
  Link2, Copy, Check, Loader2, ExternalLink, DollarSign,
} from 'lucide-react'

type Plan = 'starter' | 'pro' | 'clinic'
type Billing = 'mensal' | 'anual'

const ANNUAL_DISCOUNT = 0.20

const PLAN_LABELS: Record<Plan, string> = {
  starter: 'Essencial',
  pro:     'Pro',
  clinic:  'Max',
}

const MONTHLY: Record<Plan, number> = {
  starter: 299.90,
  pro:     449.90,
  clinic:  849.90,
}

function annualTotal(plan: Plan) {
  return parseFloat((MONTHLY[plan] * 12 * (1 - ANNUAL_DISCOUNT)).toFixed(2))
}

const PLAN_PRICES: Record<Plan, { mensal: number; anual: number }> = {
  starter: { mensal: MONTHLY.starter, anual: annualTotal('starter') },
  pro:     { mensal: MONTHLY.pro,     anual: annualTotal('pro') },
  clinic:  { mensal: MONTHLY.clinic,  anual: annualTotal('clinic') },
}

const PLAN_COLORS: Record<Plan, { bg: string; text: string; border: string }> = {
  starter: { bg: '#f8fafc', text: '#475467',  border: '#e4e7ec' },
  pro:     { bg: '#eff6ff', text: '#1d4ed8',  border: '#bfdbfe' },
  clinic:  { bg: '#f0f7ff', text: '#2570a0',  border: '#b3d4ec' },
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CARD: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #f1f5f9',
  borderRadius: '1rem',
  boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

export default function AdminSales() {
  const [clientName, setClientName]       = useState('')
  const [clientEmail, setClientEmail]     = useState('')
  const [plan, setPlan]                   = useState<Plan>('starter')
  const [billing, setBilling]             = useState<Billing>('mensal')
  const [discountInput, setDiscountInput] = useState('')
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [result, setResult]               = useState<{ url: string; planLabel: string; billing: string; amount: number; discountPercent: number } | null>(null)
  const [copied, setCopied]               = useState(false)

  const baseAmount   = PLAN_PRICES[plan][billing]
  const discountPct  = Math.min(100, Math.max(0, parseFloat(discountInput) || 0))
  const amount       = parseFloat((baseAmount * (1 - discountPct / 100)).toFixed(2))
  const monthlyEquiv = billing === 'anual' ? amount / 12 : null
  const annualDiscount = billing === 'anual' ? Math.round((1 - PLAN_PRICES[plan].anual / (PLAN_PRICES[plan].mensal * 12)) * 100) : 0

  async function handleGenerate() {
    if (!clientName.trim() || !clientEmail.trim()) {
      setError('Preencha nome e e-mail do cliente.')
      return
    }
    setError(null)
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/sales/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName: clientName.trim(), clientEmail: clientEmail.trim(), plan, billing, discountPercent: discountPct }),
      })
      const data = await res.json() as { url?: string; planLabel?: string; billing?: string; amount?: number; discountPercent?: number; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error || 'Erro ao gerar link')
      setResult({ url: data.url, planLabel: data.planLabel!, billing: data.billing!, amount: data.amount!, discountPercent: data.discountPercent ?? 0 })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  function copyLink() {
    if (!result?.url) return
    navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function reset() {
    setResult(null)
    setClientName('')
    setClientEmail('')
    setDiscountInput('')
    setError(null)
  }

  return (
    <div className="space-y-5 pb-8">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 leading-none">Vendas</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gere links de pagamento Asaas para novos clientes
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* ── Formulário ───────────────────────────────────────────── */}
        <div style={CARD} className="p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #2C82B5, #1e5f88)' }} />
            <p className="font-bold text-[13px] text-gray-900">Novo Link de Pagamento</p>
          </div>

          {/* Cliente */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome do Cliente">
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="João Silva"
                className="input-dark w-full px-3.5 py-2.5 text-sm"
              />
            </Field>
            <Field label="E-mail">
              <input
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                placeholder="joao@clinica.com"
                className="input-dark w-full px-3.5 py-2.5 text-sm"
              />
            </Field>
          </div>

          {/* Plano */}
          <Field label="Plano">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PLAN_LABELS) as Plan[]).map(p => {
                const colors = PLAN_COLORS[p]
                const active = plan === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl transition-all text-center"
                    style={active ? {
                      background: colors.bg,
                      border: `2px solid ${colors.border}`,
                      color: colors.text,
                      boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
                    } : {
                      border: '2px solid #e4e7ec',
                      color: '#98a2b3',
                    }}
                  >
                    <span className="text-[13px] font-bold">{PLAN_LABELS[p]}</span>
                    <span className="text-[11px] font-medium">{fmt(PLAN_PRICES[p].mensal)}/mês</span>
                  </button>
                )
              })}
            </div>
          </Field>

          {/* Período */}
          <Field label="Período">
            <div className="flex gap-2">
              {(['mensal', 'anual'] as Billing[]).map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBilling(b)}
                  className="flex-1 flex flex-col items-center gap-0.5 px-3 py-3 rounded-xl transition-all"
                  style={billing === b ? {
                    background: '#f0f7ff',
                    border: '2px solid #b3d4ec',
                    color: '#2570a0',
                    boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
                  } : {
                    border: '2px solid #e4e7ec',
                    color: '#98a2b3',
                  }}
                >
                  <span className="text-[13px] font-bold capitalize">{b}</span>
                  {b === 'anual' ? (
                    <>
                      <span className="text-[11px] font-semibold">{fmt(PLAN_PRICES[plan].anual)}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: '#dcfce7', color: '#16a34a' }}>
                        -{annualDiscount}% off
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] font-semibold">{fmt(PLAN_PRICES[plan].mensal)}</span>
                  )}
                </button>
              ))}
            </div>
          </Field>

          {/* Desconto adicional */}
          <Field label="Desconto adicional (%)">
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={discountInput}
                onChange={e => setDiscountInput(e.target.value)}
                placeholder="0"
                className="input-dark w-full px-3.5 py-2.5 text-sm pr-10"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: '#98a2b3' }}>%</span>
            </div>
          </Field>

          {/* Resumo */}
          <div className="p-3.5 rounded-xl space-y-1.5" style={{ background: '#f9fafb', border: '1px solid #f2f4f7' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium" style={{ color: '#667085' }}>
                {PLAN_LABELS[plan]} · {billing === 'anual' ? 'Anual' : 'Mensal'}
              </p>
              {discountPct > 0
                ? <p className="text-xs line-through" style={{ color: '#98a2b3' }}>{fmt(baseAmount)}</p>
                : <p className="text-lg font-bold" style={{ color: '#101828' }}>{fmt(amount)}</p>
              }
            </div>
            {discountPct > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  -{discountPct}% desconto
                </span>
                <p className="text-lg font-bold" style={{ color: '#101828' }}>{fmt(amount)}</p>
              </div>
            )}
            {monthlyEquiv && (
              <p className="text-[11px]" style={{ color: '#98a2b3' }}>
                equivale a {fmt(monthlyEquiv)}/mês
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs font-medium text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm disabled:opacity-60"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              : <><Link2 className="w-4 h-4" /> Gerar Link de Pagamento</>
            }
          </button>
        </div>

        {/* ── Link gerado ──────────────────────────────────────────── */}
        {result ? (
          <div style={CARD} className="p-6 space-y-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#f0fdf4' }}>
                <Check className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: '#101828' }}>Link gerado com sucesso!</p>
                <p className="text-xs" style={{ color: '#98a2b3' }}>
                  {result.planLabel} · {result.billing === 'anual' ? 'Anual' : 'Mensal'} · {fmt(result.amount)}
                  {result.discountPercent > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded font-bold text-[10px]" style={{ background: '#dcfce7', color: '#16a34a' }}>
                      -{result.discountPercent}% off
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#98a2b3' }}>
                Link de Pagamento
              </p>
              <div
                className="flex items-center gap-2 p-3 rounded-xl"
                style={{ background: '#f9fafb', border: '1px solid #e4e7ec' }}
              >
                <p className="flex-1 text-xs font-mono truncate" style={{ color: '#344054' }}>{result.url}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={copyLink}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={copied
                  ? { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a' }
                  : { border: '1px solid #e4e7ec', color: '#344054' }
                }
                onMouseEnter={e => { if (!copied) (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
                onMouseLeave={e => { if (!copied) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {copied ? <><Check className="w-4 h-4" /> Copiado!</> : <><Copy className="w-4 h-4" /> Copiar Link</>}
              </button>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ border: '1px solid #e4e7ec', color: '#344054' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f9fafb'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <ExternalLink className="w-4 h-4" />
                Abrir
              </a>
            </div>

            <div className="p-3.5 rounded-xl space-y-1" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
              <p className="text-xs font-semibold" style={{ color: '#92400e' }}>Após o pagamento</p>
              <p className="text-xs" style={{ color: '#a16207' }}>
                A conta do cliente será criada automaticamente via webhook. O acesso será enviado por e-mail para <strong>{clientEmail}</strong>.
              </p>
            </div>

            <button
              onClick={reset}
              className="w-full text-xs font-medium py-2 rounded-xl transition-colors"
              style={{ color: '#98a2b3', border: '1px solid #f2f4f7' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f9fafb'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              Gerar outro link
            </button>
          </div>
        ) : (
          <div
            style={{ ...CARD, borderStyle: 'dashed' }}
            className="p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[280px]"
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: '#f9fafb', border: '1px solid #e4e7ec' }}>
              <DollarSign className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: '#667085' }}>Nenhum link gerado</p>
              <p className="text-xs mt-1" style={{ color: '#98a2b3' }}>
                Preencha o formulário e clique em Gerar Link
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
