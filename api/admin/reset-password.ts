/**
 * POST /api/admin/reset-password
 * Redefine a senha de um usuário vinculado a uma organização.
 * Body: { orgId: string; newPassword: string; email?: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId, newPassword, email } = req.body as { orgId?: string; newPassword?: string; email?: string };

  if (!orgId || !newPassword) return res.status(400).json({ error: 'orgId e newPassword são obrigatórios' });
  if (newPassword.length < 6)  return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });

  let userId: string | null = null;

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('user_id')
    .eq('org_id', orgId)
    .single();

  if (profile?.user_id) {
    userId = profile.user_id;
  } else if (email) {
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const found = (usersData?.users ?? []).find((u: { email?: string; id: string }) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) userId = found.id;
  }

  if (!userId) {
    return res.status(404).json({
      error: email
        ? `Nenhum usuário encontrado para este e-mail (${email})`
        : 'Nenhum usuário vinculado. Informe o e-mail do usuário.',
    });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
