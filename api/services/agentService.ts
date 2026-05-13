/**
 * Agent Service — AgenteClin
 * GPT-5.4-nano com tool use para atendimento de clínicas.
 * Ferramentas: agendar consulta, consultar agendamentos, escalar para humano.
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { searchMemory, addMemory, getMemories } from './mem0Service.js';
import { sendText, sendDocument } from './evolutionService.js';
import { mirrorMessage } from './chatwootService.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

const MODEL = 'gpt-5.4-nano';

// ─── Tipos ────────────────────────────────────────────────────

interface Organization {
  id: string;
  name: string;
  evolution_instance: string;
  evolution_token: string | null;
  chatwoot_account_id: number | null;
  chatwoot_token: string | null;
  chatwoot_inbox_id: number | null;
  chatwoot_url: string | null;
  agent_tone: 'formal' | 'friendly';
}

interface Service {
  id: string;
  name: string;
  description: string;
  price: string;
  pdf_url: string | null;
  pdf_name: string | null;
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
}

interface Conversation {
  id: string;
  patient_phone: string;
  patient_name: string | null;
  escalated_to_human: boolean;
  chatwoot_conversation_id: string | null;
  message_count: number;
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
        },
        required: ['patient_name', 'specialty'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_appointments',
      description: 'Consulta os agendamentos do paciente. Use quando o paciente perguntar sobre suas consultas.',
      parameters: {
        type: 'object',
        properties: {
          patient_phone: { type: 'string', description: 'Telefone do paciente' },
        },
        required: ['patient_phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancela um agendamento existente.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'ID do agendamento a cancelar' },
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
      description: 'Reagenda um atendimento: cancela o agendamento atual e cria um novo horário. Use quando o cliente quiser mudar a data ou hora de um agendamento existente. Sempre chame get_available_slots antes para confirmar que o novo horário está livre.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'ID do agendamento atual a ser cancelado' },
          patient_name:   { type: 'string', description: 'Nome do paciente/cliente' },
          specialty:      { type: 'string', description: 'Serviço ou especialidade' },
          new_date:       { type: 'string', description: 'Nova data no formato YYYY-MM-DD' },
          new_time:       { type: 'string', description: 'Novo horário no formato HH:MM' },
          notes:          { type: 'string', description: 'Observações' },
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
): Promise<string> {
  switch (toolName) {
    case 'get_patient_info': {
      const memUserId = `${orgId}:${phone}`;
      const all = await getMemories(memUserId);
      if (!all.length) return 'Nenhuma informação registrada sobre este contato ainda.';
      return `Histórico do contato (${phone}):\n${all.map(m => `• ${m}`).join('\n')}`;
    }

    case 'get_available_slots': {
      const duration = settings.appointment_duration || 60;
      const weekOffset = typeof args.week_offset === 'number' ? args.week_offset : 0;

      // Define o intervalo de datas a verificar
      let dateFrom: Date;
      let dateTo: Date;
      if (args.date) {
        dateFrom = new Date(`${args.date}T00:00:00`);
        dateTo   = new Date(`${args.date}T23:59:59`);
      } else {
        const today = new Date();
        const dow = today.getDay(); // 0=Dom
        dateFrom = new Date(today);
        dateFrom.setDate(today.getDate() - dow + (weekOffset * 7));
        dateFrom.setHours(0, 0, 0, 0);
        dateTo = new Date(dateFrom);
        dateTo.setDate(dateFrom.getDate() + 6);
        dateTo.setHours(23, 59, 59, 999);
      }

      const fromStr = dateFrom.toISOString();
      const toStr   = dateTo.toISOString();
      const fromDate = dateFrom.toISOString().slice(0, 10);
      const toDate   = dateTo.toISOString().slice(0, 10);

      // Busca agendamentos existentes no período
      const { data: existingAppts } = await supabase
        .from('appointments')
        .select('scheduled_at, duration_minutes')
        .eq('org_id', orgId)
        .in('status', ['scheduled', 'confirmed'])
        .gte('scheduled_at', fromStr)
        .lte('scheduled_at', toStr);

      // Busca bloqueios no período
      const { data: blockedSlots } = await supabase
        .from('blocked_slots')
        .select('date, all_day, start_time, end_time')
        .eq('org_id', orgId)
        .gte('date', fromDate)
        .lte('date', toDate);

      // Horário de funcionamento padrão (seg-sex 09h-18h) — usado se working_hours não estiver configurado
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
        if (settings.working_hours) {
          return (settings.working_hours[String(dow)] as WorkingDay) || { active: false, start: '09:00', end: '18:00' };
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

      const PT_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const resultLines: string[] = [];

      // Itera cada dia do intervalo
      const cursor = new Date(dateFrom);
      while (cursor <= dateTo) {
        const dateKey = cursor.toISOString().slice(0, 10);
        const dow = cursor.getDay();
        const wd  = getWorkDay(dow);

        if (!wd.active) { cursor.setDate(cursor.getDate() + 1); continue; }

        const workStart = toMinutes(wd.start);
        const workEnd   = toMinutes(wd.end);

        // Slots ocupados por agendamentos existentes neste dia
        const dayAppts = (existingAppts || []).filter(a => a.scheduled_at.slice(0, 10) === dateKey);
        const occupied = dayAppts.map(a => {
          const apptDate = new Date(a.scheduled_at);
          const start = apptDate.getHours() * 60 + apptDate.getMinutes();
          const dur   = a.duration_minutes || duration;
          return { start, end: start + dur };
        });

        // Slots bloqueados por blocked_slots neste dia
        const dayBlocked = (blockedSlots || []).filter(b => b.date === dateKey);
        const blockedRanges = dayBlocked.map(b => {
          if (b.all_day) return { start: workStart, end: workEnd };
          return {
            start: b.start_time ? toMinutes(b.start_time.slice(0, 5)) : workStart,
            end:   b.end_time   ? toMinutes(b.end_time.slice(0, 5))   : workEnd,
          };
        });

        // Dia inteiramente bloqueado?
        if (blockedRanges.some(b => b.start <= workStart && b.end >= workEnd)) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }

        // Gera candidatos de slots
        const freeSlots: string[] = [];
        for (let t = workStart; t + duration <= workEnd; t += duration) {
          const slotEnd = t + duration;
          const blocked =
            occupied.some(o => t < o.end && slotEnd > o.start) ||
            blockedRanges.some(b => t < b.end && slotEnd > b.start);
          if (!blocked) freeSlots.push(fmtMinutes(t));
        }

        if (freeSlots.length > 0) {
          const label = cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
          resultLines.push(`${label}: ${freeSlots.join(', ')}`);
        }

        cursor.setDate(cursor.getDate() + 1);
      }

      if (resultLines.length === 0) {
        return `Nenhum horário disponível no período solicitado (${PT_DAYS[dateFrom.getDay()]} ${dateFrom.toLocaleDateString('pt-BR')} a ${PT_DAYS[dateTo.getDay()]} ${dateTo.toLocaleDateString('pt-BR')}). Cada atendimento tem duração de ${duration} minutos.`;
      }

      return `Horários disponíveis (atendimento de ${duration} min cada):\n${resultLines.join('\n')}`;
    }

    case 'schedule_appointment': {
      const { data, error } = await supabase
        .from('appointments')
        .insert({
          org_id: orgId,
          patient_name: args.patient_name,
          patient_phone: phone,
          specialty: args.specialty,
          scheduled_at: args.preferred_date && args.preferred_time
            ? `${args.preferred_date}T${args.preferred_time}:00`
            : null,
          duration_minutes: settings.appointment_duration || 60,
          notes: args.notes || null,
          status: 'scheduled',
        })
        .select('id')
        .single();

      if (error) return 'Não foi possível registrar o agendamento. Tente novamente.';

      // Envia PDF do serviço correspondente (fire-and-forget)
      const specialty = String(args.specialty || '');
      const svcEntry = settings.services?.find(
        s => s.name.toLowerCase() === specialty.toLowerCase(),
      );
      if (svcEntry?.pdf_url) {
        sendDocument(
          org.evolution_instance,
          phone,
          svcEntry.pdf_url,
          svcEntry.pdf_name || 'orientacoes.pdf',
          `📋 Orientações — ${svcEntry.name}`,
          org.evolution_token,
        ).catch(() => { /* best-effort */ });
      }

      const dateStr = args.preferred_date
        ? new Date(`${args.preferred_date}T${args.preferred_time || '00:00'}:00`)
            .toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
        : null;
      const timeStr = args.preferred_time || null;

      return JSON.stringify({
        success: true,
        appointment_id: data.id,
        patient_name: args.patient_name,
        specialty: args.specialty,
        date: dateStr,
        time: timeStr,
        pdf_sent: !!svcEntry?.pdf_url,
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

      if (!data?.length) return 'Nenhuma consulta agendada encontrada.';
      const list = data.map(a => {
        const dt = a.scheduled_at ? new Date(a.scheduled_at).toLocaleString('pt-BR') : 'a confirmar';
        return `• ${a.specialty}${a.doctor_name ? ' com ' + a.doctor_name : ''} — ${dt} (${a.status})`;
      }).join('\n');
      return `Suas consultas:\n${list}`;
    }

    case 'cancel_appointment': {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', args.appointment_id)
        .eq('org_id', orgId);

      if (error) return 'Não foi possível cancelar. Verifique o ID ou entre em contato.';
      return 'Agendamento cancelado com sucesso.';
    }

    case 'reschedule_appointment': {
      // 1. Cancela o agendamento atual
      const { error: cancelErr } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', args.appointment_id)
        .eq('org_id', orgId);

      if (cancelErr) return 'Não foi possível cancelar o agendamento atual. Tente novamente.';

      // 2. Cria o novo agendamento
      const { data, error: insertErr } = await supabase
        .from('appointments')
        .insert({
          org_id: orgId,
          patient_name: args.patient_name,
          patient_phone: phone,
          specialty: args.specialty,
          scheduled_at: `${args.new_date}T${args.new_time}:00`,
          duration_minutes: settings.appointment_duration || 60,
          notes: args.notes || null,
          status: 'scheduled',
        })
        .select('id')
        .single();

      if (insertErr) return 'Agendamento anterior cancelado, mas não foi possível criar o novo. Entre em contato.';

      // 3. Envia PDF se disponível
      const specialty = String(args.specialty || '');
      const svcEntry = settings.services?.find(s => s.name.toLowerCase() === specialty.toLowerCase());
      if (svcEntry?.pdf_url) {
        sendDocument(
          org.evolution_instance,
          phone,
          svcEntry.pdf_url,
          svcEntry.pdf_name || 'orientacoes.pdf',
          `📋 Orientações — ${svcEntry.name}`,
          org.evolution_token,
        ).catch(() => { /* best-effort */ });
      }

      const dateStr = new Date(`${args.new_date}T${args.new_time}:00`)
        .toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

      return JSON.stringify({
        success: true,
        appointment_id: data.id,
        patient_name: args.patient_name,
        specialty: args.specialty,
        date: dateStr,
        time: args.new_time,
        pdf_sent: !!svcEntry?.pdf_url,
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

        sendText(
          org.evolution_instance,
          settings.notification_phone,
          alertMsg,
          org.evolution_token,
        ).catch(() => { /* best-effort */ });
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

  // Atualiza contagem e nome se chegou
  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      message_count: (conv.message_count || 0) + 1,
      ...(patientName && !conv.patient_name ? { patient_name: patientName } : {}),
    })
    .eq('id', conv.id);

  // Se escalado para humano, não processa
  if (conv.escalated_to_human) return;

  // 2. Busca memórias relevantes do paciente
  const memUserId = `${org.id}:${phone}`;
  const memories = await searchMemory(memUserId, text, 5);

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

  const memoriesStr = memories.length
    ? `\nO QUE VOCÊ JÁ SABE SOBRE ESTE ${clientWord.toUpperCase()}:\n${memories.map(m => `• ${m}`).join('\n')}`
    : '';

  const customInstructions = settings.custom_instructions?.trim()
    ? `\nINSTRUÇÕES DO ESTABELECIMENTO:\n${settings.custom_instructions.trim()}`
    : '';

  const systemPrompt = `Você é ${settings.agent_name}, assistente virtual de atendimento. Seu tom é ${tone}.
Você atua como uma secretária experiente: recebe contatos pelo WhatsApp, tira dúvidas e gerencia a agenda do ${providerWord}.

${servicesBlock}

SUAS RESPONSABILIDADES:
1. Responder dúvidas sobre serviços, preços, horários, formas de pagamento, convênios e qualquer informação relevante
2. Agendar ${serviceWord}s verificando disponibilidade real na agenda antes de confirmar
3. Reagendar quando solicitado: cancele o atual e agende no novo horário disponível
4. Cancelar ${serviceWord}s quando o ${clientWord} pedir
5. Enviar confirmação detalhada após qualquer agendamento

FLUXO DE AGENDAMENTO (siga esta ordem):
Passo 1 — Pergunte o nome do ${clientWord} caso não saiba.
Passo 2 — Confirme o serviço desejado.
Passo 3 — Chame get_available_slots(week_offset:0) e informe os DIAS com disponibilidade nesta semana. Ex: "Esta semana tenho horários disponíveis na segunda, quarta e sexta. Qual dia fica melhor?"
Passo 4 — Quando o ${clientWord} escolher o dia, chame get_available_slots(date:"YYYY-MM-DD") e informe os HORÁRIOS disponíveis naquele dia.
Passo 5 — Quando o ${clientWord} escolher o horário, chame schedule_appointment e envie a confirmação.
Passo 6 — Após schedule_appointment retornar sucesso, envie mensagem de confirmação com todos os detalhes.

APÓS escalate_to_human retornar, envie ao cliente:
"Não tenho essa informação aqui no momento, mas já avisei nossa equipe! Em breve alguém entrará em contato para te ajudar. 😊"
(ajuste o texto conforme o contexto, mas nunca invente a informação nem diga para "confirmar com o estabelecimento")

APÓS AGENDAR, envie uma mensagem de confirmação no formato:
"✅ *${serviceWord.charAt(0).toUpperCase() + serviceWord.slice(1)} confirmado!*
📋 Serviço: [serviço]
👤 Nome: [nome]
📅 Data: [dia da semana, dd/mm]
⏰ Horário: [HH:MM]
[Se PDF foi enviado: "📄 As instruções foram enviadas nesta conversa."]
Qualquer dúvida é só chamar! 😊"

REGRAS IMPORTANTES:
• NUNCA confirme um horário sem antes chamar get_available_slots — o horário pode estar ocupado
• Use vocabulário adaptado ao contexto: ${clientWord}, ${serviceWord}, ${providerWord}
• Seja conciso: máximo 3 parágrafos por mensagem
• Responda SEMPRE em português brasileiro
• Use poucos emojis — apenas em confirmações e lembretes
• Você tem TODAS as informações necessárias nos serviços cadastrados e nas instruções personalizadas — use-as antes de qualquer outra ação. Dúvidas sobre preço, convênio, formas de pagamento, horários e procedimentos SEMPRE têm resposta nesses dados.
• NUNCA invente informações. Se uma informação (ex: aceitação de um convênio específico, valor de um procedimento não listado) não estiver nos serviços nem nas instruções personalizadas, NÃO oriente o cliente a "confirmar com o estabelecimento" — VOCÊ é o contato do estabelecimento. Nesses casos, diga algo como "Não tenho essa informação aqui no momento, mas já estou repassando para nossa equipe te responder em breve!" e acione escalate_to_human com a dúvida específica como motivo.
• Só acione escalate_to_human por: (a) pedido explícito de humano, (b) emergência/reclamação grave/negociação especial, (c) pergunta sem resposta nos dados disponíveis. Qualquer dúvida que esteja nos serviços ou instruções você resolve sozinho.${customInstructions}${memoriesStr}`;

  // 4. Chama GPT com tool use
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
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
      const result = await executeTool(fn.name, args, org.id, phone, conv as Conversation, org, settings);

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
  if (!reply) return;

  // 6. Envia resposta via Evolution
  await sendText(org.evolution_instance, phone, reply, org.evolution_token);

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

  // 8. Salva memória no Mem0
  await addMemory(memUserId, [
    { role: 'user', content: text },
    { role: 'assistant', content: reply },
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
    await sendText(org.evolution_instance, proPhone, 'Nenhuma conversa escalada encontrada no momento.', org.evolution_token);
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
        const dt = new Date(a.scheduled_at).toLocaleString('pt-BR');
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
  await sendText(org.evolution_instance, proPhone, reply, org.evolution_token);
}

// ─── Lookup de organização por instância ─────────────────────

export async function getOrgByInstance(instanceName: string): Promise<{
  org: Organization;
  settings: AgentSettings;
} | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, evolution_instance, evolution_token, chatwoot_account_id, chatwoot_token, chatwoot_inbox_id, chatwoot_url, agent_tone, status')
    .eq('evolution_instance', instanceName)
    .eq('status', 'active')
    .single();

  if (!org) return null;

  const { data: settings } = await supabase
    .from('agent_settings')
    .select('agent_name, greeting_message, tone, specialties, working_hours, custom_instructions, services, appointment_duration, notification_phone')
    .eq('org_id', org.id)
    .single();

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
    },
  };
}
