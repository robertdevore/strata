import { z } from 'zod'
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024
export const transcriptionSchema = z
  .object({
    requestId: z.string().uuid().optional(),
    base64Audio: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_AUDIO_BYTES / 3) * 4),
    mimeType: z.enum([
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/ogg;codecs=opus',
    ]),
    prompt: z.string().max(1200).optional(),
    language: z
      .string()
      .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.base64Audio.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4) return
    if (value.base64Audio.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.base64Audio)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid base64 audio', path: ['base64Audio'] })
      return
    }
    const padding = value.base64Audio.endsWith('==') ? 2 : value.base64Audio.endsWith('=') ? 1 : 0
    if ((value.base64Audio.length / 4) * 3 - padding > MAX_AUDIO_BYTES)
      ctx.addIssue({ code: 'custom', message: 'Decoded audio exceeds limit', path: ['base64Audio'] })
  })
