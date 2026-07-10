import { useState } from 'react'
import {
  Link2, Copy, Check, Loader2, ExternalLink, DollarSign,
} from 'lucide-react'

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CARD: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #f1f5f9',
  borderRadius: '1rem',
  boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function CurrencyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: '#98a2b3' }}>R$</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-dark w-full pl-9 pr-3.5 py-2.5 text-sm"
      />
    </div>
  )
}

export default function AdminSales() {
  const [clientName, setClientName]     = useState('')
  const [clientEmail, setClientEmail]   = useState('')
  const [setupInput, setSetupInput]     = useState('')
  const [monthlyInput, setMonthlyInput] = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [result, setResult]             = useState<{ url: string; setupFee: number; monthlyFee: number } | null>(null)
  const [copied, setCopied]             = useState(false)

  const setupFee   = Math.max(0, parseFloat(setupInput) || 0)
  const monthlyFee = Math.max(0, parseFloat(monthlyInput) || 0)

  async function handleGenerate() {
    if (!clientName.trim() || !clientEmail.trim()) {
      setError('Preencha nome e e-mail do cliente.')
      return
    }
    if (!monthlyFee) {
      setError('Informe a mensalidade (valor maior que zero).')
      return
    }
    setError(null)
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/sales/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          setupFee,
          monthlyFee,
        }),
      })
      const data = await res.json() as { url?: string; setupFee?: number; monthlyFee?: number; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error || 'Erro ao gerar link')
      setResult({ url: data.url, setupFee: data.setupFee ?? 0, monthlyFee: data.monthlyFee ?? 0 })
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
    setSetupInput('')
    setMonthlyInput('')
    setError(null)
  }

  return (
    <div className="space-y-5 pb-8">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 leading-none">Vendas</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gere o link de pagamento pra um cliente novo — setup e mensalidade negociados livremente, sem planos fixos.
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

          {/* Setup + Mensalidade */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Setup (único)" hint="Cobrado à parte, automaticamente, assim que a mensalidade for paga.">
              <CurrencyInput value={setupInput} onChange={setSetupInput} placeholder="0,00" />
            </Field>
            <Field label="Mensalidade">
              <CurrencyInput value={monthlyInput} onChange={setMonthlyInput} placeholder="299,90" />
            </Field>
          </div>

          {/* Resumo */}
          <div className="p-3.5 rounded-xl space-y-1.5" style={{ background: '#f9fafb', border: '1px solid #f2f4f7' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium" style={{ color: '#667085' }}>Mensalidade</p>
              <p className="text-lg font-bold" style={{ color: '#101828' }}>{fmt(monthlyFee)}</p>
            </div>
            {setupFee > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium" style={{ color: '#667085' }}>Setup (cobrança separada)</p>
                <p className="text-sm font-semibold" style={{ color: '#344054' }}>{fmt(setupFee)}</p>
              </div>
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
                  Mensalidade {fmt(result.monthlyFee)}
                  {result.setupFee > 0 && <> · Setup {fmt(result.setupFee)}</>}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#98a2b3' }}>
                Link de Pagamento (mensalidade)
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
                A conta do cliente será criada automaticamente via webhook, e o acesso enviado por e-mail para <strong>{clientEmail}</strong>.
                {result.setupFee > 0 && ' A cobrança do setup é gerada logo em seguida, separadamente.'}
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
