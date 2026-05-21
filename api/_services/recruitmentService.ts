/**
 * Recruitment Service
 * Recebe documento (CV) via Evolution API, analisa com GPT, salva candidato.
 *
 * Fluxo:
 *  1. Candidato envia código de 6 dígitos → identificamos a vaga
 *  2. Candidato envia PDF/documento      → baixamos, extraímos texto, analisamos, salvamos
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

function env(k: string) { return (process.env[k] || '').replace(/^﻿+/, '').trim(); }

const openai   = new OpenAI({ apiKey: env('OPENAI_API_KEY') });
const supabase  = createClient(
  env('VITE_SUPABASE_URL') || env('SUPABASE_URL'),
  env('SUPABASE_SERVICE_ROLE_KEY'),
);

const MODEL = 'gpt-5.4-nano';

// ── Tipos ──────────────────────────────────────────────────────

export interface AnalysisResult {
  candidateName: string;
  phoneNumbers: string[];
  city: string;
  neighborhood: string;
  yearsExperience: string;
  matchScore: number;
  summary: string;
  pros: string[];
  cons: string[];
  workHistory: { role: string; company: string; duration: string }[];
}

const ERROR_BASE: Omit<AnalysisResult, 'candidateName' | 'summary' | 'cons'> = {
  matchScore: 0,
  yearsExperience: '-',
  city: '-',
  neighborhood: '-',
  phoneNumbers: [],
  pros: [],
  workHistory: [],
};

// ── Helpers Evolution ──────────────────────────────────────────

function evolutionBase() { return env('EVOLUTION_API_URL').replace(/\/$/, ''); }
function globalKey()     { return env('EVOLUTION_API_KEY'); }

/** Retry com backoff exponencial — tenta até 3 vezes */
async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = attempt * 1500;
      console.warn(`[Recruitment] ${label} tentativa ${attempt}/${maxAttempts} falhou, aguardando ${wait}ms…`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/** Baixa o arquivo de mídia da Evolution e retorna o Buffer */
export async function downloadMedia(
  instance: string,
  messageKey: Record<string, unknown>,
  instanceToken?: string | null,
): Promise<Buffer | null> {
  const apiKey = instanceToken || globalKey();
  try {
    const res = await fetch(`${evolutionBase()}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ message: { key: messageKey }, convertToMp4: false }),
    });
    if (!res.ok) {
      console.error(`[Recruitment] download media HTTP ${res.status}`);
      return null;
    }
    const json = await res.json() as { base64?: string };
    if (!json.base64) return null;
    return Buffer.from(json.base64, 'base64');
  } catch (err) {
    console.error('[Recruitment] downloadMedia error:', err);
    return null;
  }
}

// ── Lookup de vaga por short_code ──────────────────────────────

export async function findJobByCode(
  shortCode: string,
  orgId: string,
): Promise<{ id: string; title: string; criteria: string; auto_analyze: boolean } | null> {
  const { data } = await supabase
    .from('jobs')
    .select('id, title, criteria, auto_analyze')
    .eq('short_code', shortCode.trim())
    .eq('org_id', orgId)
    .single();
  return data ?? null;
}

// ── Sessão de recrutamento ─────────────────────────────────────

export async function getSession(phone: string, orgId: string) {
  const { data } = await supabase
    .from('recruitment_sessions')
    .select('*')
    .eq('phone', phone)
    .eq('org_id', orgId)
    .single();
  return data as { phone: string; org_id: string; job_id: string | null; state: string } | null;
}

export async function setSession(
  phone: string,
  orgId: string,
  jobId: string | null,
  state: string,
) {
  await supabase.from('recruitment_sessions').upsert({
    phone,
    org_id: orgId,
    job_id: jobId,
    state,
    updated_at: new Date().toISOString(),
  });
}

export async function clearSession(phone: string, orgId: string) {
  await supabase
    .from('recruitment_sessions')
    .delete()
    .eq('phone', phone)
    .eq('org_id', orgId);
}

// ── Extrai texto do PDF ───────────────────────────────────────

async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const pdfParse = req('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    const text = parsed.text?.trim() || '';
    console.log('[Recruitment] PDF extraído, caracteres:', text.length);
    return text.length >= 50 ? text : null;
  } catch (err) {
    console.error('[Recruitment] extractPdfText error:', err);
    return null;
  }
}

// ── Análise do CV com GPT ─────────────────────────────────────

export async function analyzeCv(
  pdfBuffer: Buffer,
  jobTitle: string,
  criteria: string,
  phone: string,
): Promise<AnalysisResult> {
  // 1. Extrai texto do PDF
  const pdfText = await extractPdfText(pdfBuffer);

  if (!pdfText) {
    return {
      ...ERROR_BASE,
      candidateName: 'Erro na Análise',
      summary: 'Não foi possível extrair o texto do PDF. O arquivo deve conter texto selecionável (não escaneado).',
      cons: ['PDF sem texto selecionável ou corrompido'],
    };
  }

  // 2. Prompt
  const systemPrompt = `Você é um especialista sênior em recrutamento e seleção. Analise o currículo abaixo para a vaga indicada e retorne SOMENTE um JSON válido, sem markdown, sem texto adicional.

VAGA: ${jobTitle}
REQUISITOS: ${criteria || 'Não especificados'}
TELEFONE DO CANDIDATO (WhatsApp): ${phone}

JSON de saída (todos os campos obrigatórios):
{
  "candidateName": "Nome Sobrenome extraído do currículo",
  "matchScore": <número decimal de 0.0 a 10.0>,
  "yearsExperience": "tempo de experiência no cargo (ex: '3 anos e 2 meses' ou 'Sem experiência direta')",
  "city": "cidade de residência ou 'Não informado'",
  "neighborhood": "bairro ou 'Não informado'",
  "phoneNumbers": ["${phone}"],
  "summary": "análise objetiva em ~400 caracteres: justifique a nota, destaque o mais relevante para a vaga",
  "pros": ["ponto forte 1", "ponto forte 2", "ponto forte 3"],
  "cons": ["ponto de atenção 1", "ponto de atenção 2"],
  "workHistory": [
    { "role": "cargo exato", "company": "empresa", "duration": "duração ex: '1 ano e 5 meses'" }
  ]
}

CRITÉRIO DE PONTUAÇÃO (matchScore):
- 9.0 a 10.0: Cargo EXATO + todos os requisitos atendidos + experiência sólida
- 7.0 a 8.9: Cargo exato, mas falta 1 ou 2 requisitos secundários
- 4.0 a 6.9: Experiência correlata (similar, mas não idêntico)
- 0.0 a 3.9: Sem experiência relevante para a vaga

REGRAS:
- candidateName: extraia do cabeçalho do currículo, jamais invente
- workHistory: inclua as 3 experiências mais recentes
- phoneNumbers: inclua todos os telefones encontrados no currículo (sempre inclua o telefone informado)`;

  // 3. Chamada com retry
  try {
    const result = await withRetry(async () => {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_completion_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `CURRÍCULO:\n\n${pdfText.substring(0, 12000)}` },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error('Resposta vazia da OpenAI');
      return JSON.parse(content) as AnalysisResult;
    }, 'analyzeCv');

    // Sanitização
    if (!result.candidateName || result.candidateName.length < 2) result.candidateName = 'Candidato (Nome não identificado)';
    if (typeof result.matchScore !== 'number' || result.matchScore < 0 || result.matchScore > 10) result.matchScore = 0;
    if (!Array.isArray(result.pros)) result.pros = [];
    if (!Array.isArray(result.cons)) result.cons = [];
    if (!Array.isArray(result.workHistory)) result.workHistory = [];
    if (!Array.isArray(result.phoneNumbers)) result.phoneNumbers = [];
    if (!result.yearsExperience) result.yearsExperience = '-';
    if (!result.city) result.city = '-';
    if (!result.neighborhood) result.neighborhood = '-';
    // Garante que o telefone do candidato está sempre incluído
    if (phone && !result.phoneNumbers.includes(phone)) result.phoneNumbers.unshift(phone);

    console.log('[Recruitment] Análise concluída:', result.candidateName, '| Score:', result.matchScore);
    return result;
  } catch (err) {
    const e = err as Error & { status?: number };
    console.error('[Recruitment] analyzeCv error após retries:', e.message);
    return {
      ...ERROR_BASE,
      candidateName: 'Erro na Análise',
      summary: `Erro ao processar: ${e.message || 'Erro desconhecido'}.`,
      cons: ['Falha na API OpenAI após 3 tentativas', e.message || ''],
    };
  }
}

// ── Upload do CV no Storage ────────────────────────────────────

export async function uploadCv(
  orgId: string,
  jobId: string,
  phone: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const ext  = mimeType.includes('pdf') ? 'pdf' : 'bin';
  const path = `${orgId}/${jobId}/${phone}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('resumes')
    .upload(path, buffer, { contentType: mimeType, upsert: false });
  if (error) { console.error('[Recruitment] uploadCv error:', error.message); return null; }
  return path;
}

// ── Salva candidato no banco ───────────────────────────────────

export async function saveCandidate(
  orgId: string,
  jobId: string,
  phone: string,
  analysis: AnalysisResult,
  filePath: string | null,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('candidates')
    .insert({
      org_id:          orgId,
      job_id:          jobId,
      status:          'COMPLETED',
      file_path:       filePath,
      analysis_result: analysis,
      is_selected:     false,
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) { console.error('[Recruitment] saveCandidate error:', error.message); return null; }
  return data?.id ?? null;
}

// ── Ponto de entrada principal ─────────────────────────────────

/**
 * Chamado pelo webhook quando o messageType é documento (PDF).
 * Retorna a mensagem de resposta a enviar ao candidato.
 */
export async function handleCvMessage(opts: {
  phone: string;
  orgId: string;
  instanceName: string;
  instanceToken?: string | null;
  messageKey: Record<string, unknown>;
  message: Record<string, unknown>;
  mimeType: string;
  embeddedBase64?: string;
}): Promise<string> {
  const { phone, orgId, instanceName, instanceToken, messageKey, message, mimeType, embeddedBase64 } = opts;

  // 1. Verifica sessão — precisa de uma vaga selecionada
  const session = await getSession(phone, orgId);
  if (!session?.job_id || session.state !== 'awaiting_cv') {
    return '📄 Para enviar seu currículo, primeiro me informe o *código da vaga* (6 dígitos). Exemplo: *123456*';
  }

  // 2. Busca dados da vaga
  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, criteria, auto_analyze')
    .eq('id', session.job_id)
    .single();

  if (!job) return '❌ Vaga não encontrada. Por favor, informe o código novamente.';
  if (!job.auto_analyze) return '📋 Esta vaga não está aceitando currículos no momento.';

  // 3. Obtém o buffer do PDF
  let buffer: Buffer | null = null;

  if (embeddedBase64) {
    // Usa base64 embutido no webhook (mais eficiente)
    const raw = embeddedBase64.replace(/^data:[^;]+;base64,/, '');
    buffer = Buffer.from(raw, 'base64');
    console.log('[Recruitment] Usando base64 embutido, length:', raw.length);
  } else {
    // Fallback: baixa via API da Evolution
    buffer = await downloadMedia(instanceName, messageKey, instanceToken);
  }

  if (!buffer) return '❌ Não consegui baixar seu currículo. Tente enviar novamente em PDF.';

  // 4. Upload no Storage (em paralelo com a análise — fire and forget para o path)
  const filePathPromise = uploadCv(orgId, job.id, phone, buffer, mimeType);

  // 5. Analisa com GPT (extrai texto do PDF internamente)
  const analysis = await analyzeCv(buffer, job.title, job.criteria || '', phone);

  // 6. Aguarda upload e salva candidato
  const filePath = await filePathPromise;
  await saveCandidate(orgId, job.id, phone, analysis, filePath);

  // 7. Limpa sessão
  await clearSession(phone, orgId);

  // 8. Resposta ao candidato
  const score = analysis.matchScore.toFixed(1);
  const isError = analysis.candidateName === 'Erro na Análise' || analysis.candidateName === 'Erro de Configuração';

  if (isError) {
    return '⚠️ Ocorreu um erro ao analisar seu currículo. Por favor, tente enviar novamente em alguns instantes.';
  }

  return `✅ *Currículo recebido com sucesso!*\n\nOlá, *${analysis.candidateName}*! Seu currículo para a vaga *${job.title}* foi recebido e analisado.\n\nFicamos felizes com seu interesse e entraremos em contato caso seu perfil avance no processo seletivo.\n\n_Pontuação de aderência: ${score}/10_`;
}

/**
 * Chamado quando candidato envia um código de 6 dígitos.
 * Retorna a mensagem de resposta.
 */
export async function handleJobCode(opts: {
  phone: string;
  orgId: string;
  code: string;
}): Promise<string> {
  const { phone, orgId, code } = opts;

  const job = await findJobByCode(code, orgId);
  if (!job) {
    return `❌ Código *${code}* não encontrado. Verifique e tente novamente.`;
  }
  if (!job.auto_analyze) {
    return `⏸️ A vaga *${job.title}* não está aceitando currículos no momento.`;
  }

  await setSession(phone, orgId, job.id, 'awaiting_cv');

  return `✅ Vaga encontrada: *${job.title}*\n\nAgora envie seu currículo em *PDF* para prosseguir com a candidatura.`;
}

// ── System prompt do agente ───────────────────────────────────

async function fetchSystemPrompt(orgId: string): Promise<string | null> {
  const { data } = await supabase
    .from('agent_prompts')
    .select('system_prompt')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .maybeSingle();
  return data?.system_prompt ?? null;
}

/**
 * Gera uma resposta natural usando OpenAI guiado pelo system_prompt do agente.
 * Se não houver system_prompt, retorna null e o fallback hardcoded é usado.
 */
async function generateAIResponse(
  systemPrompt: string,
  actionContext: string,
): Promise<string | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      max_completion_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: actionContext },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error('[Recruitment] generateAIResponse error:', (err as Error).message);
    return null;
  }
}

// ── Helpers de listagem ───────────────────────────────────────

async function listNiches(orgId: string) {
  const { data } = await supabase
    .from('niches')
    .select('id, name')
    .eq('org_id', orgId)
    .order('is_pinned', { ascending: false })
    .order('order_pos', { ascending: true });
  return (data ?? []) as { id: string; name: string }[];
}

async function listJobsByNiche(nicheId: string, orgId: string) {
  const { data } = await supabase
    .from('jobs')
    .select('id, title, auto_analyze')
    .eq('niche_id', nicheId)
    .eq('org_id', orgId)
    .eq('auto_analyze', true);
  return (data ?? []) as { id: string; title: string; auto_analyze: boolean }[];
}

async function listAllJobs(orgId: string) {
  const { data } = await supabase
    .from('jobs')
    .select('id, title, auto_analyze')
    .eq('org_id', orgId)
    .eq('auto_analyze', true);
  return (data ?? []) as { id: string; title: string; auto_analyze: boolean }[];
}

async function updateSessionContext(
  phone: string, orgId: string,
  patch: Partial<{ state: string; job_id: string | null; niche_id: string | null; context: object }>,
) {
  await supabase.from('recruitment_sessions').upsert({
    phone, org_id: orgId,
    updated_at: new Date().toISOString(),
    ...patch,
  });
}

function buildNicheMenu(niches: { id: string; name: string }[]): string {
  return niches.map((n, i) => `*${i + 1}.* ${n.name}`).join('\n');
}

function buildJobMenu(jobs: { id: string; title: string }[]): string {
  return jobs.map((j, i) => `*${i + 1}.* ${j.title}`).join('\n');
}

/**
 * Máquina de estados do Bento — processa mensagens de texto do candidato.
 * Retorna a mensagem de resposta a ser enviada.
 */
export async function processBentoMessage(opts: {
  phone: string;
  orgId: string;
  pushName: string;
  text: string;
}): Promise<string> {
  const { phone, orgId, pushName, text } = opts;
  const trimmed = text.trim();
  const firstName = (pushName || '').split(' ')[0] || 'candidato';

  // Busca sessão atual e system prompt em paralelo
  const [{ data: sessionRow }, systemPrompt] = await Promise.all([
    supabase
      .from('recruitment_sessions')
      .select('*')
      .eq('phone', phone)
      .eq('org_id', orgId)
      .single(),
    fetchSystemPrompt(orgId),
  ]);

  const session = sessionRow as {
    state: string;
    job_id: string | null;
    niche_id: string | null;
    context: { niches?: { id: string; name: string }[]; jobs?: { id: string; title: string }[] } | null;
  } | null;

  const state = session?.state ?? 'new';

  // Helper: usa OpenAI se houver system_prompt, senão retorna o fallback
  async function reply(actionContext: string, fallback: string): Promise<string> {
    if (!systemPrompt) return fallback;
    const ai = await generateAIResponse(systemPrompt, actionContext);
    return ai ?? fallback;
  }

  // ── Estado: aguardando PDF ─────────────────────────────────
  if (state === 'awaiting_cv') {
    return reply(
      `O candidato "${firstName}" está no estado "aguardando currículo" e enviou uma mensagem de texto: "${trimmed}". Lembre-o gentilmente de enviar o currículo em formato PDF para prosseguir.`,
      '📄 Por favor, envie seu currículo em formato *PDF* para prosseguir. 📄',
    );
  }

  // ── Estado: analisando ─────────────────────────────────────
  if (state === 'analyzing') {
    return reply(
      `O candidato "${firstName}" enviou uma mensagem enquanto o currículo está sendo analisado: "${trimmed}". Peça que aguarde.`,
      'Aguarde! Estamos analisando seu currículo... ⏳',
    );
  }

  // ── Estado: currículo recebido ─────────────────────────────
  if (state === 'cv_received') {
    return reply(
      `O candidato "${firstName}" já enviou o currículo e enviou nova mensagem: "${trimmed}". Informe que o currículo foi recebido e que a equipe entrará em contato.`,
      'Seu currículo já foi recebido! Em breve nossa equipe entrará em contato com os próximos passos. 😊',
    );
  }

  // ── Estado: selecionando vaga ──────────────────────────────
  if (state === 'selecting_job') {
    const jobs = session?.context?.jobs ?? [];
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= jobs.length) {
      const job = jobs[num - 1];
      await updateSessionContext(phone, orgId, { state: 'awaiting_cv', job_id: job.id, context: {} });
      return reply(
        `O candidato "${firstName}" selecionou a vaga "${job.title}". Confirme a escolha e peça que envie o currículo em PDF.`,
        `✅ A vaga de *${job.title}* foi registrada!\n\nAgora, por favor, envie seu currículo em formato *PDF*.`,
      );
    }
    const menu = buildJobMenu(jobs);
    return reply(
      `O candidato "${firstName}" enviou "${trimmed}" mas era esperado um número de 1 a ${jobs.length}. Peça que escolha novamente informando o número da vaga. Lista de vagas:\n${menu}`,
      `Não entendi. Por favor, responda com o número da vaga:\n\n${menu}`,
    );
  }

  // ── Estado: selecionando nicho ─────────────────────────────
  if (state === 'selecting_niche') {
    const niches = session?.context?.niches ?? [];
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= niches.length) {
      const niche = niches[num - 1];
      const jobs = await listJobsByNiche(niche.id, orgId);
      if (jobs.length === 0) {
        const freshNiches = await listNiches(orgId);
        await updateSessionContext(phone, orgId, { state: 'selecting_niche', niche_id: null, context: { niches: freshNiches } });
        const menu = buildNicheMenu(freshNiches);
        return reply(
          `O candidato "${firstName}" escolheu a área "${niche.name}" mas não há vagas abertas nela. Informe isso com empatia e mostre o menu de áreas novamente:\n${menu}`,
          `No momento não há vagas abertas em *${niche.name}*. 😔\n\nEscolha outra área:\n\n${menu}`,
        );
      }
      await updateSessionContext(phone, orgId, { state: 'selecting_job', niche_id: niche.id, context: { jobs } });
      const menu = buildJobMenu(jobs);
      return reply(
        `O candidato "${firstName}" escolheu a área "${niche.name}". Mostre as vagas disponíveis e peça que escolha pelo número:\n${menu}`,
        `Ótimo! Vagas disponíveis em *${niche.name}*:\n\n${menu}\n\nResponda com o *número* da vaga que deseja se candidatar.`,
      );
    }
    const menu = buildNicheMenu(niches);
    return reply(
      `O candidato "${firstName}" enviou "${trimmed}" mas era esperado um número de 1 a ${niches.length}. Peça que escolha novamente. Menu de áreas:\n${menu}`,
      `Não entendi. Por favor, responda com o número da área:\n\n${menu}`,
    );
  }

  // ── Estado: novo / primeiro contato ───────────────────────
  const niches = await listNiches(orgId);

  if (niches.length === 0) {
    const jobs = await listAllJobs(orgId);
    if (jobs.length === 0) {
      return reply(
        `Primeiro contato do candidato "${firstName}". Não há vagas abertas no momento. Informe isso de forma cordial.`,
        'Olá! No momento não há vagas abertas. Em breve novas oportunidades serão divulgadas!',
      );
    }
    await updateSessionContext(phone, orgId, { state: 'selecting_job', context: { jobs } });
    const menu = buildJobMenu(jobs);
    return reply(
      `Primeiro contato do candidato "${firstName}" (telefone: ${phone}). Dê as boas-vindas, apresente-se como assistente de recrutamento e mostre as vagas disponíveis pedindo que escolha pelo número:\n${menu}`,
      `Olá, *${firstName}*! 👋 Sou o Bento, assistente de recrutamento. 🤖\n\nVagas disponíveis:\n\n${menu}\n\nResponda com o *número* da vaga que deseja se candidatar.`,
    );
  }

  await updateSessionContext(phone, orgId, { state: 'selecting_niche', context: { niches } });
  const menu = buildNicheMenu(niches);
  return reply(
    `Primeiro contato do candidato "${firstName}" (telefone: ${phone}). Dê as boas-vindas, apresente-se como assistente de recrutamento e mostre as áreas disponíveis pedindo que escolha pelo número:\n${menu}`,
    `Olá, *${firstName}*! 👋 Sou o Bento, assistente de recrutamento. 🤖\n\nTemos vagas abertas em diversas áreas! Em qual delas você tem interesse?\n\n${menu}\n\nResponda com o *número* da área desejada.`,
  );
}
