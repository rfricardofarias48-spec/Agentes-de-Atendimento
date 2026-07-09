/**
 * Webhook Evolution — AgenteClin
 * POST /api/webhook/evolution
 *
 * Recebe eventos da Evolution API v2, identifica a organização
 * pelo instanceName e processa via agente GPT.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cleanPhone } from '../_services/evolutionService.js';
import { getOrgByInstance, processMessage, processProMessage } from '../_services/agentService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Responde 200 imediatamente para o Evolution não re-tentar
  res.status(200).json({ received: true });

  try {
    const payload = req.body as Record<string, unknown>;

    const eventName = String(payload.event || '').toLowerCase().replace(/_/g, '.');
    const instanceName = String(payload.instanceName || payload.instance || '');
    const data = payload.data as Record<string, unknown> | undefined;

    console.log(`[Webhook/Evolution] event="${eventName}" instance="${instanceName}"`);

    // Só processa eventos de mensagem
    const isMessage = eventName === 'message' || eventName.includes('messages.upsert');
    if (!isMessage || !data || !instanceName) return;

    // ── Normaliza payload ──
    const key = data.key as Record<string, unknown> | undefined;
    const remoteJid = String(key?.remoteJid || data.remoteJid || '');
    const fromMe = key?.fromMe === true || data.fromMe === true;
    const pushName = String(data.pushName || '');
    const messageType = String(data.messageType || '');
    const message = (data.message as Record<string, unknown>) || {};

    // Ignora: próprias mensagens, grupos, status
    if (!remoteJid || fromMe || remoteJid.endsWith('@g.us') || remoteJid.includes('status')) return;

    // Extrai texto
    let text = '';
    if (messageType === 'conversation') {
      text = String(message.conversation || '');
    } else if (messageType === 'extendedTextMessage') {
      const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
      text = String(ext?.text || '');
    } else if (messageType === 'listResponseMessage') {
      const lr = message.listResponseMessage as Record<string, unknown> | undefined;
      text = String(lr?.title || '');
    }

    if (!text.trim()) {
      console.log(`[Webhook/Evolution] Skipped: no text, type="${messageType}"`);
      return;
    }

    const phone = cleanPhone(remoteJid);

    // Busca organização pelo nome da instância
    const ctx = await getOrgByInstance(instanceName);
    if (!ctx) {
      console.warn(`[Webhook/Evolution] No active org found for instance="${instanceName}"`);
      return;
    }

    console.log(`[Webhook/Evolution] Processing org="${ctx.org.name}" phone="${phone}"`);

    // Se quem mandou é o profissional (notification_phone), entra em modo profissional
    const notifPhone = ctx.settings.notification_phone?.replace(/\D/g, '') || '';
    if (notifPhone && phone === notifPhone) {
      await processProMessage(ctx.org, ctx.settings, phone, text.trim());
      return;
    }

    await processMessage(ctx.org, ctx.settings, phone, text.trim(), pushName, ctx.professionals);
  } catch (err) {
    console.error('[Webhook/Evolution] Error:', err);
  }
}
