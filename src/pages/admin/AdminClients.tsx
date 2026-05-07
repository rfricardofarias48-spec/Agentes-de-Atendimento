import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'
import { planLabel, statusLabel, formatDateShort } from '../../lib/utils'
import { Card, CardContent, CardHeader } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'

const planColors: Record<string, 'default' | 'secondary' | 'success'> = {
  starter: 'secondary', pro: 'default', clinic: 'success',
}
const statusColors: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  active: 'success', trial: 'warning', inactive: 'secondary', suspended: 'destructive',
}

export default function AdminClients() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [filtered, setFiltered] = useState<Organization[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('organizations').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setOrgs(data ?? []); setFiltered(data ?? []); setLoading(false) })
  }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(orgs.filter(o => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q)))
  }, [search, orgs])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500">{orgs.length} clínicas cadastradas</p>
        </div>
        <Link to="/admin/clients/new">
          <Button className="gap-2"><Plus className="w-4 h-4" />Novo Cliente</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar clínica..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Clínica</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Plano</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">WhatsApp</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Conversas</th>
                    <th className="text-left py-3 px-2 text-gray-500 font-medium">Cadastro</th>
                    <th className="py-3 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(org => (
                    <tr key={org.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-2">
                        <p className="font-medium text-gray-900">{org.name}</p>
                        <p className="text-xs text-gray-400">{org.slug}</p>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={planColors[org.plan] ?? 'outline'}>{planLabel(org.plan)}</Badge>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={statusColors[org.status] ?? 'outline'}>{statusLabel(org.status)}</Badge>
                      </td>
                      <td className="py-3 px-2 text-gray-600">
                        {org.whatsapp_numbers?.length ?? 0} número(s)
                      </td>
                      <td className="py-3 px-2 text-gray-600">
                        {org.conversations_used ?? 0}/{org.max_conversations_month}
                      </td>
                      <td className="py-3 px-2 text-gray-500">{formatDateShort(org.created_at)}</td>
                      <td className="py-3 px-2">
                        <Link to={`/admin/clients/${org.id}`}>
                          <Button variant="outline" size="sm">Gerenciar</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-center py-8 text-gray-400">Nenhum cliente encontrado.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
