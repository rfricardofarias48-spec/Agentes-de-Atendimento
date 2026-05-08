/**
 * DELETE /api/admin/delete-org
 * Remove 100% dos dados de uma organização:
 * conversations, appointments, agent_settings, knowledge_items,
 * sales, user_profiles, Supabase Auth user, Storage files, organizations.
 *
 * Body: { orgId: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orgId } = req.body as { orgId?: string };
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  // Verificar que a org existe
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single();

  if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

  const errors: string[] = [];

  // ── 1. Buscar auth user(s) vinculados ────────────────────────────────────
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('org_id', orgId);

  const userIds = profiles?.map(p => p.user_id) ?? [];

  // ── 2. Deletar conversas ─────────────────────────────────────────────────
  const { error: convErr } = await supabase
    .from('conversations')
    .delete()
    .eq('org_id', orgId);
  if (convErr) errors.push(`conversations: ${convErr.message}`);

  // ── 3. Deletar agendamentos ──────────────────────────────────────────────
  const { error: apptErr } = await supabase
    .from('appointments')
    .delete()
    .eq('org_id', orgId);
  if (apptErr) errors.push(`appointments: ${apptErr.message}`);

  // ── 4. Deletar configurações do agente ───────────────────────────────────
  const { error: agentErr } = await supabase
    .from('agent_settings')
    .delete()
    .eq('org_id', orgId);
  if (agentErr) errors.push(`agent_settings: ${agentErr.message}`);

  // ── 5. Deletar itens de conhecimento ─────────────────────────────────────
  const { error: knowledgeErr } = await supabase
    .from('knowledge_items')
    .delete()
    .eq('org_id', orgId);
  if (knowledgeErr && !knowledgeErr.message.includes('does not exist')) {
    errors.push(`knowledge_items: ${knowledgeErr.message}`);
  }

  // ── 6. Deletar vendas ────────────────────────────────────────────────────
  const { error: salesErr } = await supabase
    .from('sales')
    .delete()
    .eq('org_id', orgId);
  if (salesErr && !salesErr.message.includes('does not exist')) {
    errors.push(`sales: ${salesErr.message}`);
  }

  // ── 7. Deletar user_profiles ─────────────────────────────────────────────
  const { error: profileErr } = await supabase
    .from('user_profiles')
    .delete()
    .eq('org_id', orgId);
  if (profileErr) errors.push(`user_profiles: ${profileErr.message}`);

  // ── 8. Deletar arquivos do Storage (PDFs) ────────────────────────────────
  const { data: storageFiles } = await supabase.storage
    .from('specialty-pdfs')
    .list(orgId);

  if (storageFiles && storageFiles.length > 0) {
    const paths = storageFiles.map(f => `${orgId}/${f.name}`);
    const { error: storageErr } = await supabase.storage
      .from('specialty-pdfs')
      .remove(paths);
    if (storageErr) errors.push(`storage: ${storageErr.message}`);
  }

  // ── 9. Deletar usuários do Supabase Auth ─────────────────────────────────
  for (const userId of userIds) {
    const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
    if (authErr) errors.push(`auth user ${userId}: ${authErr.message}`);
  }

  // ── 10. Deletar a organização ────────────────────────────────────────────
  const { error: orgErr } = await supabase
    .from('organizations')
    .delete()
    .eq('id', orgId);
  if (orgErr) {
    errors.push(`organizations: ${orgErr.message}`);
    return res.status(500).json({ ok: false, errors });
  }

  return res.status(200).json({
    ok: true,
    deleted: {
      org: org.name,
      authUsers: userIds.length,
      storageFiles: storageFiles?.length ?? 0,
    },
    errors: errors.length > 0 ? errors : undefined,
  });
}
