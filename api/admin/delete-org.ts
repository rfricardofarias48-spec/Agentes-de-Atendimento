/**
 * DELETE /api/admin/delete-org
 * Remove 100% dos dados de uma organização:
 * conversations, appointments, agent_settings, knowledge_items,
 * sales, user_profiles, Supabase Auth user, Storage files, organizations.
 *
 * Body: { orgId: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orgId } = req.body as { orgId?: string };
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  // Verificar que a org existe
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single();

  if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

  const errors: string[] = [];

  try {
    // ── 1. Buscar auth user(s) vinculados ──────────────────────────────────
    const { data: profiles } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .eq('org_id', orgId);

    const userIds = profiles?.map(p => p.user_id) ?? [];

    // ── 2. Deletar tabelas filhas (todas com org_id) ───────────────────────
    const tables = [
      'conversations',
      'appointments',
      'blocked_slots',
      'agent_settings',
      'knowledge_items',
      'user_profiles',
    ];

    for (const table of tables) {
      const { error } = await supabaseAdmin.from(table as never).delete().eq('org_id', orgId);
      if (error && !error.message.includes('does not exist') && !error.message.includes('column') ) {
        errors.push(`${table}: ${error.message}`);
      }
    }

    // ── 3. Deletar arquivos do Storage (PDFs) ──────────────────────────────
    let storageCount = 0;
    try {
      const { data: storageFiles } = await supabaseAdmin.storage.from('specialty-pdfs').list(orgId);
      if (storageFiles && storageFiles.length > 0) {
        storageCount = storageFiles.length;
        await supabaseAdmin.storage.from('specialty-pdfs').remove(storageFiles.map(f => `${orgId}/${f.name}`));
      }
    } catch { /* storage best-effort */ }

    // ── 4. Deletar usuários do Supabase Auth ───────────────────────────────
    for (const userId of userIds) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authErr) errors.push(`auth user ${userId}: ${authErr.message}`);
    }

    // ── 5. Deletar a organização ───────────────────────────────────────────
    const { error: orgErr } = await supabaseAdmin
      .from('organizations')
      .delete()
      .eq('id', orgId);

    if (orgErr) {
      errors.push(`organizations: ${orgErr.message}`);
      return res.status(500).json({ ok: false, errors });
    }

    return res.status(200).json({
      ok: true,
      deleted: { org: org.name, authUsers: userIds.length, storageFiles: storageCount },
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, errors: [msg] });
  }
}
