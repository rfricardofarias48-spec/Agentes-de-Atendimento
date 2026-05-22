/**
 * /api/candidates/schedule-interviews
 *
 * GET  ?token=TOKEN          → public: retorna booking info + slots disponíveis
 * POST                       → cria tokens de booking e envia links via WhatsApp
 * PUT  ?token=TOKEN          → público: candidato confirma um horário
 * PATCH                      → recrutador confirma entrevista realizada
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { sendText } from '../_services/evolutionService.js'

// ── Short token ───────────────────────────────────────────────────────────
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
function shortToken(len = 6) {
  return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

// ── Slot generation ────────────────────────────────────────────────────────
type Avail = { day_of_week: number; start_time: string; end_time: string }
type Block = { date: string; all_day: boolean; start_time?: string | null; end_time?: string | null }
type Booked = { booked_date: string | null; booked_time: string | null }

const DEFAULT_AVAIL: Avail[] = [1, 2, 3, 4, 5].map(dow => ({
  day_of_week: dow, start_time: '09:00', end_time: '18:00',
}))

function generateSlots(avail: Avail[], blocked: Block[], booked: Booked[], daysAhead = 14) {
  const slots: { date: string; time: string }[] = []
  const effective = avail.length > 0 ? avail : DEFAULT_AVAIL
  const nowPlus2h = Date.now() + 2 * 3600_000

  for (let i = 0; i < daysAhead; i++) {
    // BRT = UTC-3
    const d = new Date(Date.now() - 3 * 3600_000)
    d.setUTCDate(d.getUTCDate() + i)
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    const dow = d.getUTCDay()

    const dayAvail = effective.find(a => a.day_of_week === dow)
    if (!dayAvail) continue

    const dayBlocks = blocked.filter(b => b.date === dateStr)
    if (dayBlocks.some(b => b.all_day)) continue

    const startH = parseInt(dayAvail.start_time.split(':')[0])
    const endH   = parseInt(dayAvail.end_time.split(':')[0])

    for (let h = startH; h < endH; h++) {
      const timeStr = `${String(h).padStart(2, '0')}:00`
      // Skip past slots (BRT)
      const slotTs = new Date(`${dateStr}T${timeStr}:00-03:00`).getTime()
      if (slotTs <= nowPlus2h) continue
      // Skip time-blocked
      if (dayBlocks.some(b => !b.all_day && b.start_time && b.end_time &&
        timeStr >= b.start_time.slice(0, 5) && timeStr < b.end_time.slice(0, 5))) continue
      // Skip already booked
      if (booked.some(b => b.booked_date === dateStr && b.booked_time?.slice(0, 5) === timeStr)) continue

      slots.push({ date: dateStr, time: timeStr })
    }
  }
  return slots
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {

  // ── GET: return booking info + available slots (public) ─────────────────
  if (req.method === 'GET') {
    const { token } = req.query as { token?: string }
    if (!token) return res.status(400).json({ error: 'token obrigatório' })

    const { data: booking } = await supabaseAdmin
      .from('interview_bookings')
      .select('*, jobs(title), organizations(name)')
      .eq('token', token)
      .single()

    if (!booking) return res.status(404).json({ error: 'Link inválido ou expirado' })
    if (booking.status === 'BOOKED') return res.status(200).json({ booking, slots: [], alreadyBooked: true })
    if (new Date(booking.expires_at) < new Date()) return res.status(410).json({ error: 'Link expirado' })

    const [{ data: avail }, { data: blocked }, { data: alreadyBooked }] = await Promise.all([
      supabaseAdmin.from('recruiter_availability').select('*').eq('org_id', booking.org_id),
      supabaseAdmin.from('blocked_slots').select('date, all_day, start_time, end_time').eq('org_id', booking.org_id),
      supabaseAdmin.from('interview_bookings')
        .select('booked_date, booked_time')
        .eq('org_id', booking.org_id)
        .eq('status', 'BOOKED'),
    ])

    const slots = generateSlots(avail ?? [], blocked ?? [], alreadyBooked ?? [])
    return res.status(200).json({ booking, slots })
  }

  // ── PUT: candidate confirms a slot (public) ──────────────────────────────
  if (req.method === 'PUT') {
    const { token } = req.query as { token?: string }
    if (!token) return res.status(400).json({ error: 'token obrigatório' })

    const { date, time } = req.body as { date: string; time: string }
    if (!date || !time) return res.status(400).json({ error: 'date e time obrigatórios' })

    const { data: booking } = await supabaseAdmin
      .from('interview_bookings')
      .select('*, jobs(title), organizations(evolution_instance, evolution_token)')
      .eq('token', token)
      .single()

    if (!booking) return res.status(404).json({ error: 'Booking não encontrado' })
    if (booking.status === 'BOOKED') return res.status(409).json({ error: 'Horário já confirmado' })
    if (new Date(booking.expires_at) < new Date()) return res.status(410).json({ error: 'Link expirado' })

    // Check slot is still free
    const { data: conflict } = await supabaseAdmin
      .from('interview_bookings')
      .select('id')
      .eq('org_id', booking.org_id)
      .eq('status', 'BOOKED')
      .eq('booked_date', date)
      .eq('booked_time', time)
      .maybeSingle()

    if (conflict) return res.status(409).json({ error: 'Esse horário acabou de ser reservado. Escolha outro.' })

    const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long',
    })
    const jobTitle = (booking.jobs as { title: string })?.title ?? 'vaga'

    await Promise.all([
      supabaseAdmin.from('interview_bookings').update({ status: 'BOOKED', booked_date: date, booked_time: time }).eq('token', token),
      supabaseAdmin.from('interviews').insert({
        job_id: booking.job_id,
        candidate_id: booking.candidate_id,
        org_id: booking.org_id,
        slot_date: date,
        slot_time: time,
        format: booking.format,
        meeting_link: booking.meeting_link,
        interviewer_name: booking.interviewer_name,
        status: 'AGUARDANDO_CONFIRMACAO',
        candidate_name: booking.candidate_name,
        candidate_phone: booking.candidate_phone,
      }),
    ])

    const org = booking.organizations as { evolution_instance?: string; evolution_token?: string }
    if (org?.evolution_instance && booking.candidate_phone) {
      const phone = booking.candidate_phone.replace(/\D/g, '')
      const name  = booking.candidate_name || 'Candidato'
      const msg = [
        `✅ *Entrevista confirmada, ${name}!*`,
        ``,
        `📅 *Data:* ${dateFormatted}`,
        `⏰ *Horário:* ${time}`,
        `👤 *Entrevistador:* ${booking.interviewer_name}`,
        booking.format === 'Online' && booking.meeting_link
          ? `🎥 *Link:* ${booking.meeting_link}`
          : `📍 *Formato:* Presencial`,
        ``,
        `Estamos ansiosos para te conhecer! 🚀`,
      ].join('\n')
      await sendText(org.evolution_instance, phone, msg, org.evolution_token)
    }

    return res.status(200).json({ ok: true })
  }

  // ── PATCH: interviewer marks interview done + approve/reject ─────────────
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
      const name  = candidate.candidate_name || (candidate.analysis_result as Record<string, unknown>)?.candidateName as string || 'Candidato'
      const phone = candidate.candidate_phone.replace(/\D/g, '')
      const msg = outcome === 'approved'
        ? `🎊 *Parabéns, ${name}!*\n\nTemos uma ótima notícia: você foi *aprovado(a)* na entrevista! Em breve nossa equipe entrará em contato com mais detalhes sobre os próximos passos.\n\nFicamos muito felizes em ter você no nosso time! 🚀`
        : `Olá, *${name}*! Agradecemos muito sua participação no nosso processo seletivo e o tempo que dedicou à entrevista.\n\nInfelizmente desta vez seguiremos com outro perfil, mas guardaremos seu currículo para futuras oportunidades. Obrigado! 🙏`
      await sendText(org.evolution_instance, phone, msg, org.evolution_token)
    }

    return res.status(200).json({ ok: true })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── POST: create booking tokens + send WhatsApp links ───────────────────
  const { jobId, orgId, candidateIds, format, meetingLink, interviewer } =
    req.body as {
      jobId: string
      orgId: string
      candidateIds: string[]
      format: string
      meetingLink?: string
      interviewer: string
    }

  if (!jobId || !orgId || !candidateIds?.length || !interviewer)
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' })

  const [{ data: candidates }, { data: job }, { data: org }] = await Promise.all([
    supabaseAdmin.from('candidates')
      .select('id, candidate_name, candidate_phone, analysis_result')
      .in('id', candidateIds).eq('org_id', orgId),
    supabaseAdmin.from('jobs').select('title').eq('id', jobId).single(),
    supabaseAdmin.from('organizations').select('evolution_instance, evolution_token').eq('id', orgId).single(),
  ])

  if (!candidates?.length) return res.status(404).json({ error: 'Candidatos não encontrados' })

  const jobTitle = job?.title ?? 'vaga'
  const appUrl = `https://${req.headers['x-forwarded-host'] || req.headers.host}`

  const results = await Promise.allSettled(
    candidates.map(async (c) => {
      const name  = c.candidate_name || (c.analysis_result as Record<string, unknown>)?.candidateName as string || 'Candidato'
      const phone = c.candidate_phone?.replace(/\D/g, '')

      // Create booking token
      const token = shortToken()
      const { data: booking } = await supabaseAdmin
        .from('interview_bookings')
        .insert({
          token,
          org_id: orgId,
          job_id: jobId,
          candidate_id: c.id,
          candidate_name: name,
          candidate_phone: c.candidate_phone ?? null,
          format,
          meeting_link: meetingLink || null,
          interviewer_name: interviewer,
        })
        .select('token')
        .single()

      if (!booking) throw new Error('Falha ao criar booking')

      const bookingLink = `${appUrl}/b/${booking.token}`

      // Update candidate status
      await supabaseAdmin.from('candidates').update({ status: 'INTERVIEW_SCHEDULED' }).eq('id', c.id)

      // Send WhatsApp
      if (org?.evolution_instance && phone) {
        const msg = [
          `🎉 *Parabéns, ${name}!*`,
          ``,
          `Você foi *aprovado(a)* no processo seletivo para a vaga de *${jobTitle}*!`,
          ``,
          `Para confirmar sua entrevista com *${interviewer}*, escolha o melhor horário clicando no link abaixo:`,
          ``,
          `🗓️ ${bookingLink}`,
          ``,
          `O link ficará disponível por 7 dias.`,
        ].join('\n')
        await sendText(org.evolution_instance, phone, msg, org.evolution_token)
      }
    }),
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed    = results.filter(r => r.status === 'rejected').length

  return res.status(200).json({ ok: true, sent: succeeded, failed })
}
