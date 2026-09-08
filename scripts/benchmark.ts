import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { StrataDatabase } from '../app/main/db/index'


const sizes = (process.env.STRATA_BENCH_SIZES ?? '100,1000,10000,50000').split(',').map(Number)
const results = []
for (const count of sizes) {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-bench-'))
 let db = new StrataDatabase(dir)
 db.close()
 const fixture = new Database(path.join(dir, 'data/strata.sqlite'))
 const insert = fixture.prepare('INSERT INTO notes (id,content,created_at,updated_at,tags,title,normalized_title) VALUES (?,?,?,?,?,?,?)')
 const ids: string[] = []
 const now = new Date().toISOString()
 fixture.transaction(() => {
  for (let i = 0; i < count; i++) {
   const id = randomUUID(); ids.push(id)
   insert.run(id, `# Topic ${i}\n\n[[Topic ${Math.max(0,i-1)}]]\n` + `Deterministic knowledge category${i % 100} project decisions and context. `.repeat(30), now, now, JSON.stringify([`category${i % 100}`, 'knowledge']),`Topic ${i}`,`topic ${i}`)
  }
 })()
 fixture.close()
 const startup = performance.now(); db = new StrataDatabase(dir)
 const times: Record<string, number> = { startup: performance.now() - startup }
 const measure = (name: string, fn: () => unknown) => {
  const samples = []
  for (let i=0;i<5;i++) { const t=performance.now(); fn(); samples.push(performance.now()-t) }
  times[name]=samples.sort((a,b)=>a-b)[2]
 }
 measure('get',()=>db.getNote(ids[50]))
 measure('list',()=>db.listSummaryPage({limit:100}))
 measure('search',()=>db.aiSearchNotes('category42',10))
 measure('tags',()=>db.listTags())
 measure('tagList',()=>db.listNoteSummaries({tag:'category42'}))
 measure('updateLinks',()=>db.updateNote(ids[50],{content:`# Topic 50\n[[Topic 49]]\n${randomUUID()}`}))
 measure('backlinks',()=>db.getBacklinks(ids[49]))
 measure('related',()=>db.getRelatedNotes(ids[49]))
 const payloads = { list50: Buffer.byteLength(JSON.stringify(db.listSummaryPage({limit:50}).notes)), search10:Buffer.byteLength(JSON.stringify(db.aiSearchNotes('category42',10))) }
 results.push({count,ms:times,payloadBytes:payloads,rss:process.memoryUsage().rss})
 db.close(); fs.rmSync(dir,{recursive:true,force:true})
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,results},null,2))
