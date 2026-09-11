import type { Hono } from 'hono'
import { getToken } from '../../middleware/auth.js'
import { backend } from '../../lib/api.js'

// Reuse account fragments but gate whatsapp-only operations by channel type
export function registerChannelsFragments(app: Hono): void {
  app.get('/channels/:id/session-status', async (c) => {
    const id = c.req.param('id') ?? ''
    const token = getToken(c)!
    // Check channel type first
    try {
      const { data } = await backend.json('GET', `/api/v1/channels/${id}`, token)
      const type = (data as any)?.type ?? 'whatsapp'
      if (type !== 'whatsapp') {
        // Non-whatsapp channels don't have WhatsApp session
        return c.html(`<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">${type} channel</span>`)
      }
    } catch {}
    const { data } = await backend.json('GET', `/api/v1/accounts/${id}/session`, token)
    const connected = (data as any)?.connected ?? (data as any)?.status?.connected ?? (data as any)?.authorized ?? false
    if (connected) {
      c.header('HX-Trigger', 'sessionConnected')
      return c.html(`<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Connected</span>`)
    }
    return c.html(`<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Disconnected</span>`)
  })

  app.get('/channels/:id/session-tab', async (c) => {
    const id = c.req.param('id') ?? ''
    const token = getToken(c)!
    try {
      const { data } = await backend.json('GET', `/api/v1/channels/${id}`, token)
      const type = (data as any)?.type ?? 'whatsapp'
      if (type !== 'whatsapp') {
        return c.html(`<div class="p-6 text-center"><p class="text-sm text-gray-500">${type} channel does not use WhatsApp pairing. Configure via channel settings.</p></div>`)
      }
    } catch {}
    // Fallback to accounts session-tab logic (proxy to backend)
    const { data } = await backend.json('GET', `/api/v1/accounts/${id}/session`, token)
    const connected = (data as any)?.connected ?? (data as any)?.authorized ?? false
    if (connected) {
      return c.html(`<div class="p-6 text-center"><p class="text-sm text-green-700 font-medium">Session Active</p><form method="POST" action="/channels/${id}/disconnect" class="mt-3"><button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Disconnect</button></form></div>`)
    }
    return c.html(`<div class="p-6 space-y-4" x-data="{mode:'qr'}"><div class="flex gap-2"><button @click="mode='qr'" :class="mode==='qr' ? 'bg-gray-900 text-white' : 'bg-gray-100'" class="px-3 py-1.5 text-xs rounded-lg">QR</button><button @click="mode='phone'" :class="mode==='phone' ? 'bg-gray-900 text-white' : 'bg-gray-100'" class="px-3 py-1.5 text-xs rounded-lg">Phone</button></div><div x-show="mode==='qr'" hx-get="/channels/${id}/qr" hx-trigger="load" class="border rounded-lg p-4 text-center text-sm text-gray-500">Loading QR…</div><div x-show="mode==='phone'" class="space-y-2"><form method="POST" action="/channels/${id}/pair"><button type="submit" class="w-full px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600">Generate Pairing Code</button></form></div></div>`)
  })

  app.get('/channels/:id/qr', async (c) => {
    const id = c.req.param('id') ?? ''
    const token = getToken(c)!
    const res = await backend.proxy('GET', `/api/v1/accounts/${id}/session/qr`, token)
    if (!res.ok) return c.html(`<div class="text-sm text-red-500">Failed to load QR</div>`, 500 as any)
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('image')) {
      const buf = Buffer.from(await res.arrayBuffer())
      const b64 = buf.toString('base64')
      return c.html(`<img src="data:image/png;base64,${b64}" class="mx-auto rounded-lg shadow" />`)
    }
    const txt = await res.text()
    return c.html(`<div class="text-sm text-gray-700">${txt}</div>`)
  })

  app.post('/channels/:id/pair', async (c) => {
    const id = c.req.param('id') ?? ''
    const token = getToken(c)!
    const acc = await backend.json('GET', `/api/v1/channels/${id}`, token)
    const phone = (acc.data as any)?.phone_number ?? (acc.data as any)?.identifier ?? ''
    const res = await backend.proxy('POST', `/api/v1/accounts/${id}/session/pair`, token, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) as any })
    const txt = await res.text()
    let code = txt
    try { const j = JSON.parse(txt); code = j.linking_code || j.code || txt } catch {}
    return c.html(`<div class="text-center"><p class="text-2xl font-mono tracking-widest">${code}</p><p class="text-xs text-gray-500 mt-2">Enter this code in WhatsApp → Linked devices → Link with phone number</p></div>`)
  })

  app.post('/channels/:id/disconnect', async (c) => {
    const id = c.req.param('id') ?? ''
    const token = getToken(c)!
    await backend.proxy('DELETE', `/api/v1/accounts/${id}/session`, token)
    c.header('HX-Redirect', `/channels/${id}`)
    return c.text('', 200)
  })
}
