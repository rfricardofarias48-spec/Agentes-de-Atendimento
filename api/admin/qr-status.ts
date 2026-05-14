/**
 * GET /api/admin/qr-status?orgId=xxx
 * Retorna estado de conexão da instância Evolution + QR code atualizado.
 * Usado pelo frontend para polling até connectionState = "open".
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { getConnectionStatus, getQRCode } from '../services/evolutionService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const orgId = req.query.orgId as string | undefined;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('evolution_instance, evolution_token')
    .eq('id', orgId)
    .single();

  if (!org?.evolution_instance) {
    return res.status(404).json({ error: 'Instância não configurada' });
  }

  const state  = await getConnectionStatus(org.evolution_instance, org.evolution_token);
  const connected = state === 'open';

  // Só busca novo QR se ainda não conectou
  const qrCode = connected ? null : await getQRCode(org.evolution_instance, org.evolution_token);

  return res.status(200).json({ state, connected, qrCode });
}
