import { z } from 'zod'

export const exportDocumentSchema = z
  .object({
    html: z
      .string()
      .min(1)
      .max(8 * 1024 * 1024),
  })
  .strict()

// Export HTML is a data document, so a response-header policy does not protect it.
// Inline layout and embedded images/fonts work without fetching remote or local files.
const EXPORT_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none';"

export const exportDocumentUrl = (html: string): string =>
  `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">${html}`,
  )}`
