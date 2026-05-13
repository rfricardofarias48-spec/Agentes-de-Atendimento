/**
 * Cron: Lembretes de agendamento (disparo diário às 07:30 BRT)
 * Envia lembrete de 24h para TODOS os agendamentos de amanhã (BRT).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendText } from '../services/evolutionService.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

const TZ = 'America/Sao_Paulo';
function toBRT(d: Date): Date { return new Date(d.toLocaleString('en-US', { timeZone: TZ })); }
function brtDateStr(d: Date): string { return d.toLocaleDateString('en-CA', { timeZone: TZ }); }

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
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

async function sendReminders(appointments: ApptRow[]): Promise<void> {
  if (!appointments.length) return;

  const orgIds = [...new Set(appointments.map(a => a.org_id))];

  const [orgsRes, settingsRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, evolution_instance, evolution_token, name')
      .in('id', orgIds),
    supabase
      .from('agent_settings')
      .select('org_id, reminder_24h')
      .in('org_id', orgIds),
  ]);

  const orgMap = new Map<string, OrgRow>();
  (orgsRes.data || []).forEach((o: OrgRow & { id: string }) => orgMap.set(o.id, o));

  const settingsMap = new Map<string, SettingsRow>();
  (settingsRes.data || []).forEach((s: SettingsRow & { org_id: string }) => settingsMap.set(s.org_id, s));

  await Promise.all(appointments.map(async (appt) => {
    const org      = orgMap.get(appt.org_id);
    const settings = settingsMap.get(appt.org_id);

    if (!org || !settings) return;
    if (!settings.reminder_24h) return;

    const date = fmtDate(appt.scheduled_at);
    const time = fmtTime(appt.scheduled_at);
    const service      = appt.specialty || 'atendimento';
    const professional = appt.doctor_name ? ` com ${appt.doctor_name}` : '';
    const name         = appt.patient_name?.split(' ')[0] || 'Olá';

    const msg = `Olá, ${name}! 👋 Lembrando que você tem *${service}*${professional} amanhã, ${date} às *${time}*.\n\nSe precisar remarcar ou cancelar, é só me chamar aqui. Até amanhã! 😊`;

    try {
      await sendText(org.evolution_instance, appt.patient_phone, msg, org.evolution_token);
      await supabase
        .from('appointments')
        .update({ reminder_24h_sent_at: new Date().toISOString() })
        .eq('id', appt.id);
    } catch (err) {
      console.error(`[Reminders] Falha ao enviar lembrete para ${appt.patient_phone}:`, err);
    }
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization || '';
  const secret     = process.env.CRON_SECRET || '';
  if (secret && authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now     = new Date();
  const nowBRT  = toBRT(now);

  // Amanhã em BRT (data completa — do início ao fim do dia)
  const tomorrowBRT = new Date(nowBRT);
  tomorrowBRT.setDate(nowBRT.getDate() + 1);
  const tomorrowStr = `${tomorrowBRT.getFullYear()}-${String(tomorrowBRT.getMonth()+1).padStart(2,'0')}-${String(tomorrowBRT.getDate()).padStart(2,'0')}`;

  const w24s = new Date(`${tomorrowStr}T00:00:00-03:00`).toISOString();
  const w24e = new Date(`${tomorrowStr}T23:59:59-03:00`).toISOString();

  const { data: appts24 } = await supabase
    .from('appointments')
    .select('id, org_id, patient_name, patient_phone, specialty, doctor_name, scheduled_at')
    .in('status', ['scheduled', 'confirmed'])
    .gte('scheduled_at', w24s)
    .lte('scheduled_at', w24e)
    .is('reminder_24h_sent_at', null);

  await sendReminders((appts24 || []) as ApptRow[]);

  return res.json({
    ok:        true,
    tomorrow:  tomorrowStr,
    sent_24h:  (appts24 || []).length,
    ts:        brtDateStr(now),
  });
}
