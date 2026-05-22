/**
 * GET  /api/admin/users?orgId=xxx  → retorna email do usuário da org
 * POST /api/admin/users            → cria usuário e vincula à org
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // ── GET: busca email do usuário da org ────────────────────────────────────
  if (req.method === 'GET') {
    const orgId = req.query.orgId as string;
    if (!orgId) return res.status(400).json({ error: 'orgId required' });

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .eq('org_id', orgId)
      .single();

    if (!profile?.user_id) return res.status(200).json({ email: null });

    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
    if (error || !user) return res.status(200).json({ email: null });

    return res.status(200).json({ email: user.email ?? null, userId: user.id });
  }

  // ── POST: cria usuário e vincula ao org ───────────────────────────────────
  if (req.method === 'POST') {
    const { orgId, email, password } = req.body as {
      orgId?: string; email?: string; password?: string;
    };
    if (!orgId || !email || !password)
      return res.status(400).json({ error: 'orgId, email e password são obrigatórios' });

    let { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
    });

    if (authError && (authError.message.toLowerCase().includes('already') || authError.status === 422)) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const found = list?.users?.find(u => u.email === email);
      if (found) await supabaseAdmin.auth.admin.deleteUser(found.id);
      ({ data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
      }));
    }

    if (authError) return res.status(400).json({ error: authError.message });

    const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
      user_id: authData.user.id, org_id: orgId, role: 'client',
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: 'Erro ao vincular usuário: ' + profileError.message });
    }

    return res.status(200).json({ ok: true, userId: authData.user.id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
