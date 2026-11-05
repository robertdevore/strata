import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import ts from 'typescript'

// Same deterministic inputs and iteration count for the immutable baseline and working tree.
const baseline = '7fa22a0d625c8b300eb25920ddd5eb596c24bae4'
const file = 'app/shared/noteTitle.ts'
const load = async (source) => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`))
    .deriveNoteTitle
}
const before = await load(execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8' }))
const after = await load(fs.readFileSync(file, 'utf8'))
const body = 'Ordinary paragraph with words and punctuation.\n'.repeat(16000)
const fixtures = {
  headingFirst: `# Fixture title\n${body}`,
  headingLast: `${body}## Last heading`,
  noHeading: body,
}
const measure = (fn, content) => {
  for (let i = 0; i < 10; i++) fn(content)
  const samples = []
  for (let run = 0; run < 7; run++) {
    const start = performance.now()
    for (let i = 0; i < 100; i++) fn(content)
    samples.push((performance.now() - start) / 100)
  }
  const sorted = [...samples].sort((a, b) => a - b)
  return { medianMs: sorted[3], minMs: sorted[0], maxMs: sorted[6], samplesMs: samples }
}
const results = Object.entries(fixtures).map(([name, content]) => {
  assert.equal(after(content), before(content))
  return {
    name,
    characters: content.length,
    before: measure(before, content),
    after: measure(after, content),
  }
})
console.log(
  JSON.stringify(
    {
      baseline,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      iterationsPerSample: 100,
      samples: 7,
      results,
      limitations: 'Title extraction only; not end-to-end latency, peak RSS, or token counts.',
    },
    null,
    2,
  ),
)
