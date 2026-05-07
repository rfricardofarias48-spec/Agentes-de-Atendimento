/**
 * Agent Service — AgenteClin
 * GPT-5.4-nano com tool use para atendimento de clínicas.
 * Ferramentas: agendar consulta, consultar agendamentos, escalar para humano.
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { searchMemory, addMemory } from './mem0Service.js';
import { sendText } from './evolutionService.js';
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
  agent_tone: 'formal' | 'friendly';
}

interface AgentSettings {
  agent_name: string;
  greeting_message: string;
  tone: string;
  specialties: string[];
  working_hours: Record<string, unknown> | null;
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
      description: 'Cancela uma consulta agendada.',
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
      name: 'escalate_to_human',
      description: 'Escala a conversa para um atendente humano. Use quando: paciente estiver frustrado, solicitação não puder ser resolvida, ou paciente pedir explicitamente.',
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
): Promise<string> {
  switch (toolName) {
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
          notes: args.notes || null,
          status: 'scheduled',
        })
        .select('id')
        .single();

      if (error) return 'Não foi possível registrar o agendamento no momento. Tente novamente.';
      return `Agendamento registrado com sucesso! ID: ${data.id}. Nossa equipe confirmará o horário em breve.`;
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
      return 'Consulta cancelada com sucesso.';
    }

    case 'escalate_to_human': {
      await supabase
        .from('conversations')
        .update({ escalated_to_human: true })
        .eq('id', conversation.id);

      return `Transferindo para nossa equipe. Motivo: ${args.reason}. Um atendente entrará em contato em breve.`;
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
  const specialtiesStr = settings.specialties?.length
    ? `Especialidades disponíveis: ${settings.specialties.join(', ')}.`
    : '';
  const memoriesStr = memories.length
    ? `\n\nInformações que você sabe sobre este paciente:\n${memories.map(m => `- ${m}`).join('\n')}`
    : '';

  const systemPrompt = `Você é ${settings.agent_name}, assistente de atendimento da clínica.
Seu tom é ${tone}. ${specialtiesStr}
Você ajuda pacientes a: agendar consultas, consultar agendamentos, cancelar consultas e esclarecer dúvidas.
Quando não conseguir resolver, escale para um atendente humano.
Responda sempre em português brasileiro. Seja conciso — máximo 3 parágrafos curtos.${memoriesStr}`;

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
      const fn = (tc as OpenAI.Chat.ChatCompletionMessageToolCall).function;
      const args = JSON.parse(fn.arguments) as Record<string, unknown>;
      const result = await executeTool(fn.name, args, org.id, phone, conv as Conversation);

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

// ─── Lookup de organização por instância ─────────────────────

export async function getOrgByInstance(instanceName: string): Promise<{
  org: Organization;
  settings: AgentSettings;
} | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, evolution_instance, evolution_token, chatwoot_account_id, chatwoot_token, chatwoot_inbox_id, agent_tone, status')
    .eq('evolution_instance', instanceName)
    .eq('status', 'active')
    .single();

  if (!org) return null;

  const { data: settings } = await supabase
    .from('agent_settings')
    .select('agent_name, greeting_message, tone, specialties, working_hours')
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
    },
  };
}
