/**
 * Cron: Lembretes de agendamento (24h e 2h antes)
 * Roda a cada hora via Vercel Cron (ou serviço externo).
 * Janela de verificação: ±15 min em torno do alvo, para cobrir imprecisões de agendamento do cron.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendText } from '../services/evolutionService.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

interface ApptRow {
  id: string;
  org_id: string;
  patient_name: string;
  patient_phone: string;
  specialty: string;
  doctor_name: string | null;
  scheduled_at: string;
}

interface OrgRow {
  evolution_instance: string;
  evolution_token: string | null;
  name: string;
}

interface SettingsRow {
  reminder_24h: boolean;
  reminder_2h: boolean;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function sendReminders(
  appointments: ApptRow[],
  type: '24h' | '2h',
): Promise<void> {
  if (!appointments.length) return;

  // Agrupa por org para buscar config em batch
  const orgIds = [...new Set(appointments.map(a => a.org_id))];

  const [orgsRes, settingsRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, evolution_instance, evolution_token, name')
      .in('id', orgIds),
    supabase
      .from('agent_settings')
      .select('org_id, reminder_24h, reminder_2h')
      .in('org_id', orgIds),
  ]);

  const orgMap = new Map<string, OrgRow>();
  (orgsRes.data || []).forEach((o: OrgRow & { id: string }) => orgMap.set(o.id, o));

  const settingsMap = new Map<string, SettingsRow>();
  (settingsRes.data || []).forEach((s: SettingsRow & { org_id: string }) => settingsMap.set(s.org_id, s));

  const sentField = type === '24h' ? 'reminder_24h_sent_at' : 'reminder_2h_sent_at';
  const settingsFlag = type === '24h' ? 'reminder_24h' : 'reminder_2h';

  await Promise.all(appointments.map(async (appt) => {
    const org      = orgMap.get(appt.org_id);
    const settings = settingsMap.get(appt.org_id);

    if (!org || !settings) return;
    if (!settings[settingsFlag]) return; // Lembrete desativado pela org

    const date = fmtDate(appt.scheduled_at);
    const time = fmtTime(appt.scheduled_at);
    const service = appt.specialty || 'atendimento';
    const professional = appt.doctor_name ? ` com ${appt.doctor_name}` : '';
    const name = appt.patient_name?.split(' ')[0] || 'Olá';

    let msg: string;
    if (type === '24h') {
      msg = `Olá, ${name}! 👋 Lembrando que você tem *${service}*${professional} amanhã, ${date} às *${time}*.\n\nSe precisar remarcar ou cancelar, é só me chamar aqui. Até amanhã! 😊`;
    } else {
      msg = `Olá, ${name}! Sua *${service}*${professional} começa em *2 horas*, às *${time}*. Nos vemos em breve! 😊`;
    }

    try {
      await sendText(org.evolution_instance, appt.patient_phone, msg, org.evolution_token);
      await supabase
        .from('appointments')
        .update({ [sentField]: new Date().toISOString() })
        .eq('id', appt.id);
    } catch (err) {
      console.error(`[Reminders] Falha ao enviar lembrete ${type} para ${appt.patient_phone}:`, err);
    }
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Segurança: só aceita chamada com o segredo correto
  const authHeader = req.headers.authorization || '';
  const secret = process.env.CRON_SECRET || '';
  if (secret && authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();

  // Janela 24h: agendamentos entre agora+23h45 e agora+24h15
  const w24s = new Date(now.getTime() + (23 * 60 + 45) * 60_000).toISOString();
  const w24e = new Date(now.getTime() + (24 * 60 + 15) * 60_000).toISOString();

  // Janela 2h: agendamentos entre agora+1h45 e agora+2h15
  const w2s = new Date(now.getTime() + (1 * 60 + 45) * 60_000).toISOString();
  const w2e = new Date(now.getTime() + (2 * 60 + 15) * 60_000).toISOString();

  const [res24, res2] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, org_id, patient_name, patient_phone, specialty, doctor_name, scheduled_at')
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', w24s)
      .lte('scheduled_at', w24e)
      .is('reminder_24h_sent_at', null),

    supabase
      .from('appointments')
      .select('id, org_id, patient_name, patient_phone, specialty, doctor_name, scheduled_at')
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', w2s)
      .lte('scheduled_at', w2e)
      .is('reminder_2h_sent_at', null),
  ]);

  await Promise.all([
    sendReminders((res24.data || []) as ApptRow[], '24h'),
    sendReminders((res2.data  || []) as ApptRow[], '2h'),
  ]);

  return res.json({
    ok: true,
    sent_24h: (res24.data || []).length,
    sent_2h:  (res2.data  || []).length,
    ts: now.toISOString(),
  });
}
