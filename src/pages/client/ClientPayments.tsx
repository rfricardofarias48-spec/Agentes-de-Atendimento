import { useEffect, useState } from 'react'
import { Copy, Check, Loader2, FileText, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'
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

interface BillingData {
  monthlyFee: number | null
  nextDueDate: string | null
  asaasStatus: string | null
  subscriptionPayment: PaymentInfo | null
  setupFee: number | null
  setupFeeStatus: 'none' | 'pending' | 'paid'
  setupPayment: PaymentInfo | null
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

          {/* Cobrança pendente da mensalidade */}
          {hasPendingSubscription && (
            <PaymentCard title="Cobrança da mensalidade" payment={data.subscriptionPayment!} />
          )}

          {/* Setup fee pendente */}
          {hasPendingSetup && (
            <PaymentCard title="Taxa de configuração (pagamento único)" payment={data.setupPayment!} />
          )}

          {!hasPendingSubscription && !hasPendingSetup && (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Nenhuma cobrança pendente no momento</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
