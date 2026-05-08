/**
 * POST /api/admin/create-user
 * Cria um usuário no Supabase Auth e vincula ao org via user_profiles.
 * Requer service role key (server-side only).
 *
 * Body: { orgId: string, email: string, password: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

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

  // Verificar se org existe
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .single();

  if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

  // Criar usuário no Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return res.status(400).json({ error: authError.message });
  }

  // Vincular ao org via user_profiles
  const { error: profileError } = await supabase.from('user_profiles').insert({
    user_id: authData.user.id,
    org_id: orgId,
    role: 'client',
  });

  if (profileError) {
    // Reverter: deletar o usuário criado
    await supabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: 'Erro ao vincular usuário: ' + profileError.message });
  }

  return res.status(200).json({ ok: true, userId: authData.user.id });
}
