/**
 * POST /api/candidates/schedule-interviews
 * Cria registros de entrevista para candidatos aprovados e notifica via WhatsApp.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { sendText } from '../_services/evolutionService.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // ── PATCH: confirmar entrevista realizada + aprovar/reprovar candidato ──────
  if (req.method === 'PATCH') {
    const { interviewId, candidateId, orgId, outcome } = req.body as {
      interviewId: string; candidateId: string; orgId: string; outcome: 'approved' | 'rejected'
    }
    if (!interviewId || !candidateId || !orgId || !outcome)
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' })

    const [{ data: candidate }, { data: org }] = await Promise.all([
      supabaseAdmin.from('candidates').select('candidate_name, candidate_phone, analysis_result').eq('id', candidateId).single(),
      supabaseAdmin.from('organizations').select('evolution_instance, evolution_token').eq('id', orgId).single(),
    ])

    await Promise.all([
      supabaseAdmin.from('interviews').update({ status: 'REALIZADA' }).eq('id', interviewId),
      supabaseAdmin.from('candidates').update({
        status: outcome === 'approved' ? 'HIRED' : 'REJECTED',
        is_selected: outcome === 'approved',
      }).eq('id', candidateId),
    ])

    if (org?.evolution_instance && candidate?.candidate_phone) {
      const name  = candidate.candidate_name || (candidate.analysis_result as Record<string,unknown>)?.candidateName as string || 'Candidato'
      const phone = candidate.candidate_phone.replace(/\D/g, '')

      const msg = outcome === 'approved'
        ? `🎊 *Parabéns, ${name}!*\n\nTemos uma ótima notícia: você foi *aprovado(a)* na entrevista! Em breve nossa equipe entrará em contato com mais detalhes sobre os próximos passos.\n\nFicamos muito felizes em ter você no nosso time! 🚀`
        : `Olá, *${name}*! Agradecemos muito sua participação no nosso processo seletivo e o tempo que dedicou à entrevista.\n\nInfelizmente desta vez seguiremos com outro perfil, mas guardaremos seu currículo para futuras oportunidades. Obrigado! 🙏`

      await sendText(org.evolution_instance, phone, msg, org.evolution_token)
    }

    return res.status(200).json({ ok: true })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { jobId, orgId, candidateIds, slotDate, slotTime, format, meetingLink, interviewer } =
    req.body as {
      jobId: string
      orgId: string
      candidateIds: string[]
      slotDate: string
      slotTime: string
      format: string
      meetingLink?: string
      interviewer: string
    }

  if (!jobId || !orgId || !candidateIds?.length || !slotDate || !slotTime || !interviewer) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' })
  }

  // Busca dados dos candidatos e da org em paralelo
  const [{ data: candidates }, { data: job }, { data: org }] = await Promise.all([
    supabaseAdmin
      .from('candidates')
      .select('id, candidate_name, candidate_phone, analysis_result')
      .in('id', candidateIds)
      .eq('org_id', orgId),
    supabaseAdmin.from('jobs').select('title').eq('id', jobId).single(),
    supabaseAdmin
      .from('organizations')
      .select('evolution_instance, evolution_token')
      .eq('id', orgId)
      .single(),
  ])

  if (!candidates?.length) return res.status(404).json({ error: 'Candidatos não encontrados' })

  const jobTitle    = job?.title ?? 'vaga'
  const dateFormatted = new Date(slotDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  })

  const results = await Promise.allSettled(
    candidates.map(async (c) => {
      // 1. Cria registro de entrevista
      await supabaseAdmin.from('interviews').insert({
        job_id:          jobId,
        candidate_id:    c.id,
        org_id:          orgId,
        slot_date:       slotDate,
        slot_time:       slotTime,
        meeting_link:    meetingLink || null,
        format:          format,
        interviewer_name: interviewer,
        status:          'AGUARDANDO_RESPOSTA',
        candidate_name:  c.candidate_name || (c.analysis_result as Record<string, unknown>)?.candidateName as string || null,
        candidate_phone: c.candidate_phone || null,
      })

      // 2. Envia mensagem WhatsApp se houver instância configurada
      if (org?.evolution_instance && c.candidate_phone) {
        const name = c.candidate_name || (c.analysis_result as Record<string, unknown>)?.candidateName as string || 'Candidato'
        const phone = c.candidate_phone.replace(/\D/g, '')

        const msg = [
          `🎉 *Parabéns, ${name}!*`,
          ``,
          `Você foi *aprovado(a)* no processo seletivo para a vaga de *${jobTitle}*.`,
          ``,
          `📅 *Data:* ${dateFormatted}`,
          `⏰ *Horário:* ${slotTime}`,
          `👤 *Entrevistador:* ${interviewer}`,
          format === 'Online' && meetingLink ? `🎥 *Link:* ${meetingLink}` : `📍 *Formato:* Presencial`,
          ``,
          `Por favor, confirme sua presença respondendo *SIM* ou *NÃO*.`,
        ].filter(Boolean).join('\n')

        await sendText(org.evolution_instance, phone, msg, org.evolution_token)
      }

      // 3. Atualiza status do candidato
      await supabaseAdmin
        .from('candidates')
        .update({ status: 'INTERVIEW_SCHEDULED' })
        .eq('id', c.id)
    }),
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed    = results.filter(r => r.status === 'rejected').length

  console.log(`[ScheduleInterviews] jobId=${jobId} total=${candidateIds.length} ok=${succeeded} fail=${failed}`)

  return res.status(200).json({ ok: true, scheduled: succeeded, failed })
}
