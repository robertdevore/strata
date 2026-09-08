import { expect, it } from 'vitest'
import { ActiveAiRequests } from '@main/ai/activeRequests'

it('only lets the originating renderer cancel a request', () => {
  const active = new ActiveAiRequests()
  const request = active.start('one', 1)
  expect(active.cancel('one', 2)).toBe(false)
  expect(active.cancel('missing', 1)).toBe(false)
  expect(request.signal.aborted).toBe(false)
  expect(active.cancel('one', 1)).toBe(true)
  expect(request.signal.aborted).toBe(true)
  request.finish()
  expect(active.cancel('one', 1)).toBe(false)
})
it('bounds actual in-flight work, including requests that have not settled after cancellation', () => {
  const active = new ActiveAiRequests(1)
  const request = active.start('one', 1)
  expect(() => active.start('one', 1)).toThrow('already active')
  expect(() => active.start('two', 1)).toThrow('Too many')
  request.cancel()
  expect(() => active.start('two', 1)).toThrow('Too many')
  request.finish()
  const replacement = active.start('one', 1)
  request.finish()
  expect(active.cancel('one', 1)).toBe(true)
  expect(replacement.signal.aborted).toBe(true)
})
