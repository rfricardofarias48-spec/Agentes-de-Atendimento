/**
 * Transcription Service — AgenteClin
 * Transcreve áudios recebidos via WhatsApp (Evolution) usando o modelo
 * de transcrição da OpenAI, pra que o agente processe áudio igual texto.
 */

import { File } from 'node:buffer';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Escolhe um nome de arquivo coerente com o mimetype, pro upload ser aceito. */
function fileNameForMimetype(mimetype: string): string {
  const mt = (mimetype || '').toLowerCase();
  if (mt.includes('mpeg') || mt.includes('mp3')) return 'audio.mp3';
  if (mt.includes('mp4') || mt.includes('aac')) return 'audio.m4a';
  return 'audio.ogg'; // padrão do WhatsApp (audio/ogg; codecs=opus)
}

/**
 * Transcreve um áudio (base64) para texto em português.
 * Tenta gpt-4o-mini-transcribe primeiro; se o modelo falhar (indisponível
 * ou inexistente), tenta uma vez com whisper-1 (aceita o mesmo ogg/opus).
 * NUNCA lança exceção — retorna null em qualquer falha, já logando o erro.
 */
export async function transcribeAudio(base64: string, mimetype: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64, 'base64');
    const fileName = fileNameForMimetype(mimetype);
    const file = new File([buffer], fileName, { type: mimetype || 'audio/ogg' });

    try {
      const result = await openai.audio.transcriptions.create({
        file,
        model: 'gpt-4o-mini-transcribe',
        language: 'pt',
      });
      const text = result.text?.trim();
      return text || null;
    } catch (primaryErr) {
      console.warn('[Transcription] gpt-4o-mini-transcribe falhou, tentando whisper-1:', primaryErr);
      const fallback = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'pt',
      });
      const text = fallback.text?.trim();
      return text || null;
    }
  } catch (err) {
    console.error('[Transcription] Falha ao transcrever áudio:', err);
    return null;
  }
}
