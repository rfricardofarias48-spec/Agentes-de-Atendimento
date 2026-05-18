/**
 * DELETE /api/admin/delete-org
 * Remove 100% dos dados de uma organização:
 *   - Instância Evolution (DELETE /instance/delete/:name)
 *   - Account Chatwoot via Platform API (cascata: contacts, conversations, inboxes, etc.)
 *   - Usuário Chatwoot criado exclusivamente para esta org
 *   - Tabelas Supabase: conversations, appointments, blocked_slots,
 *     agent_settings, knowledge_items, sales, user_profiles
 *   - Arquivos do Storage (specialty-pdfs)
 *   - Usuários Supabase Auth vinculados
 *   - Registro da organização
 *
 * Body: { orgId: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { deleteInstance } from '../_services/evolutionService.js';
import { platformDeleteAccount, platformDeleteUser } from '../_services/chatwootService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orgId } = req.body as { orgId?: string };
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  // Busca a org com todos os campos necessários para o cleanup externo
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name, evolution_instance, evolution_token, chatwoot_account_id, chatwoot_user_id')
    .eq('id', orgId)
    .single();

  if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

  const errors: string[] = [];
  const deleted: Record<string, unknown> = { org: org.name };

  try {
    // ── 1. Deletar instância Evolution ────────────────────────────────────────
    // Faz logout automático se conectada e remove todos os dados da instância.
    if (org.evolution_instance) {
      const evOk = await deleteInstance(org.evolution_instance, org.evolution_token);
      deleted.evolutionInstance = evOk ? org.evolution_instance : null;
      if (!evOk) errors.push(`evolution: falha ao deletar instância ${org.evolution_instance}`);
    }

    // ── 2. Deletar Account Chatwoot (cascata completa) ────────────────────────
    // Apaga contacts, conversations, messages, inboxes, agents, webhooks, etc.
    // Somente a account desta org é afetada.
    if (org.chatwoot_account_id) {
      const cwAccountOk = await platformDeleteAccount(org.chatwoot_account_id);
      deleted.chatwootAccount = cwAccountOk ? org.chatwoot_account_id : null;
      if (!cwAccountOk) errors.push(`chatwoot account #${org.chatwoot_account_id}: falha ao deletar`);

      // ── 3. Deletar usuário Chatwoot exclusivo desta org ─────────────────────
      // chatwoot_user_id é salvo no setup automático; só deletamos se existir.
      if (org.chatwoot_user_id) {
        const cwUserOk = await platformDeleteUser(org.chatwoot_user_id);
        deleted.chatwootUser = cwUserOk ? org.chatwoot_user_id : null;
        if (!cwUserOk) errors.push(`chatwoot user #${org.chatwoot_user_id}: falha ao deletar`);
      }
    }

    // ── 4. Buscar auth user(s) Supabase vinculados ────────────────────────────
    const { data: profiles } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .eq('org_id', orgId);

    const authUserIds = profiles?.map(p => p.user_id) ?? [];

    // ── 5. Deletar tabelas filhas (todas com org_id) ──────────────────────────
    const tables = [
      'conversations',
      'appointments',
      'blocked_slots',
      'agent_settings',
      'knowledge_items',
      'sales',
      'user_profiles',
    ];

    for (const table of tables) {
      const { error } = await supabaseAdmin.from(table as never).delete().eq('org_id', orgId);
      if (error && !error.message.includes('does not exist') && !error.message.includes('column')) {
        errors.push(`${table}: ${error.message}`);
      }
    }

    // ── 6. Deletar arquivos do Storage (PDFs) ─────────────────────────────────
    let storageCount = 0;
    try {
      const { data: storageFiles } = await supabaseAdmin.storage.from('specialty-pdfs').list(orgId);
      if (storageFiles && storageFiles.length > 0) {
        storageCount = storageFiles.length;
        await supabaseAdmin.storage
          .from('specialty-pdfs')
          .remove(storageFiles.map(f => `${orgId}/${f.name}`));
      }
    } catch { /* storage best-effort */ }
    deleted.storageFiles = storageCount;

    // ── 7. Deletar usuários do Supabase Auth ──────────────────────────────────
    for (const userId of authUserIds) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authErr) errors.push(`auth user ${userId}: ${authErr.message}`);
    }
    deleted.authUsers = authUserIds.length;

    // ── 8. Deletar a organização ──────────────────────────────────────────────
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
      deleted,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, errors: [msg] });
  }
}
