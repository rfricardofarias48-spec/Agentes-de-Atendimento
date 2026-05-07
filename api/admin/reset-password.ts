/**
 * POST /api/admin/reset-password
 * Redefine a senha de um usuário vinculado a uma organização.
 * Body: { orgId: string; newPassword: string; email?: string }
 * Lookup order: user_profiles.org_id → auth.users by email (fallback)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId, newPassword, email } = req.body as { orgId?: string; newPassword?: string; email?: string };

  if (!orgId || !newPassword) return res.status(400).json({ error: 'orgId e newPassword são obrigatórios' });
  if (newPassword.length < 6)  return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });

  let userId: string | null = null;

  // Tentativa 1: buscar via user_profiles vinculado à org
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('org_id', orgId)
    .single();

  if (profile?.user_id) {
    userId = profile.user_id;
  } else if (email) {
    // Tentativa 2: buscar por e-mail diretamente em auth.users
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const found = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (found) userId = found.id;
  }

  if (!userId) {
    return res.status(404).json({
      error: email
        ? `Nenhum usuário encontrado para este e-mail (${email})`
        : 'Nenhum usuário vinculado a esta organização. Informe o e-mail do usuário.',
    });
  }

  // Atualiza a senha via service role
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
