import { useEffect, useState } from 'react'
import { Copy, Check, Loader2, FileText, CheckCircle2, AlertTriangle, ExternalLink, Receipt, Clock, QrCode, X, Lock, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'

interface PaymentInfo {
  value: number
  dueDate: string
  status: string
  invoiceUrl: string | null
  bankSlipUrl: string | null
  pix: { encodedImage: string; payload: string } | null
}

interface HistoryEntry {
  value: number
  dueDate: string
  paidDate: string | null
  status: string
  type: 'subscription' | 'setup'
}

interface BillingData {
  monthlyFee: number | null
  nextDueDate: string | null
  asaasStatus: string | null
  subscriptionPayment: PaymentInfo | null
  setupFee: number | null
  setupFeeStatus: 'none' | 'pending' | 'paid'
  setupPayment: PaymentInfo | null
  history: HistoryEntry[]
}

function fmt(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className={cn(
        'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all',
        copied ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
      )}
    >
      {copied ? <><Check className="w-3.5 h-3.5" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar código PIX</>}
    </button>
  )
}

function PaymentCard({ title, payment }: { title: string; payment: PaymentInfo }) {
  const hasAnyMethod = !!(payment.pix || payment.bankSlipUrl || payment.invoiceUrl)
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.03)] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <span className="text-lg font-black text-slate-900">{fmt(payment.value)}</span>
      </div>
      <p className="text-xs text-slate-500">Vencimento: {fmtDate(payment.dueDate)}</p>

      {hasAnyMethod ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {payment.pix && (
            <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">PIX</p>
              <img
                src={`data:image/png;base64,${payment.pix.encodedImage}`}
                alt="QR Code PIX"
                className="w-40 h-40 rounded-lg border border-slate-200 bg-white"
              />
              <CopyButton value={payment.pix.payload} />
            </div>
          )}
          {payment.bankSlipUrl ? (
            <div className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Boleto</p>
              <FileText className="w-10 h-10 text-slate-300" />
              <a
                href={payment.bankSlipUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
              >
                <ExternalLink className="w-3.5 h-3.5" /> Ver boleto
              </a>
            </div>
          ) : !payment.pix && payment.invoiceUrl && (
            <div className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100 md:col-span-2">
              <a
                href={payment.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
              >
                <ExternalLink className="w-3.5 h-3.5" /> Ver cobrança
              </a>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400">Aguardando os dados de pagamento — tente recarregar a página em instantes.</p>
      )}
    </div>
  )
}

// ── Próxima fatura (sem cobrança ativa na Asaas ainda) ──────────────
//
// Quando a org já tem mensalidade/vencimento definidos mas ainda não
// tem uma assinatura real na Asaas gerando cobrança (ex.: contas de
// teste, ou clientes cadastrados antes da integração ficar ativa),
// mostramos a fatura prevista com um botão de PIX que abre uma
// pré-visualização — pra validar o design sem depender de dado real.
// Assim que a org tiver `subscriptionPayment` vindo da Asaas (ver
// api/client/billing.ts), este card some e o PaymentCard real assume
// o lugar automaticamente — nenhuma mudança adicional é necessária.

// Padrão determinístico (não é um QR de verdade, só visual de pré-via)
const DEMO_QR_PATTERN = (() => {
  let seed = 42
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  return Array.from({ length: 21 * 21 }, () => rand() > 0.55)
})()

function DemoQrPattern() {
  const isFinder = (row: number, col: number) => {
    const inCorner = (r: number, c: number) => r < 7 && c < 7
    return inCorner(row, col) || inCorner(row, 20 - col) || inCorner(20 - row, col)
  }
  return (
    <div className="w-40 h-40 rounded-lg border border-slate-200 bg-white p-2 grid grid-cols-[repeat(21,1fr)] grid-rows-[repeat(21,1fr)] gap-[1px]">
      {DEMO_QR_PATTERN.map((on, i) => {
        const row = Math.floor(i / 21)
        const col = i % 21
        const finder = isFinder(row, col)
        return (
          <div key={i} className={cn('rounded-[1px]', (finder || on) ? 'bg-slate-800' : 'bg-transparent')} />
        )
      })}
    </div>
  )
}

const DEMO_PIX_CODE = '00020126360014BR.GOV.BCB.PIX0114demo@elevva.com5204000053039865802BR5913Elevva Demo6009SAO PAULO62070503***6304DEMO'

function NextInvoiceCard({ value, dueDate }: { value: number; dueDate: string | null }) {
  const [showPix, setShowPix] = useState(false)
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.03)] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">Próxima fatura</p>
        <span className="text-lg font-black text-slate-900">{fmt(value)}</span>
      </div>
      <p className="text-xs text-slate-500">Vencimento: {fmtDate(dueDate)}</p>

      <button
        onClick={() => setShowPix(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all duration-200 hover:shadow-[0_6px_20px_rgba(44,130,181,0.38)] hover:-translate-y-[1px] active:translate-y-0"
        style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
      >
        <QrCode className="w-4 h-4" />
        Ver QR Code Pix
      </button>

      {showPix && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowPix(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ background: 'linear-gradient(135deg, #2C82B5 0%, #1e5f88 100%)' }}>
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-white" />
                <h2 className="text-[13px] font-bold text-white">Pagamento via Pix</h2>
              </div>
              <button onClick={() => setShowPix(false)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <div className="px-5 py-5 flex flex-col items-center gap-3">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
                <Sparkles className="w-3 h-3" /> Pré-visualização — cobrança real em breve
              </span>
              <DemoQrPattern />
              <p className="text-xs text-slate-500 text-center">
                {fmt(value)} · vence em {fmtDate(dueDate)}
              </p>
              <CopyButton value={DEMO_PIX_CODE} />
              <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                Este QR code é ilustrativo, só pra conferência do design. A cobrança real via Pix aparecerá aqui
                automaticamente assim que a integração de pagamento desta conta for ativada.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClientPayments() {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Sessão não encontrada')
        const res = await fetch('/api/client/billing', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const json = await res.json() as BillingData & { error?: string }
        if (!res.ok) throw new Error(json.error || 'Erro ao carregar cobrança')
        setData(json)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
    </div>
  )

  const isOverdue = data?.asaasStatus === 'overdue'
  const hasPendingSetup = data?.setupFeeStatus === 'pending' && !!data.setupPayment
  const hasPendingSubscription = !!data?.subscriptionPayment
  const hasNextInvoice = !hasPendingSubscription && data?.monthlyFee != null

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Minha Assinatura</h1>
        <p className="text-sm text-gray-500">Acompanhe sua mensalidade e pagamentos</p>
      </div>

      {error && (
        <p className="text-xs text-center font-medium text-red-500 bg-red-50 px-4 py-2.5 rounded-xl">{error}</p>
      )}

      {isOverdue && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-2xl px-5 py-4">
          <Lock className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700">Acesso ao painel restrito</p>
            <p className="text-xs text-red-500 mt-0.5">
              Identificamos um pagamento em atraso. O acesso às demais telas fica bloqueado até a regularização —
              assim que o pagamento for confirmado, tudo volta ao normal automaticamente.
            </p>
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Banner de status */}
          <div className="bg-[#111111] rounded-[1.75rem] px-8 py-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest">Mensalidade</span>
              <span className={cn(
                'flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full',
                isOverdue ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400',
              )}>
                {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                {isOverdue ? 'Pagamento pendente' : 'Em dia'}
              </span>
            </div>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <h2 className="text-4xl font-black text-white tracking-tight leading-none">
                {fmt(data.monthlyFee)}<span className="text-base font-medium text-slate-500">/mês</span>
              </h2>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Próximo vencimento</p>
                <p className="text-lg font-bold text-white">{fmtDate(data.nextDueDate)}</p>
              </div>
            </div>
            <div className="absolute -right-16 -bottom-16 w-48 h-48 bg-brand-500 rounded-full blur-[80px] opacity-10 pointer-events-none" />
          </div>

          {/* Cobrança pendente da mensalidade (ao vivo na Asaas) */}
          {hasPendingSubscription && (
            <PaymentCard title="Cobrança da mensalidade" payment={data.subscriptionPayment!} />
          )}

          {/* Próxima fatura — ainda sem cobrança ativa na Asaas pra esta org */}
          {hasNextInvoice && (
            <NextInvoiceCard value={data.monthlyFee!} dueDate={data.nextDueDate} />
          )}

          {/* Setup fee pendente */}
          {hasPendingSetup && (
            <PaymentCard title="Taxa de configuração (pagamento único)" payment={data.setupPayment!} />
          )}

          {!hasPendingSubscription && !hasNextInvoice && !hasPendingSetup && (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Nenhuma cobrança pendente no momento</p>
            </div>
          )}

          {/* Histórico de pagamentos */}
          <PaymentHistory entries={data.history} />
        </>
      )}
    </div>
  )
}

// ── Histórico de pagamentos ─────────────────────────────────────────

const HISTORY_STATUS: Record<string, { label: string; className: string }> = {
  paid:     { label: 'Pago',     className: 'bg-emerald-50 text-emerald-600 border border-emerald-100' },
  pending:  { label: 'Pendente', className: 'bg-amber-50 text-amber-600 border border-amber-100' },
  overdue:  { label: 'Atrasado', className: 'bg-red-50 text-red-600 border border-red-100' },
}

const HISTORY_TYPE_LABEL: Record<HistoryEntry['type'], string> = {
  subscription: 'Mensalidade',
  setup: 'Taxa de configuração',
}

function PaymentHistory({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-50">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(44,130,181,0.1)' }}>
          <Receipt className="w-4 h-4" style={{ color: '#2C82B5' }} />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800 leading-none">Histórico de pagamentos</p>
          <p className="text-[11px] text-slate-400 mt-1">Últimas cobranças geradas</p>
        </div>
      </div>

      <div className="divide-y divide-slate-50">
        {entries.map((entry, i) => {
          const statusInfo = HISTORY_STATUS[entry.status] ?? { label: entry.status, className: 'bg-slate-50 text-slate-500 border border-slate-100' }
          return (
            <div key={i} className="flex items-center justify-between gap-4 px-6 py-3.5 hover:bg-slate-50/60 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                  {entry.status === 'paid'
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : <Clock className="w-4 h-4 text-amber-500" />
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 truncate leading-none">
                    {HISTORY_TYPE_LABEL[entry.type]}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {entry.status === 'paid' && entry.paidDate ? `Pago em ${fmtDate(entry.paidDate)}` : `Venceu em ${fmtDate(entry.dueDate)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-black text-slate-900 tabular-nums">{fmt(entry.value)}</span>
                <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap', statusInfo.className)}>
                  {statusInfo.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
