import { CreditCard } from 'lucide-react'
import { Card, CardContent } from '../../components/ui/card'

export default function ClientPayments() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pagamentos</h1>
        <p className="text-sm text-gray-500">Cobranças geradas pelo agente via Asaas</p>
      </div>

      <Card>
        <CardContent className="py-16">
          <div className="text-center text-gray-400">
            <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Integração Asaas</p>
            <p className="text-sm mt-1">Configure a chave Asaas nas configurações para ativar cobranças via WhatsApp.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
