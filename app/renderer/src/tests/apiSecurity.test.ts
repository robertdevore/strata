import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { startNotesApiServer } from '@main/api/notesApiServer'
import { safeExternalUrl, protectNavigation } from '@main/security/navigation'
import { ensureLocalCredential, readLocalCredential } from '../../../shared/apiCredential'

const cleanup: Array<() => unknown> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); delete process.env.STRATA_API_CREDENTIAL_FILE })
const start = async () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(),'strata-security-'))
 const db = new StrataDatabase(dir)
 cleanup.push(()=>{ db.close(); fs.rmSync(dir,{recursive:true,force:true}) })
 const token = 'test-token-with-at-least-thirty-two-characters'
 const server = await startNotesApiServer(db,{port:0,token})
 cleanup.push(()=>server.close())
 return { db, url:`http://127.0.0.1:${server.port}`, headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'} }
}
describe('local security boundaries',()=>{
 it('rejects unauthenticated, cross-origin, oversized and invalid content requests',async()=>{
  const {url,headers}=await start()
  expect((await fetch(`${url}/health`)).status).toBe(401)
  const ok=await fetch(`${url}/health`,{headers})
  expect(ok.status).toBe(200); expect(ok.headers.get('access-control-allow-origin')).toBeNull()
  expect((await fetch(`${url}/notes`,{headers:{...headers,Origin:'https://hostile.example'}})).status).toBe(403)
  expect((await fetch(`${url}/notes`,{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'{}'})).status).toBe(415)
  expect((await fetch(`${url}/notes`,{method:'POST',headers,body:'{'})).status).toBe(400)
  expect((await fetch(`${url}/notes`,{method:'POST',headers,body:JSON.stringify({content:'x'.repeat(1024*1024)})})).status).toBe(413)
 })
 it('refuses non-loopback addresses',async()=>{
  const {db}=await start()
  for(const host of ['0.0.0.0','::','192.168.1.2']) await expect(startNotesApiServer(db,{host,port:0})).rejects.toThrow('Non-loopback')
 })
 it('generates a persistent owner-only credential',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'strata-credential-'))
  cleanup.push(()=>fs.rmSync(dir,{recursive:true,force:true}))
  process.env.STRATA_API_CREDENTIAL_FILE=path.join(dir,'token')
  const token=ensureLocalCredential()
  expect(token.length).toBe(64); expect(readLocalCredential()).toBe(token); expect(ensureLocalCredential()).toBe(token)
  if(process.platform!=='win32') expect(fs.statSync(path.join(dir,'token')).mode & 0o777).toBe(0o600)
 })
 it('blocks renderer navigation and unsupported external URLs',()=>{
  for(const url of ['file:///etc/passwd','javascript:alert(1)','data:text/html,hello','https://user:secret@example.com']) expect(safeExternalUrl(url)).toBeNull()
  expect(safeExternalUrl('https://example.com')).toBe('https://example.com/')
  const events: Record<string,(event:{preventDefault:()=>void})=>void>={}
  let handler: ((details:{url:string})=>{action:string}) | undefined
  protectNavigation({on:(name:string,fn:typeof events[string])=>{events[name]=fn},setWindowOpenHandler:(fn:typeof handler)=>{handler=fn}} as unknown as Electron.WebContents)
  let prevented=false; events['will-navigate']({preventDefault:()=>{prevented=true}})
  expect(prevented).toBe(true); expect(handler?.({url:'file:///tmp/a'})).toEqual({action:'deny'})
  expect(fs.readFileSync('app/preload/preload.ts','utf8')).not.toMatch(/shellRun|shell:\s*\{/)
 })
})
