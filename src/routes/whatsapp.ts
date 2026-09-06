import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash } from '../middleware/auth.js'
import { backend } from '../lib/api.js'
import { renderPage } from '../lib/render/index.js'

export function registerWhatsappRoutes(app: Hono): void {
  app.get('/whatsapp', async (c) => {
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    const { data } = await backend.json('GET', '/api/v1/accounts', token)
    const accounts: any[] = Array.isArray(data) ? data : (data?.accounts ?? [])
    const rows = accounts.map((a: any) => ({
      ID: a.id,
      AccountName: a.account_name ?? '',
      PhoneNumber: a.phone_number ?? '',
      Connected: a.status?.connected ?? a.connected ?? a.authorized ?? a.Authorized ?? false,
    }))
    return c.html(
      renderPage('messaging', {
        Title: 'WhatsApp Web — NoTalk',
        Page: 'messaging',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Accounts: rows },
      })
    )
  })

  // Generic proxy (GET chats/contacts/groups/newsletters + POST send/follow) — no body rewrite
  for (const [front, back] of [
    ['POST:/whatsapp/:id/send', 'POST:/api/v1/accounts/:id/messages'],
    ['GET:/whatsapp/:id/chats', 'GET:/api/v1/accounts/:id/chats'],
    ['GET:/whatsapp/:id/contacts', 'GET:/api/v1/accounts/:id/contacts'],
    ['GET:/whatsapp/:id/groups', 'GET:/api/v1/accounts/:id/groups'],
    ['GET:/whatsapp/:id/newsletters', 'GET:/api/v1/accounts/:id/newsletters'],
    ['POST:/whatsapp/:id/newsletter-follow', 'POST:/api/v1/accounts/:id/newsletters/follow'],
    ['POST:/whatsapp/:id/newsletter-unfollow', 'POST:/api/v1/accounts/:id/newsletters/unfollow'],
  ] as const) {
    const fi = front.indexOf(':')
    const bi = back.indexOf(':')
    const m = front.slice(0, fi)
    const fp = front.slice(fi + 1)
    const bp = back.slice(bi + 1)
    app.on(m as any, fp, async (c) => {
      const id = c.req.param('id') ?? ''
      const token = getToken(c)!
      const q = new URL(c.req.url).search
      const path = (bp as string).replace(':id', id) + q
      const res = await backend.proxy(m, path, token, {
        headers: { 'Content-Type': c.req.header('content-type') || 'application/json' },
        body: m !== 'GET' ? Buffer.from(await c.req.arrayBuffer()) : undefined,
      })
      const body = await res.arrayBuffer()
      c.header('Content-Type', res.headers.get('content-type') || 'application/json')
      return c.body(Buffer.from(body), res.status as any)
    })
  }

  // Mark-read + react need chat_jid/jid → chat translation (frontend legacy varied keys)
  for (const [front, back] of [
    ['POST:/whatsapp/:id/react', 'POST:/api/v1/accounts/:id/messages/reactions'],
    ['POST:/whatsapp/:id/mark-read', 'POST:/api/v1/accounts/:id/messages/mark-read'],
  ] as const) {
    const fi = front.indexOf(':')
    const bi = back.indexOf(':')
    const m = front.slice(0, fi)
    const fp = front.slice(fi + 1)
    const bp = back.slice(bi + 1)
    app.on(m as any, fp, async (c) => {
      const id = c.req.param('id') ?? ''
      const token = getToken(c)!
      const q = new URL(c.req.url).search
      const path = (bp as string).replace(':id', id) + q
      let bodyBuf: any
      if (m !== 'GET') {
        const raw = Buffer.from(await c.req.arrayBuffer())
        const ct = c.req.header('content-type') || ''
        if (ct.includes('application/json') && raw.length) {
          try {
            const j: any = JSON.parse(raw.toString('utf-8'))
            if (!j.chat && j.chat_jid) j.chat = j.chat_jid
            if (!j.chat && j.jid) j.chat = j.jid
            // normalize message_ids if single id sent
            bodyBuf = Buffer.from(JSON.stringify(j))
          } catch {
            bodyBuf = raw
          }
        } else {
          bodyBuf = raw.length ? raw : undefined
        }
      }
      const res = await backend.proxy(m, path, token, {
        headers: { 'Content-Type': c.req.header('content-type') || 'application/json' },
        body: bodyBuf as any,
      })
      const body = await res.arrayBuffer()
      c.header('Content-Type', res.headers.get('content-type') || 'application/json')
      return c.body(Buffer.from(body), res.status as any)
    })
  }

  // Revoke is special: frontend POSTs JSON {chat_jid, message_id}, need to map to DELETE /messages/:message_id?chat=...
  app.post('/whatsapp/:id/revoke', async (c) => {
    const id = c.req.param('id') ?? ''
    const token = getToken(c)!
    let bodyJson: any = {}
    try { bodyJson = await c.req.json() } catch { bodyJson = {} }
    const chat = bodyJson.chat_jid || bodyJson.chat || bodyJson.jid || ''
    const msgId = bodyJson.message_id || bodyJson.id || ''
    if (!chat || !msgId) return c.json({ error: 'chat_jid and message_id required' }, 400)
    const res = await backend.proxy('DELETE', `/api/v1/accounts/${id}/messages/${encodeURIComponent(msgId)}`, token, {
      headers: { 'Content-Type': 'application/json' },
      query: `chat=${encodeURIComponent(chat)}`,
    })
    const body = await res.arrayBuffer()
    c.header('Content-Type', res.headers.get('content-type') || 'application/json')
    return c.body(Buffer.from(body), res.status as any)
  })

  app.get('/whatsapp/:id/messages', async (c) => {
    const id = c.req.param('id')
    const token = getToken(c)!
    const chat = c.req.query('chat') || ''
    if (!chat) return c.json({ error: 'chat required' }, 400)
    const res = await backend.proxy('GET', `/api/v1/accounts/${id}/messages`, token, {
      query: new URL(c.req.url).searchParams.toString(),
    })
    return c.body(Buffer.from(await res.arrayBuffer()), res.status as any, {
      'Content-Type': res.headers.get('content-type') || 'application/json',
    })
  })

  app.get('/whatsapp/:id/newsletter-messages', async (c) => {
    const id = c.req.param('id')
    const token = getToken(c)!
    const jid = c.req.query('jid') || ''
    if (!jid) return c.json({ error: 'jid required' }, 400)
    const res = await backend.proxy('GET', `/api/v1/accounts/${id}/newsletters/${encodeURIComponent(jid)}/messages`, token, {
      query: `count=${c.req.query('count') || '50'}&before=${c.req.query('before') || ''}`,
    })
    return c.body(Buffer.from(await res.arrayBuffer()), res.status as any, { 'Content-Type': 'application/json' })
  })
}
