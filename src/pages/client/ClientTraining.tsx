import { useEffect, useState } from 'react'
import { Plus, Trash2, BookOpen, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type KnowledgeItem } from '../../types'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'

export default function ClientTraining() {
  const { orgId } = useAuth()
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', type: 'faq' as 'faq' | 'instruction', specialty: '' })

  async function load() {
    if (!orgId) return
    const { data } = await supabase.from('knowledge_items').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  async function handleAdd() {
    if (!form.title || !form.content || !orgId) return
    const { error } = await supabase.from('knowledge_items').insert({
      org_id: orgId, type: form.type, title: form.title,
      content: form.content, specialty: form.specialty || null, active: true,
    })
    if (!error) { setForm({ title: '', content: '', type: 'faq', specialty: '' }); setAdding(false); load() }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este item?')) return
    await supabase.from('knowledge_items').delete().eq('id', id)
    load()
  }

  async function toggleActive(item: KnowledgeItem) {
    await supabase.from('knowledge_items').update({ active: !item.active }).eq('id', item.id)
    load()
  }

  const typeLabel = (t: string) => t === 'faq' ? 'FAQ' : t === 'instruction' ? 'Instrução' : 'PDF'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Treinamento do Agente</h1>
          <p className="text-sm text-gray-500">Ensine o agente sobre sua clínica</p>
        </div>
        <Button onClick={() => setAdding(true)} className="gap-2" disabled={adding}>
          <Plus className="w-4 h-4" /> Adicionar
        </Button>
      </div>

      {/* Form novo item */}
      {adding && (
        <Card className="border-primary/30 bg-blue-50/30">
          <CardHeader><CardTitle className="text-base">Novo Item de Treinamento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              {(['faq', 'instruction'] as const).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${form.type === t ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600'}`}>
                  {typeLabel(t)}
                </button>
              ))}
            </div>
            <Input placeholder="Título (ex: Qual o horário de atendimento?)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <textarea
              className="w-full border border-input rounded-md px-3 py-2 text-sm min-h-[100px] resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Resposta ou instrução completa..."
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            />
            <Input placeholder="Especialidade (opcional, ex: Cardiologia)" value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} />
            <div className="flex gap-2">
              <Button onClick={handleAdd} size="sm">Salvar</Button>
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum item de treinamento ainda.</p>
              <p className="text-xs mt-1">Adicione FAQs e instruções para o agente responder melhor.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map(item => (
                <div key={item.id} className={`flex items-start gap-3 p-4 rounded-lg border ${item.active ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50 opacity-60'}`}>
                  <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm text-gray-900">{item.title}</p>
                      <Badge variant="secondary" className="text-xs">{typeLabel(item.type)}</Badge>
                      {item.specialty && <Badge variant="outline" className="text-xs">{item.specialty}</Badge>}
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2">{item.content}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(item)} className="text-xs">
                      {item.active ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
