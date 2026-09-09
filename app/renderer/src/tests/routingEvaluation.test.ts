import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { route_ai_request } from '@main/ai/routing'

const examples = JSON.parse(
  fs.readFileSync(new URL('../../../main/ai/evals/routing-examples.json', import.meta.url), 'utf8'),
) as Array<{
  id: string
  input: string
  expectedIntent: string
  expectedRoute: string
  expectedRisk: string
  requiresConfirmation: boolean
}>

describe('published routing evaluation', () => {
  it.each(examples)('$id', (example) => {
    expect(route_ai_request(example.input)).toMatchObject({
      intent: example.expectedIntent,
      route: example.expectedRoute,
      risk: example.expectedRisk,
      requiresConfirmation: example.requiresConfirmation,
    })
  })
  it('prefers the requested operation over topic words and rejects partial-word tag matches', () => {
    for (const [input, intent] of [
      ['summarize notes about architecture decisions', 'summarize_note'],
      ['find notes about architecture decisions', 'search_notes'],
      ['tag the architecture decision record', 'tag_note'],
      ['edit the note about system design', 'update_note'],
      ['Investigate staging latency', 'unknown'],
      ['Explain this labeler', 'unknown'],
    ])
      expect(route_ai_request(input).intent).toBe(intent)
  })
})
