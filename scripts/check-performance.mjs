import fs from 'node:fs'

// Median targets for the documented controlled-v1 fixture, not universal SLAs.
const budgets = {
  startup: 25,
  get: 10,
  titleLookup: 10,
  list100: 25,
  search10: 50,
  tags: 50,
  tagList100: 25,
  backlinksHub: 350,
  relatedHubHttp: 25,
  relatedLargeProjectHttp: 25,
  projects: 10,
  projectRename: 10,
  updateLinks: 30,
  renameHub: 1200,
  backup: 15000,
  clihealth: 1000,
  clilist50: 1000,
  clisearch10: 1000,
  projectDeleteLarge: 20000,
}
const files = process.argv.slice(2)
if (!files.length) {
  console.error('Usage: npm run benchmark:check -- <controlled benchmark JSON> [...]')
  process.exitCode = 2
}
for (const filename of files) {
  try {
    const result = JSON.parse(fs.readFileSync(filename, 'utf8'))
    if (result.fixture !== 'controlled-v1' || ![100, 1000, 10000, 50000].includes(result.count))
      throw new Error('Unsupported benchmark fixture')
    const failures = Object.entries(budgets).flatMap(([name, budgetMs]) => {
      const actualMs = result.metrics?.[name]?.medianMs
      return typeof actualMs !== 'number' || !Number.isFinite(actualMs) || actualMs < 0 || actualMs > budgetMs
        ? [{ metric: name, actualMs: actualMs ?? null, budgetMs }]
        : []
    })
    console.log(
      JSON.stringify({
        ok: failures.length === 0,
        count: result.count,
        sourceCommit: result.sourceCommit,
        failures,
      }),
    )
    if (failures.length) process.exitCode = 1
  } catch {
    console.error('Could not validate a controlled benchmark artifact.')
    process.exitCode = 2
  }
}
