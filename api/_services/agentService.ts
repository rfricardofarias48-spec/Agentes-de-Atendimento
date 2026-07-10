/**
 * Agent Service — AgenteClin
 * GPT-5.4-nano com tool use para atendimento de clínicas.
 * Ferramentas: agendar consulta, consultar agendamentos, escalar para humano.
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { searchMemory, addMemory, getMemories } from './mem0Service.js';
import { sendWhatsAppText, sendWhatsAppDocument } from './whatsappService.js';
import { mirrorMessage } from './chatwootService.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

const MODEL = 'gpt-5.4-nano';

// ─── Histórico de conversa (curto prazo, literal) ──────────────
// Complementar ao mem0 (memória semântica de longo prazo): aqui é o
// texto literal das últimas trocas, usado só pra manter o fio da
// conversa atual (ex.: agente pergunta "segunda, quarta ou sexta?" e
// o paciente responde só "quarta" — sem isso o modelo perde o contexto).
const HISTORY_MAX_MESSAGES = 20;       // total de mensagens guardadas na coluna
const HISTORY_LLM_MESSAGES = 12;       // quantas entram no contexto do modelo (as mais recentes)
const HISTORY_MAX_CONTENT_CHARS = 1000; // trunca mensagens individuais gigantes antes de salvar
const HISTORY_MAX_AGE_HOURS = 24;      // mensagens mais antigas que isso não entram no contexto do modelo

const TZ = 'America/Sao_Paulo';
/** Returns a Date whose .getHours()/.getDay()/.getDate() reflect BRT time */
function toBRT(d: Date): Date { return new Date(d.toLocaleString('en-US', { timeZone: TZ })); }
/** Returns YYYY-MM-DD string in BRT timezone */
function brtDateStr(d: Date): string { return d.toLocaleDateString('en-CA', { timeZone: TZ }); }

// ─── Tipos ────────────────────────────────────────────────────

interface Organization {
  id: string;
  name: string;
  evolution_instance: string | null;
  evolution_token: string | null;
  chatwoot_account_id: number | null;
  chatwoot_token: string | null;
  chatwoot_inbox_id: number | null;
  chatwoot_url: string | null;
  agent_tone: 'formal' | 'friendly';
  whatsapp_provider: string | null;
  whatsapp_phone_number_id: string | null;
}

interface Service {
  id: string;
  name: string;
  description: string;
  price: string;
  pdf_url: string | null;
  pdf_name: string | null;
  duration_minutes?: number | null;
}

interface WorkingDay {
  active: boolean;
  start: string; // "09:00"
  end: string;   // "18:00"
}

interface AgentSettings {
  agent_name: string;
  greeting_message: string;
  tone: string;
  specialties: string[];
  working_hours: Record<string, WorkingDay> | null;
  custom_instructions: string | null;
  services: Service[] | null;
  appointment_duration: number;
  notification_phone: string | null;
  auto_send_pdf: boolean;
}

interface Professional {
  id: string;
  name: string;
  active: boolean;
  working_hours: Record<string, WorkingDay> | null;
}

/** Resolve a duração certa: serviço casado por nome > duração global da clínica. */
function resolveDuration(settings: AgentSettings, specialty?: string): number {
  if (specialty) {
    const svc = settings.services?.find(s => s.name.toLowerCase() === specialty.toLowerCase());
    if (svc?.duration_minutes) return svc.duration_minutes;
  }
  return settings.appointment_duration || 60;
}

/**
 * Resolve o profissional pelo nome (case-insensitive, aceita correspondência parcial).
 * Se não vier nome e só existe 1 profissional ativo, resolve sozinho (rede de segurança
 * pra clínicas com agenda única não precisarem lidar com esse conceito).
 */
function resolveProfessional(professionals: Professional[], name?: string): Professional | undefined {
  const active = professionals.filter(p => p.active);
  if (name) {
    const norm = name.trim().toLowerCase();
    return (
      active.find(p => p.name.toLowerCase() === norm) ||
      active.find(p => p.name.toLowerCase().includes(norm) || norm.includes(p.name.toLowerCase()))
    );
  }
  return active.length === 1 ? active[0] : undefined;
}

interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
  ts: string; // ISO
}

interface Conversation {
  id: string;
  patient_phone: string;
  patient_name: string | null;
  escalated_to_human: boolean;
  chatwoot_conversation_id: string | null;
  message_count: number;
  history: HistoryItem[];
}

/** Trunca conteúdo gigante antes de salvar no histórico, com sufixo "…". */
function truncateContent(content: string): string {
  if (content.length <= HISTORY_MAX_CONTENT_CHARS) return content;
  return content.slice(0, HISTORY_MAX_CONTENT_CHARS) + '…';
}

/**
 * Converte o histórico salvo no banco para o formato aceito pelo array
 * `messages` da OpenAI: filtra por idade (HISTORY_MAX_AGE_HOURS), pega
 * as últimas HISTORY_LLM_MESSAGES e mapeia para { role, content }.
 * Tolera histórico malformado — nunca lança exceção, retorna [] em caso
 * de dado inválido.
 */
function buildHistoryMessages(history: unknown): OpenAI.Chat.ChatCompletionMessageParam[] {
  try {
    if (!Array.isArray(history)) return [];

    const cutoff = Date.now() - HISTORY_MAX_AGE_HOURS * 60 * 60 * 1000;

    const valid = history.filter((item): item is HistoryItem => {
      if (!item || typeof item !== 'object') return false;
      const it = item as Record<string, unknown>;
      if (it.role !== 'user' && it.role !== 'assistant') return false;
      if (typeof it.content !== 'string' || !it.content) return false;
      if (typeof it.ts !== 'string') return false;
      const ts = new Date(it.ts).getTime();
      if (Number.isNaN(ts)) return false;
      return ts >= cutoff;
    });

    return valid
      .slice(-HISTORY_LLM_MESSAGES)
      .map(item => ({ role: item.role, content: item.content }));
  } catch {
    return [];
  }
}

/**
 * Persiste novos itens no histórico da conversa. Usa a função RPC
 * append_conversation_history (append atômico no banco, evita que duas
 * mensagens simultâneas do mesmo paciente se sobrescrevam). Se a RPC
 * falhar, cai para um update simples calculado em memória. Nunca lança
 * exceção — salvar o histórico não pode quebrar o fluxo de resposta.
 */
async function saveHistory(
  conversationId: string,
  currentHistory: HistoryItem[],
  newItems: HistoryItem[],
): Promise<void> {
  try {
    const { error } = await supabase.rpc('append_conversation_history', {
      conversation_id: conversationId,
      new_items: newItems,
      max_items: HISTORY_MAX_MESSAGES,
    });

    if (error) {
      console.warn('[Bento] RPC append_conversation_history falhou, usando fallback:', error.message);
      const merged = [...(currentHistory || []), ...newItems].slice(-HISTORY_MAX_MESSAGES);
      await supabase.from('conversations').update({ history: merged }).eq('id', conversationId);
    }
  } catch (err) {
    console.error('[Bento] Falha ao salvar histórico da conversa:', err);
  }
}

// ─── Definição das tools ──────────────────────────────────────

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'schedule_appointment',
      description: 'Agenda uma consulta para o paciente. Use quando o paciente quiser marcar uma consulta.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'Nome completo do paciente' },
          specialty: { type: 'string', description: 'Especialidade médica desejada' },
          preferred_date: { type: 'string', description: 'Data preferida no formato YYYY-MM-DD' },
          preferred_time: { type: 'string', description: 'Horário preferido no formato HH:MM' },
          notes: { type: 'string', description: 'Observações adicionais' },
          professional_name: { type: 'string', description: 'Nome do profissional escolhido. Obrigatório se houver mais de um profissional cadastrado.' },
        },
        required: ['patient_name', 'specialty'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_appointments',
      description: 'Consulta as consultas ativas (agendadas/confirmadas) deste telefone, incluindo o appointment_id de cada uma. Use SEMPRE que o cliente perguntar sobre sua consulta, e OBRIGATORIAMENTE antes de chamar cancel_appointment ou reschedule_appointment — é a única forma de obter o appointment_id real, nunca invente um.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancela e REMOVE uma consulta da agenda, liberando o horário imediatamente. Chame get_appointments antes para obter o appointment_id real — nunca invente um.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'ID exato retornado por get_appointments' },
          reason: { type: 'string', description: 'Motivo do cancelamento' },
        },
        required: ['appointment_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_appointment',
      description: 'Reagenda uma consulta: remove o agendamento atual da agenda e cria um novo horário. Chame get_appointments antes para obter o appointment_id real (nunca invente um), e get_available_slots para confirmar que o novo horário está livre.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'ID do agendamento atual a ser cancelado' },
          patient_name:   { type: 'string', description: 'Nome do paciente/cliente' },
          specialty:      { type: 'string', description: 'Serviço ou especialidade' },
          new_date:       { type: 'string', description: 'Nova data no formato YYYY-MM-DD' },
          new_time:       { type: 'string', description: 'Novo horário no formato HH:MM' },
          notes:          { type: 'string', description: 'Observações' },
          professional_name: { type: 'string', description: 'Nome do profissional escolhido. Obrigatório se houver mais de um profissional cadastrado.' },
        },
        required: ['appointment_id', 'patient_name', 'specialty', 'new_date', 'new_time'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_patient_info',
      description: 'Recupera tudo que o sistema sabe sobre este paciente/cliente com base em conversas anteriores. Use quando o paciente mencionar reagendamento, cancelamento ou qualquer referência a algo anterior sem dar detalhes — assim você não precisa pedir que ele repita informações.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_available_slots',
      description: 'Consulta os horários disponíveis na agenda. Use SEMPRE antes de confirmar um agendamento ou reagendamento. Retorna dias e horários livres considerando a duração do atendimento, bloqueios e consultas já agendadas.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Data específica no formato YYYY-MM-DD. Se informado, retorna slots apenas deste dia.',
          },
          week_offset: {
            type: 'number',
            description: 'Semanas a partir de hoje: 0 = esta semana, 1 = próxima semana. Padrão: 0. Usado quando o paciente quer saber dias disponíveis na semana.',
          },
          specialty: {
            type: 'string',
            description: 'Serviço desejado, se já souber. Usado para calcular a duração correta do horário.',
          },
          professional_name: {
            type: 'string',
            description: 'Nome do profissional, se houver mais de um cadastrado e o cliente já tiver escolhido.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description: 'Use quando: (1) o cliente pedir explicitamente um atendente humano, (2) a situação envolver emergência, reclamação grave ou negociação especial, OU (3) o cliente fizer uma pergunta (ex: convênio, procedimento, condição específica) que não está nos serviços cadastrados nem nas instruções personalizadas — nesse caso, você não deve inventar nem redirecionar para "o estabelecimento", pois VOCÊ é o contato; informe que não tem essa informação e escale para que um humano responda. NUNCA escale por dúvidas que estejam nos serviços ou instruções disponíveis.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Motivo da escalada' },
        },
        required: ['reason'],
      },
    },
  },
];

// ─── Execução das tools ───────────────────────────────────────

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  orgId: string,
  phone: string,
  conversation: Conversation,
  org: Organization,
  settings: AgentSettings,
  professionals: Professional[],
): Promise<string> {
  switch (toolName) {
    case 'get_patient_info': {
      const memUserId = `${orgId}:${phone}`;
      const all = await getMemories(memUserId);
      if (!all.length) return 'Nenhuma informação registrada sobre este contato ainda.';
      return `Histórico do contato (${phone}):\n${all.map(m => `• ${m}`).join('\n')}`;
    }

    case 'get_available_slots': {
      const duration = resolveDuration(settings, args.specialty as string | undefined);
      const weekOffset = typeof args.week_offset === 'number' ? args.week_offset : 0;

      // Se há mais de 1 profissional e nenhum foi especificado (nem dá pra resolver sozinho),
      // pede pro agente perguntar antes de calcular qualquer disponibilidade.
      const activeProfessionals = professionals.filter(p => p.active);
      const professional = resolveProfessional(professionals, args.professional_name as string | undefined);
      if (activeProfessionals.length > 1 && !professional) {
        return `Há mais de um profissional disponível: ${activeProfessionals.map(p => p.name).join(', ')}. Pergunte ao cliente com qual profissional ele prefere ser atendido e chame get_available_slots novamente informando professional_name.`;
      }

      // ── Trabalha com datas em BRT ──────────────────────────────
      // brtFromStr / brtToStr são strings YYYY-MM-DD no fuso de Brasília
      let brtFromStr: string;
      let brtToStr: string;

      if (args.date) {
        brtFromStr = String(args.date);
        brtToStr   = String(args.date);
      } else {
        const nowBRT = toBRT(new Date());
        const dow = nowBRT.getDay(); // dia da semana em BRT
        const startBRT = new Date(nowBRT);
        startBRT.setDate(nowBRT.getDate() - dow + weekOffset * 7);
        startBRT.setHours(12, 0, 0, 0);
        const endBRT = new Date(startBRT);
        endBRT.setDate(startBRT.getDate() + 6);
        brtFromStr = `${startBRT.getFullYear()}-${String(startBRT.getMonth()+1).padStart(2,'0')}-${String(startBRT.getDate()).padStart(2,'0')}`;
        brtToStr   = `${endBRT.getFullYear()}-${String(endBRT.getMonth()+1).padStart(2,'0')}-${String(endBRT.getDate()).padStart(2,'0')}`;
      }

      // Converte para UTC para queries de timestamp no Supabase
      const fromStr = new Date(`${brtFromStr}T00:00:00-03:00`).toISOString();
      const toStr   = new Date(`${brtToStr}T23:59:59-03:00`).toISOString();

      // Busca agendamentos existentes no período (filtra por profissional, se aplicável)
      let apptsQuery = supabase
        .from('appointments')
        .select('scheduled_at, duration_minutes')
        .eq('org_id', orgId)
        .in('status', ['scheduled', 'confirmed'])
        .gte('scheduled_at', fromStr)
        .lte('scheduled_at', toStr);
      if (professional) apptsQuery = apptsQuery.eq('professional_id', professional.id);
      const { data: existingAppts } = await apptsQuery;

      // Busca bloqueios (coluna `date` armazena data em BRT)
      const { data: blockedSlots } = await supabase
        .from('blocked_slots')
        .select('date, all_day, start_time, end_time')
        .eq('org_id', orgId)
        .gte('date', brtFromStr)
        .lte('date', brtToStr);

      const DEFAULT_HOURS: Record<number, WorkingDay> = {
        1: { active: true,  start: '09:00', end: '18:00' },
        2: { active: true,  start: '09:00', end: '18:00' },
        3: { active: true,  start: '09:00', end: '18:00' },
        4: { active: true,  start: '09:00', end: '18:00' },
        5: { active: true,  start: '09:00', end: '18:00' },
        6: { active: false, start: '09:00', end: '12:00' },
        0: { active: false, start: '09:00', end: '12:00' },
      };

      function getWorkDay(dow: number): WorkingDay {
        const wh = professional?.working_hours ?? settings.working_hours;
        if (wh) {
          return (wh[String(dow)] as WorkingDay) || { active: false, start: '09:00', end: '18:00' };
        }
        return DEFAULT_HOURS[dow] || { active: false, start: '09:00', end: '18:00' };
      }

      function toMinutes(hhmm: string): number {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
      }

      function fmtMinutes(mins: number): string {
        return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      }

      const resultLines: string[] = [];

      // Cursor em UTC, ancorando ao meio-dia BRT para evitar cruzamento de dia
      let cursor = new Date(`${brtFromStr}T12:00:00-03:00`);
      const endCursor = new Date(`${brtToStr}T12:00:00-03:00`);

      while (cursor <= endCursor) {
        const dateKey = brtDateStr(cursor);           // YYYY-MM-DD em BRT
        const dow     = toBRT(cursor).getDay();       // dia da semana em BRT
        const wd      = getWorkDay(dow);

        if (!wd.active) { cursor.setDate(cursor.getDate() + 1); continue; }

        const workStart = toMinutes(wd.start);
        const workEnd   = toMinutes(wd.end);

        // Slots ocupados — extrai horas em BRT
        const dayAppts = (existingAppts || []).filter(a => brtDateStr(new Date(a.scheduled_at)) === dateKey);
        const occupied = dayAppts.map(a => {
          const brt   = toBRT(new Date(a.scheduled_at));
          const start = brt.getHours() * 60 + brt.getMinutes();
          const dur   = a.duration_minutes || duration;
          return { start, end: start + dur };
        });

        // Bloqueios (coluna `date` é BRT)
        const dayBlocked = (blockedSlots || []).filter(b => b.date === dateKey);
        const blockedRanges = dayBlocked.map(b => {
          if (b.all_day) return { start: workStart, end: workEnd };
          return {
            start: b.start_time ? toMinutes(b.start_time.slice(0, 5)) : workStart,
            end:   b.end_time   ? toMinutes(b.end_time.slice(0, 5))   : workEnd,
          };
        });

        if (blockedRanges.some(b => b.start <= workStart && b.end >= workEnd)) {
          cursor.setDate(cursor.getDate() + 1); continue;
        }

        const freeSlots: string[] = [];
        for (let t = workStart; t + duration <= workEnd; t += duration) {
          const slotEnd = t + duration;
          const blocked =
            occupied.some(o => t < o.end && slotEnd > o.start) ||
            blockedRanges.some(b => t < b.end && slotEnd > b.start);
          if (!blocked) freeSlots.push(fmtMinutes(t));
        }

        if (freeSlots.length > 0) {
          const label = cursor.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit' });
          resultLines.push(`${label}: ${freeSlots.join(', ')}`);
        }

        cursor.setDate(cursor.getDate() + 1);
      }

      const profLabel = professional ? ` com ${professional.name}` : '';

      if (resultLines.length === 0) {
        const labelFrom = new Date(`${brtFromStr}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: TZ });
        const labelTo   = new Date(`${brtToStr}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: TZ });
        return `Nenhum horário disponível${profLabel} no período solicitado (${labelFrom} a ${labelTo}). Cada atendimento tem duração de ${duration} minutos.`;
      }

      return `Horários disponíveis${profLabel} (atendimento de ${duration} min cada):\n${resultLines.join('\n')}`;
    }

    case 'schedule_appointment': {
      const professional = resolveProfessional(professionals, args.professional_name as string | undefined);
      if (professionals.filter(p => p.active).length > 1 && !professional) {
        return `Há mais de um profissional disponível: ${professionals.filter(p => p.active).map(p => p.name).join(', ')}. Confirme com qual profissional o cliente quer agendar antes de chamar schedule_appointment novamente informando professional_name.`;
      }

      const { data, error } = await supabase
        .from('appointments')
        .insert({
          org_id: orgId,
          patient_name: args.patient_name,
          patient_phone: phone,
          specialty: args.specialty,
          doctor_name: professional?.name ?? null,
          professional_id: professional?.id ?? null,
          scheduled_at: args.preferred_date && args.preferred_time
            ? `${args.preferred_date}T${args.preferred_time}:00`
            : null,
          duration_minutes: resolveDuration(settings, args.specialty as string | undefined),
          notes: args.notes || null,
          status: 'scheduled',
        })
        .select('id')
        .single();

      if (error) return 'Não foi possível registrar o agendamento. Tente novamente.';

      // Envia PDF do serviço correspondente (fire-and-forget), se a org não desativou o envio automático
      const specialty = String(args.specialty || '');
      const svcEntry = settings.services?.find(
        s => s.name.toLowerCase() === specialty.toLowerCase(),
      );
      const shouldSendPdf = !!svcEntry?.pdf_url && settings.auto_send_pdf !== false;
      if (shouldSendPdf) {
        sendWhatsAppDocument(
          org,
          phone,
          svcEntry!.pdf_url!,
          svcEntry!.pdf_name || 'orientacoes.pdf',
          `📋 Orientações — ${svcEntry!.name}`,
        ).catch(err => console.error('[Bento] Falha ao enviar PDF do serviço:', err));
      }

      const dateStr = args.preferred_date
        ? new Date(`${args.preferred_date}T${args.preferred_time || '00:00'}:00-03:00`)
            .toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit' })
        : null;
      const timeStr = args.preferred_time || null;

      return JSON.stringify({
        success: true,
        appointment_id: data.id,
        patient_name: args.patient_name,
        specialty: args.specialty,
        professional: professional?.name ?? null,
        date: dateStr,
        time: timeStr,
        pdf_sent: shouldSendPdf,
        action: 'scheduled',
      });
    }

    case 'get_appointments': {
      const { data } = await supabase
        .from('appointments')
        .select('id, specialty, doctor_name, scheduled_at, status')
        .eq('org_id', orgId)
        .eq('patient_phone', phone)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_at', { ascending: true })
        .limit(5);

      if (!data?.length) return 'Nenhuma consulta agendada encontrada para este telefone.';
      const list = data.map(a => {
        const dt = a.scheduled_at ? new Date(a.scheduled_at).toLocaleString('pt-BR', { timeZone: TZ }) : 'a confirmar';
        return `• appointment_id="${a.id}" — ${a.specialty}${a.doctor_name ? ' com ' + a.doctor_name : ''} — ${dt} (${a.status})`;
      }).join('\n');
      return `Consultas encontradas (use o appointment_id exato ao cancelar ou reagendar — NUNCA invente ou peça esse ID ao cliente):\n${list}`;
    }

    case 'cancel_appointment': {
      const { data, error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', args.appointment_id)
        .eq('org_id', orgId)
        .select('id');

      if (error) return 'Não foi possível cancelar. Tente novamente em instantes.';
      if (!data?.length) return 'Não encontrei essa consulta pelo ID informado. Chame get_appointments de novo para confirmar o appointment_id correto antes de tentar cancelar.';
      return 'Consulta cancelada e removida da agenda com sucesso.';
    }

    case 'reschedule_appointment': {
      const professional = resolveProfessional(professionals, args.professional_name as string | undefined);
      if (professionals.filter(p => p.active).length > 1 && !professional) {
        return `Há mais de um profissional disponível: ${professionals.filter(p => p.active).map(p => p.name).join(', ')}. Confirme com qual profissional o cliente quer reagendar antes de chamar reschedule_appointment novamente informando professional_name.`;
      }

      // 1. Remove o agendamento atual da agenda
      const { data: deletedOld, error: cancelErr } = await supabase
        .from('appointments')
        .delete()
        .eq('id', args.appointment_id)
        .eq('org_id', orgId)
        .select('id');

      if (cancelErr) return 'Não foi possível localizar o agendamento atual. Tente novamente.';
      if (!deletedOld?.length) return 'Não encontrei essa consulta pelo ID informado. Chame get_appointments de novo para confirmar o appointment_id correto antes de reagendar.';

      // 2. Cria o novo agendamento
      const { data, error: insertErr } = await supabase
        .from('appointments')
        .insert({
          org_id: orgId,
          patient_name: args.patient_name,
          patient_phone: phone,
          specialty: args.specialty,
          doctor_name: professional?.name ?? null,
          professional_id: professional?.id ?? null,
          scheduled_at: `${args.new_date}T${args.new_time}:00`,
          duration_minutes: resolveDuration(settings, args.specialty as string | undefined),
          notes: args.notes || null,
          status: 'scheduled',
        })
        .select('id')
        .single();

      if (insertErr) return 'O horário anterior foi removido da agenda, mas não foi possível criar o novo agendamento. Chame escalate_to_human imediatamente para que a equipe resolva manualmente com o cliente — ele ficou sem consulta marcada.';

      // 3. Envia PDF se disponível e a org não desativou o envio automático
      const specialty = String(args.specialty || '');
      const svcEntry = settings.services?.find(s => s.name.toLowerCase() === specialty.toLowerCase());
      const shouldSendPdf = !!svcEntry?.pdf_url && settings.auto_send_pdf !== false;
      if (shouldSendPdf) {
        sendWhatsAppDocument(
          org,
          phone,
          svcEntry!.pdf_url!,
          svcEntry!.pdf_name || 'orientacoes.pdf',
          `📋 Orientações — ${svcEntry!.name}`,
        ).catch(err => console.error('[Bento] Falha ao enviar PDF do serviço:', err));
      }

      const dateStr = new Date(`${args.new_date}T${args.new_time}:00-03:00`)
        .toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit' });

      return JSON.stringify({
        success: true,
        appointment_id: data.id,
        patient_name: args.patient_name,
        specialty: args.specialty,
        professional: professional?.name ?? null,
        date: dateStr,
        time: args.new_time,
        pdf_sent: shouldSendPdf,
        action: 'rescheduled',
      });
    }

    case 'escalate_to_human': {
      await supabase
        .from('conversations')
        .update({ escalated_to_human: true })
        .eq('id', conversation.id);

      // Envia aviso WhatsApp para o profissional
      if (settings.notification_phone) {
        const patientLabel = conversation.patient_name || phone;
        const chatwootLink = org.chatwoot_url && conversation.chatwoot_conversation_id
          ? `\n🔗 Ver conversa: ${org.chatwoot_url}/app/accounts/${org.chatwoot_account_id}/conversations/${conversation.chatwoot_conversation_id}`
          : '';

        const alertMsg =
          `⚠️ *Atenção — Atendimento Humano Necessário*\n\n` +
          `👤 Cliente: *${patientLabel}*\n` +
          `📱 Número: ${phone}\n` +
          `💬 Motivo: ${args.reason || 'Solicitado pelo cliente'}` +
          chatwootLink +
          `\n\n_Responda aqui para consultar o histórico completo do cliente._`;

        sendWhatsAppText(org, settings.notification_phone, alertMsg)
          .catch(err => console.error('[Bento] Falha ao enviar alerta de escalonamento:', err));
      }

      return JSON.stringify({ escalated: true, reason: args.reason });
    }

    default:
      return 'Ferramenta desconhecida.';
  }
}

// ─── Processamento principal ──────────────────────────────────

export async function processMessage(
  org: Organization,
  settings: AgentSettings,
  phone: string,
  text: string,
  patientName: string,
  professionals: Professional[] = [],
): Promise<void> {
  // 1. Busca/cria conversa
  let { data: conv } = await supabase
    .from('conversations')
    .select('*')
    .eq('org_id', org.id)
    .eq('patient_phone', phone)
    .single();

  if (!conv) {
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({
        org_id: org.id,
        patient_phone: phone,
        patient_name: patientName || null,
      })
      .select('*')
      .single();
    conv = newConv;
  }

  if (!conv) return;

  // Detecta se é o primeiro contato desta pessoa (antes de incrementar o contador abaixo)
  const isFirstMessage = !conv.message_count;

  // Atualiza contagem e nome se chegou
  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      message_count: (conv.message_count || 0) + 1,
      ...(patientName && !conv.patient_name ? { patient_name: patientName } : {}),
    })
    .eq('id', conv.id);

  // Se escalado para humano, não processa — mas ainda registra a mensagem
  // do paciente no histórico, pra quando a conversa voltar pro bot ele
  // saber o que foi dito durante a escalação.
  if (conv.escalated_to_human) {
    await saveHistory(conv.id, conv.history, [
      { role: 'user', content: truncateContent(text), ts: new Date().toISOString() },
    ]);
    return;
  }

  // 2. Busca memórias relevantes do paciente
  const memUserId = `${org.id}:${phone}`;
  const memories = await searchMemory(memUserId, text, 5);

  // Histórico literal (curto prazo) das últimas trocas, para dar contexto
  // multi-turno ao modelo (complementar ao mem0, que é semântico)
  const historyMessages = buildHistoryMessages(conv.history);

  // 3. Monta system prompt
  const tone = settings.tone === 'formal' ? 'formal e profissional' : 'amigável e acolhedor';

  // Detecta o nicho automaticamente pelo nome dos serviços e instruções
  const allText = [
    ...(settings.services || []).map(s => s.name + ' ' + s.description),
    settings.custom_instructions || '',
  ].join(' ').toLowerCase();
  const isMedical = /consulta|médico|médica|clínica|dentista|dentist|psicólog|fisio|nutri|cardio|ortopedi|dermatol|ginecol|pediatr|saúde|exame|plano de saúde|convenio|convênio/.test(allText);
  const clientWord   = isMedical ? 'paciente'   : 'cliente';
  const serviceWord  = isMedical ? 'consulta'   : 'atendimento';
  const providerWord = isMedical ? 'profissional de saúde' : 'profissional responsável';

  const servicesBlock = settings.services?.length
    ? `SERVIÇOS DISPONÍVEIS:\n${settings.services.map(s =>
        `• ${s.name}${s.price ? ` — R$ ${s.price}` : ''}${s.description ? `\n  ${s.description}` : ''}`
      ).join('\n')}`
    : settings.specialties?.length
      ? `Serviços: ${settings.specialties.join(', ')}.`
      : '';

  const activeProfessionals = professionals.filter(p => p.active);
  const professionalsBlock = activeProfessionals.length > 1
    ? `\nPROFISSIONAIS DISPONÍVEIS:\n${activeProfessionals.map(p => `• ${p.name}`).join('\n')}\nHá mais de um profissional. Pergunte com qual profissional o ${clientWord} prefere ser atendido ANTES de checar disponibilidade, e informe o nome escolhido em professional_name ao chamar get_available_slots e schedule_appointment/reschedule_appointment.`
    : '';

  const memoriesStr = memories.length
    ? `\nO QUE VOCÊ JÁ SABE SOBRE ESTE ${clientWord.toUpperCase()}:\n${memories.map(m => `• ${m}`).join('\n')}`
    : '';

  // Se há histórico de conversa, não é primeiro contato de verdade — mesmo
  // que message_count esteja zerado por alguma inconsistência.
  const greetingBlock = (isFirstMessage && historyMessages.length === 0)
    ? `\nEsta é a PRIMEIRA mensagem desta pessoa nesta conversa. Comece se apresentando de forma calorosa e receptiva como ${settings.agent_name}, e pergunte como pode ajudar. Não presuma o motivo do contato.`
    : '';

  const customInstructions = settings.custom_instructions?.trim()
    ? `\nINSTRUÇÕES DO ESTABELECIMENTO:\n${settings.custom_instructions.trim()}`
    : '';

  const systemPrompt = `Você é ${settings.agent_name}, assistente virtual de atendimento. Seu tom é ${tone} e SEMPRE receptivo e acolhedor — quem escreve pode estar ansioso, com dor, ou só querendo tirar uma dúvida rápida. Trate cada pessoa com atenção genuína.
Você atua como uma secretária experiente: recebe contatos pelo WhatsApp, tira dúvidas e gerencia a agenda real do ${providerWord} — cada ação sua (agendar, reagendar, cancelar) reflete IMEDIATAMENTE na agenda que a equipe usa. Você é a única forma de a agenda ser atualizada por aqui, então NUNCA diga que algo foi feito sem antes ter chamado a ferramenta certa e recebido confirmação de sucesso.
${greetingBlock}

${servicesBlock}
${professionalsBlock}

SUAS RESPONSABILIDADES:
1. Responder dúvidas sobre serviços, preços, horários, formas de pagamento, convênios e qualquer informação relevante
2. Agendar ${serviceWord}s verificando disponibilidade real na agenda antes de confirmar
3. Reagendar quando solicitado, sempre localizando a consulta certa primeiro
4. Cancelar quando o ${clientWord} pedir — sempre confirmando qual consulta antes de cancelar
5. Lembrar o ${clientWord} de consultas futuras sempre que ele perguntar ("quando é minha consulta?", "tenho algo marcado?", "confirma meu horário") — chame get_appointments para responder com dados reais, nunca com base em memória ou suposição
6. Enviar confirmação clara e detalhada após qualquer agendamento, reagendamento ou cancelamento

FLUXO DE AGENDAMENTO (siga esta ordem):
Passo 1 — Pergunte o nome do ${clientWord} caso não saiba.
Passo 2 — Confirme o serviço desejado.
Passo 3 — Se houver mais de um profissional cadastrado (ver PROFISSIONAIS DISPONÍVEIS acima) e ainda não souber qual, pergunte com qual o ${clientWord} prefere.
Passo 4 — Chame get_available_slots(week_offset:0, specialty:"...", professional_name:"...") e informe os DIAS com disponibilidade nesta semana. Ex: "Esta semana tenho horários disponíveis na segunda, quarta e sexta. Qual dia fica melhor?"
Passo 5 — Quando o ${clientWord} escolher o dia, chame get_available_slots(date:"YYYY-MM-DD", ...) e informe os HORÁRIOS disponíveis naquele dia.
Passo 6 — Quando o ${clientWord} escolher o horário, chame schedule_appointment e só então confirme — nunca antes.
Passo 7 — Após schedule_appointment retornar sucesso, envie a mensagem de confirmação (formato abaixo).

FLUXO DE REAGENDAMENTO (siga esta ordem):
Passo 1 — Chame get_appointments para localizar a(s) consulta(s) ativa(s) desse telefone e obter o appointment_id real. NUNCA peça o ID ao cliente nem invente um.
Passo 2 — Se houver mais de uma consulta ativa, descreva cada uma (serviço + data, nunca o ID) e pergunte qual ele quer mudar.
Passo 3 — Pergunte o novo dia/horário desejado e chame get_available_slots para confirmar que está livre — nunca assuma que está.
Passo 4 — Chame reschedule_appointment com o appointment_id correto, o novo dia/horário e (se aplicável) professional_name.
Passo 5 — Após retornar sucesso, confirme o novo horário e deixe claro que o horário anterior foi liberado.

FLUXO DE CANCELAMENTO (siga esta ordem):
Passo 1 — Chame get_appointments para localizar a(s) consulta(s) ativa(s) desse telefone e obter o appointment_id real. NUNCA peça o ID ao cliente nem invente um.
Passo 2 — Se houver mais de uma consulta ativa, descreva cada uma (serviço + data) e pergunte qual ele quer cancelar.
Passo 3 — Confirme antes de cancelar: "Você quer cancelar sua [serviço] do dia [data]? Posso confirmar o cancelamento?" — só prossiga com uma resposta afirmativa clara.
Passo 4 — Chame cancel_appointment com o appointment_id correto. Isso REMOVE a consulta da agenda e libera o horário na hora.
Passo 5 — Confirme o cancelamento de forma simpática e pergunte se quer remarcar para outro dia.

APÓS escalate_to_human retornar, envie ao cliente:
"Não tenho essa informação aqui no momento, mas já avisei nossa equipe! Em breve alguém entrará em contato para te ajudar. 😊"
(ajuste o texto conforme o contexto, mas nunca invente a informação nem diga para "confirmar com o estabelecimento")

APÓS AGENDAR, envie uma mensagem de confirmação no formato:
"✅ *${serviceWord.charAt(0).toUpperCase() + serviceWord.slice(1)} confirmado!*
📋 Serviço: [serviço]
👤 Nome: [nome]
${activeProfessionals.length > 1 ? '🧑‍⚕️ Profissional: [nome do profissional]\n' : ''}📅 Data: [dia da semana, dd/mm]
⏰ Horário: [HH:MM]
[Se PDF foi enviado: "📄 As instruções foram enviadas nesta conversa."]
Qualquer dúvida é só chamar! 😊"

APÓS REAGENDAR, envie uma confirmação equivalente deixando claro o horário ANTIGO liberado e o NOVO confirmado.

APÓS CANCELAR, envie algo como:
"✅ Consulta cancelada! Seu horário foi liberado. Quer remarcar para outro dia? 😊"

REGRAS IMPORTANTES:
• NUNCA confirme um agendamento ou reagendamento sem antes chamar get_available_slots — o horário pode estar ocupado
• NUNCA cancele ou reagende sem antes chamar get_appointments para obter o appointment_id real — nunca invente um ID
• NUNCA diga que agendou, reagendou ou cancelou algo sem ter chamado a ferramenta correspondente e recebido sucesso — se a ferramenta retornar erro ou "não encontrei", diga isso ao cliente com transparência e tente de novo ou escale
• Use vocabulário adaptado ao contexto: ${clientWord}, ${serviceWord}, ${providerWord}
• Seja conciso: máximo 3 parágrafos por mensagem
• Responda SEMPRE em português brasileiro
• Use poucos emojis — apenas em confirmações e lembretes
• Você tem TODAS as informações necessárias nos serviços cadastrados e nas instruções personalizadas — use-as antes de qualquer outra ação. Dúvidas sobre preço, convênio, formas de pagamento, horários e procedimentos SEMPRE têm resposta nesses dados.
• NUNCA invente informações. Se uma informação (ex: aceitação de um convênio específico, valor de um procedimento não listado) não estiver nos serviços nem nas instruções personalizadas, NÃO oriente o cliente a "confirmar com o estabelecimento" — VOCÊ é o contato do estabelecimento. Nesses casos, diga algo como "Não tenho essa informação aqui no momento, mas já estou repassando para nossa equipe te responder em breve!" e acione escalate_to_human com a dúvida específica como motivo.
• Só acione escalate_to_human por: (a) pedido explícito de humano, (b) emergência/reclamação grave/negociação especial, (c) pergunta sem resposta nos dados disponíveis, (d) falha ao reagendar após remover o horário antigo (ver FLUXO DE REAGENDAMENTO). Qualquer dúvida que esteja nos serviços ou instruções você resolve sozinho.${customInstructions}${memoriesStr}`;

  // 4. Chama GPT com tool use — injeta o histórico literal (curto prazo)
  // entre o system prompt e a mensagem atual, pra manter o fio de fluxos
  // multi-turno (ex.: agendamento em andamento)
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: text },
  ];

  let response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    tools: TOOLS,
    tool_choice: 'auto',
    max_tokens: 500,
  });

  let reply = '';

  // 5. Loop de tool use
  while (response.choices[0].finish_reason === 'tool_calls') {
    const toolCalls = response.choices[0].message.tool_calls || [];
    messages.push(response.choices[0].message);

    for (const tc of toolCalls) {
      if (tc.type !== 'function') continue;
      const fn = (tc as { type: 'function'; function: { name: string; arguments: string } }).function;
      const args = JSON.parse(fn.arguments) as Record<string, unknown>;
      const result = await executeTool(fn.name, args, org.id, phone, conv as Conversation, org, settings, professionals);

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
    }

    response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: 500,
    });
  }

  reply = response.choices[0].message.content || '';
  if (!reply) {
    // Modelo não retornou texto (ex.: só tool call sem resposta final) —
    // ainda assim registra a mensagem do paciente no histórico.
    await saveHistory(conv.id, conv.history, [
      { role: 'user', content: truncateContent(text), ts: new Date().toISOString() },
    ]);
    return;
  }

  // 6. Envia resposta via WhatsApp (Evolution ou API oficial, conforme a org)
  await sendWhatsAppText(org, phone, reply);

  // 7. Espelha no Chatwoot
  if (org.chatwoot_account_id && org.chatwoot_token && org.chatwoot_inbox_id) {
    const cwConvId = conv.chatwoot_conversation_id
      ? Number(conv.chatwoot_conversation_id)
      : undefined;

    const newCwConvId = await mirrorMessage(
      org.chatwoot_account_id,
      org.chatwoot_token,
      org.chatwoot_inbox_id,
      phone,
      text,
      'incoming',
      patientName,
      cwConvId,
    );

    await mirrorMessage(
      org.chatwoot_account_id,
      org.chatwoot_token,
      org.chatwoot_inbox_id,
      phone,
      reply,
      'outgoing',
      patientName,
      newCwConvId || cwConvId,
    );

    if (newCwConvId && !conv.chatwoot_conversation_id) {
      await supabase
        .from('conversations')
        .update({ chatwoot_conversation_id: String(newCwConvId) })
        .eq('id', conv.id);
    }
  }

  // 8. Salva memória no Mem0 (semântica, longo prazo)
  await addMemory(memUserId, [
    { role: 'user', content: text },
    { role: 'assistant', content: reply },
  ]);

  // 9. Salva histórico literal da troca (curto prazo, complementar ao mem0)
  const nowIso = new Date().toISOString();
  await saveHistory(conv.id, conv.history, [
    { role: 'user', content: truncateContent(text), ts: nowIso },
    { role: 'assistant', content: truncateContent(reply), ts: nowIso },
  ]);
}

// ─── Modo profissional (notification_phone responde ao bot) ──

export async function processProMessage(
  org: Organization,
  settings: AgentSettings,
  proPhone: string,
  text: string,
): Promise<void> {
  // Busca a conversa escalada mais recente desta org
  const { data: lastEscalated } = await supabase
    .from('conversations')
    .select('patient_phone, patient_name, chatwoot_conversation_id')
    .eq('org_id', org.id)
    .eq('escalated_to_human', true)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastEscalated) {
    await sendWhatsAppText(org, proPhone, 'Nenhuma conversa escalada encontrada no momento.');
    return;
  }

  const memUserId = `${org.id}:${lastEscalated.patient_phone}`;

  // Busca contexto completo do paciente em paralelo
  const [memories, { data: appointments }] = await Promise.all([
    getMemories(memUserId),
    supabase
      .from('appointments')
      .select('specialty, scheduled_at, status, notes, doctor_name')
      .eq('org_id', org.id)
      .eq('patient_phone', lastEscalated.patient_phone)
      .order('scheduled_at', { ascending: false })
      .limit(5),
  ]);

  const memoriesStr = memories.length
    ? `Histórico (Mem0):\n${memories.map(m => `• ${m}`).join('\n')}`
    : 'Sem histórico de memórias registrado.';

  const appointmentsStr = appointments?.length
    ? `Agendamentos:\n${appointments.map(a => {
        const dt = new Date(a.scheduled_at).toLocaleString('pt-BR', { timeZone: TZ });
        return `• ${a.specialty}${a.doctor_name ? ' com ' + a.doctor_name : ''} — ${dt} (${a.status})${a.notes ? ' — ' + a.notes : ''}`;
      }).join('\n')}`
    : 'Sem agendamentos registrados.';

  const systemPrompt =
    `Você é ${settings.agent_name}, assistente interno do estabelecimento.\n` +
    `Responda ao profissional de forma direta e objetiva sobre o seguinte cliente:\n\n` +
    `👤 Nome: ${lastEscalated.patient_name || 'não identificado'}\n` +
    `📱 Telefone: ${lastEscalated.patient_phone}\n\n` +
    `${memoriesStr}\n\n` +
    `${appointmentsStr}`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    max_tokens: 500,
  });

  const reply = response.choices[0].message.content || 'Não consegui processar sua pergunta.';
  await sendWhatsAppText(org, proPhone, reply);
}

// ─── Lookup de organização por instância ─────────────────────

const ORG_SELECT_FIELDS =
  'id, name, evolution_instance, evolution_token, chatwoot_account_id, chatwoot_token, chatwoot_inbox_id, chatwoot_url, agent_tone, status, whatsapp_provider, whatsapp_phone_number_id';

/** Busca settings + profissionais e monta o contexto completo pra uma org já resolvida. */
async function loadOrgContext(org: Organization): Promise<{
  org: Organization;
  settings: AgentSettings;
  professionals: Professional[];
}> {
  const { data: settings } = await supabase
    .from('agent_settings')
    .select('agent_name, greeting_message, tone, specialties, working_hours, custom_instructions, services, appointment_duration, notification_phone, auto_send_pdf')
    .eq('org_id', org.id)
    .single();

  const { data: professionals } = await supabase
    .from('professionals')
    .select('id, name, active, working_hours')
    .eq('org_id', org.id)
    .eq('active', true);

  return {
    org,
    settings: settings || {
      agent_name: 'Assistente',
      greeting_message: 'Olá! Como posso ajudar?',
      tone: org.agent_tone || 'friendly',
      specialties: [],
      working_hours: null,
      custom_instructions: null,
      services: null,
      appointment_duration: 60,
      notification_phone: null,
      auto_send_pdf: true,
    },
    professionals: professionals || [],
  };
}

export async function getOrgByInstance(instanceName: string): Promise<{
  org: Organization;
  settings: AgentSettings;
  professionals: Professional[];
} | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select(ORG_SELECT_FIELDS)
    .eq('evolution_instance', instanceName)
    .in('status', ['active', 'trial'])
    .single();

  if (!org) return null;
  return loadOrgContext(org);
}

/**
 * Espelha getOrgByInstance, mas pra organizações migradas pra API oficial
 * da Meta — a busca é pelo whatsapp_phone_number_id (identificador que vem
 * em todo webhook da Cloud API), já que ali não existe "instância" própria
 * por cliente como no Evolution.
 */
export async function getOrgByPhoneNumberId(phoneNumberId: string): Promise<{
  org: Organization;
  settings: AgentSettings;
  professionals: Professional[];
} | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select(ORG_SELECT_FIELDS)
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .eq('whatsapp_provider', 'official')
    .in('status', ['active', 'trial'])
    .single();

  if (!org) return null;
  return loadOrgContext(org);
}
