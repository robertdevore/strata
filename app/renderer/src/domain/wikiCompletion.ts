import type { CompletionContext } from '@codemirror/autocomplete'

/** Indexed, bounded suggestions also work for notes outside the sidebar page. */
export const completeWikiLinks = async (context: CompletionContext) => {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  const start = before.lastIndexOf('[[')
  if (start < 0) return null
  const partial = before.slice(start + 2).trim()
  if (partial.includes(']]') || partial.length > 200) return null
  try {
    const page = await window.strata.notes.page({ query: partial || undefined, limit: 8 })
    if (context.aborted) return null
    const options = page.notes
      .map((note) => note.title)
      .filter(
        (title): title is string =>
          typeof title === 'string' && title.toLowerCase().includes(partial.toLowerCase()),
      )
      .map((title) => ({ label: title, type: 'text', apply: `[[${title}]]`, detail: 'note' }))
    return options.length ? { from: line.from + start, options, filter: false } : null
  } catch {
    return null
  }
}
