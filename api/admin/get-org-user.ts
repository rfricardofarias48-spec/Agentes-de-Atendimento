/**
 * GET /api/admin/get-org-user?orgId=xxx
 * Retorna o email do usuário vinculado à organização.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
