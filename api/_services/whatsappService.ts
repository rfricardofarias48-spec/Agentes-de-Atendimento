/**
 * WhatsApp Service — camada de abstração entre o agente (agentService.ts)
 * e os dois canais possíveis: Evolution (não-oficial, usado hoje) e a API
 * oficial da Meta (metaWhatsappService.ts, usada conforme os clientes
 * forem migrando). O resto do app só chama sendWhatsAppText/Document —
 * quem decide qual canal usar é org.whatsapp_provider.
 */

import { sendText as evolutionSendText, sendDocument as evolutionSendDocument } from './evolutionService.js';
import { sendText as metaSendText, sendDocument as metaSendDocument } from './metaWhatsappService.js';

/** Campos mínimos que uma org precisa ter pra decidir e executar o envio. */
export interface WhatsAppOrg {
  whatsapp_provider?: string | null; // 'evolution' (default) | 'official'
  evolution_instance?: string | null;
  evolution_token?: string | null;
  whatsapp_phone_number_id?: string | null;
}

export async function sendWhatsAppText(org: WhatsAppOrg, phone: string, text: string): Promise<boolean> {
  if (org.whatsapp_provider === 'official') {
    if (!org.whatsapp_phone_number_id) {
      console.warn('[WhatsApp] Org com provider=official mas sem whatsapp_phone_number_id — não é possível enviar');
      return false;
    }
    return metaSendText(org.whatsapp_phone_number_id, phone, text);
  }

  if (!org.evolution_instance) {
    console.warn('[WhatsApp] Org com provider=evolution mas sem evolution_instance — não é possível enviar');
    return false;
  }
  return evolutionSendText(org.evolution_instance, phone, text, org.evolution_token);
}

export async function sendWhatsAppDocument(
  org: WhatsAppOrg,
  phone: string,
  documentUrl: string,
  fileName: string,
  caption: string,
): Promise<boolean> {
  if (org.whatsapp_provider === 'official') {
    if (!org.whatsapp_phone_number_id) {
      console.warn('[WhatsApp] Org com provider=official mas sem whatsapp_phone_number_id — não é possível enviar documento');
      return false;
    }
    return metaSendDocument(org.whatsapp_phone_number_id, phone, documentUrl, fileName, caption);
  }

  if (!org.evolution_instance) {
    console.warn('[WhatsApp] Org com provider=evolution mas sem evolution_instance — não é possível enviar documento');
    return false;
  }
  return evolutionSendDocument(org.evolution_instance, phone, documentUrl, fileName, caption, org.evolution_token);
}
