export const deriveNoteTitle = (content: string): string => {
  let firstLine = ''
  let offset = 0
  while (offset < content.length) {
    const newline = content.indexOf('\n', offset)
    const end = newline === -1 ? content.length : newline
    const line = content.slice(offset, end).trim()
    if (line) {
      if (!firstLine) firstLine = line.slice(0, 80)
      if (/^#{1,6}\s+/.test(line)) return line.replace(/^#{1,6}\s+/, '').trim() || 'Untitled'
    }
    offset = end + 1
  }
  return firstLine || 'Untitled'
}
