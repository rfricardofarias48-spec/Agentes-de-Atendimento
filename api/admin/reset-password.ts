/**
 * POST /api/admin/reset-password
 * Redefine a senha de um usuário vinculado a uma organização.
 * Body: { orgId: string; newPassword: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId, newPassword } = req.body as { orgId?: string; newPassword?: string };

  if (!orgId || !newPassword) return res.status(400).json({ error: 'orgId e newPassword são obrigatórios' });
  if (newPassword.length < 6)  return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });

  // Busca o user_id vinculado à org
  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('org_id', orgId)
    .single();

  if (profileErr || !profile?.user_id) {
    return res.status(404).json({ error: 'Nenhum usuário vinculado a esta organização' });
  }

  // Atualiza a senha via service role
  const { error } = await supabase.auth.admin.updateUserById(profile.user_id, {
    password: newPassword,
  });

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
