/**
 * POST /api/admin/create-user
 * Cria um usuário no Supabase Auth e vincula ao org via user_profiles.
 *
 * Body: { orgId: string, email: string, password: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orgId, email, password } = req.body as {
    orgId?: string; email?: string; password?: string;
  };

  if (!orgId || !email || !password) {
    return res.status(400).json({ error: 'orgId, email e password são obrigatórios' });
  }

  // Criar usuário no Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return res.status(400).json({ error: authError.message });
  }

  // Vincular ao org via user_profiles
  const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
    user_id: authData.user.id,
    org_id: orgId,
    role: 'client',
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: 'Erro ao vincular usuário: ' + profileError.message });
  }

  return res.status(200).json({ ok: true, userId: authData.user.id });
}
