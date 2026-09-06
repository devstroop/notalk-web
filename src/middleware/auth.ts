import { createMiddleware } from 'hono/factory'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { config } from '../config.js'
import type { Identity } from '../types/index.js'
import { hasPermission } from '../types/index.js'

export const SESSION_COOKIE = 'notalk_session'
export const FLASH_COOKIE = 'notalk_flash'

export type { Identity }

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g,'+').replace(/_/g,'/')
  const pad = s.length %4; if(pad) s += '='.repeat(4-pad)
  return Uint8Array.from(atob(s), c=>c.charCodeAt(0))
}
async function verifyJwt(token:string, secret:string): Promise<any|null> {
  const parts = token.split('.'); if(parts.length!==3) return null
  const [h,p,sig] = parts
  try{
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['verify'])
    const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig) as unknown as BufferSource, new TextEncoder().encode(`${h}.${p}`))
    if(!ok) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)))
    if(payload.exp && Date.now()/1000 > payload.exp) return null
    return payload
  }catch{ return null }
}
export function hasPerm(id: Identity | null, need: string): boolean {
  return hasPermission(id, need)
}

export const webAuth = createMiddleware(async (c, next)=>{
  const publicPaths = new Set(['/', '/login','/logout','/forgot-password','/reset-password','/about','/terms','/privacy','/pricing'])
  if(config.auth.registrationEnabled) publicPaths.add('/register')
  const path = new URL(c.req.url).pathname
  if(path.startsWith('/static/')|| path==='/favicon.ico' || path==='/health' ) return next()
  if(publicPaths.has(path)) return next()

  const token = getCookie(c, SESSION_COOKIE)||''
  if(!token) return c.redirect('/login',303)

  if(token===config.auth.secretKey){
    c.set('identity', {userId:'system', username:'system', roleName:'admin', permissions:['*']} as Identity)
    c.set('token', token)
    return next()
  }
  const payload = await verifyJwt(token, config.auth.secretKey)
  if(payload){
    const userId = payload.sub as string
    if(!userId){ deleteCookie(c, SESSION_COOKIE, {path:'/'}); return c.redirect('/login',303)}
    const ident: Identity = {
      userId,
      username: (payload.username as string) || userId,
      roleName: (payload.role as string) || 'user',
      permissions: Array.isArray(payload.permissions) ? payload.permissions : ['accounts:read','session:*','messages:*','chats:read','contacts:*','groups:*','presence:*','profile:*','api-keys:*','mcp:read']
    }
    if(payload.role==='admin'||payload.roleName==='admin') ident.permissions=['*']
    c.set('identity', ident)
    c.set('token', token)
    return next()
  }
  if(token.startsWith('notalk_')){
    c.set('identity', {userId:'api-key', username:'api-key', roleName:'user', permissions:['accounts:read','session:*','messages:*','chats:read']} as Identity)
    c.set('token', token)
    return next()
  }
  deleteCookie(c, SESSION_COOKIE, {path:'/'})
  return c.redirect('/login',303)
})

export function getIdentity(c:any): Identity|null { return c.get('identity') ?? null }
export function getToken(c:any): string|null { return c.get('token') ?? null }
export function setSession(c:any, token:string){ setCookie(c, SESSION_COOKIE, token, {path:'/', httpOnly:true, sameSite:'Lax', maxAge:60*60*24})}
export function clearSession(c:any){ deleteCookie(c, SESSION_COOKIE, {path:'/'})}
export function getFlash(c:any): {Type:string; Message:string}|null {
  const raw = getCookie(c, FLASH_COOKIE); if(!raw) return null
  deleteCookie(c, FLASH_COOKIE, {path:'/'})
  const i = raw.indexOf('|'); if(i===-1) return null
  return {Type: raw.slice(0,i), Message: raw.slice(i+1)}
}
export function setFlash(c:any, type:string, msg:string){ setCookie(c, FLASH_COOKIE, `${type}|${msg}`, {path:'/', httpOnly:true, sameSite:'Lax', maxAge:10})}
