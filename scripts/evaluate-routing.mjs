import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { tsImport } from 'tsx/esm/api'

const source = path.resolve(process.env.STRATA_EVAL_SOURCE ?? process.cwd())
const filename = path.join(source, 'app/main/ai/routing.ts')
const fixture = fs.readFileSync(path.join(source, 'app/main/ai/evals/routing-examples.json'))
const examples = JSON.parse(fixture)
const { route_ai_request } = await tsImport(filename, import.meta.url)
const cases = examples.map((example) => {
  const actual = route_ai_request(example.input)
  const expected = {
    intent: example.expectedIntent,
    route: example.expectedRoute,
    risk: example.expectedRisk,
    requiresConfirmation: example.requiresConfirmation,
  }
  return {
    id: example.id,
    expected,
    actual,
    passed: Object.entries(expected).every(([key, value]) => actual[key] === value),
  }
})
const timings = []
for (let repeat = 0; repeat < 100; repeat++)
  for (const example of examples) {
    const start = performance.now()
    route_ai_request(example.input)
    timings.push(performance.now() - start)
  }
timings.sort((a, b) => a - b)
console.log(
  JSON.stringify(
    {
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
      sourceSha256: createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),
      fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
      node: process.version,
      total: cases.length,
      passed: cases.filter((item) => item.passed).length,
      accuracy: cases.filter((item) => item.passed).length / cases.length,
      latency: {
        medianMs: timings[Math.floor(timings.length / 2)],
        p95Ms: timings[Math.floor(timings.length * 0.95)],
        samples: timings.length,
      },
      liveProviderCalls: 0,
      providerCostUsd: 0,
      inputTokens: null,
      outputTokens: null,
      toolCalls: 0,
      scope:
        'Offline heuristic classification only; model answer quality, provider token usage and live service latency are not measured.',
      cases,
    },
    null,
    2,
  ),
)
