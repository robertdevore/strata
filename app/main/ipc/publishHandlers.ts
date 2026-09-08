import { handleTrustedIpc } from '../security/trustedIpc'
import { dialog } from 'electron'
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { IPC_CHANNELS } from '../../shared/ipc'
import { exportDocumentSchema } from '../security/exportDocument'

const publish_schema = z
  .object({
    destination: z.string().min(1).max(4096),
    title: z.string().min(1).max(500),
    html: exportDocumentSchema.shape.html,
  })
  .strict()

const publishFilename = (title: string): string => {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  let name = ''
  for (const character of cleaned) {
    if (Buffer.byteLength(name + character, 'utf8') > 240) break
    name += character
  }
  if (!name) name = 'untitled-note'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`
  return `${name}.html`
}

export const registerPublishHandlers = () => {
  const destinations = new Set<string>()
  handleTrustedIpc(IPC_CHANNELS.dialogSelectFolder, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select publish destination',
    })
    if (result.canceled || !result.filePaths.length) return null
    destinations.add(await fs.realpath(result.filePaths[0]))
    return result.filePaths[0]
  })

  handleTrustedIpc(IPC_CHANNELS.publishHtmlFile, async (_event, payload) => {
    const { destination, title, html } = publish_schema.parse(payload)
    const canonicalDestination = await fs.realpath(destination)
    if (!destinations.has(canonicalDestination)) throw new Error('Select the publish destination first')
    const file_path = path.join(canonicalDestination, publishFilename(title))

    try {
      await fs.writeFile(file_path, html, { encoding: 'utf-8', flag: 'wx' })
      return { success: true, path: file_path }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
