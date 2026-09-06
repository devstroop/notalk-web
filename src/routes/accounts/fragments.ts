import type { Hono } from 'hono'
import { getToken } from '../../middleware/auth.js'
import { backend } from '../../lib/api.js'

export function registerAccountsFragments(app: Hono): void {
  app.get('/accounts/:id/session-status', async (c) => {
    const id = c.req.param('id')
    const token = getToken(c)!
    const { status, data } = await backend.json('GET', `/api/v1/accounts/${id}/session`, token)
    const d: any = data as any
    const connected = status === 200 && (d?.connected === true || d?.status?.connected === true || d?.authorized === true || d?.Authorized === true || d?.isLoggedIn === true)
    const html = connected
      ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><span class="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>Connected</span>`
      : `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><span class="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>Disconnected</span>`
    c.header('Content-Type', 'text/html; charset=utf-8')
    return c.html(html)
  })

  app.get('/accounts/:id/session-tab', async (c) => {
    const id = c.req.param('id')
    const token = getToken(c)!
    const { status, data } = await backend.json('GET', `/api/v1/accounts/${id}/session`, token)
    const d: any = data as any
    const connected = status === 200 && (d?.connected === true || d?.status?.connected === true || d?.authorized === true || d?.Authorized === true || d?.isLoggedIn === true)
    c.header('Content-Type', 'text/html; charset=utf-8')
    if (connected) {
      return c.html(`<div class="flex flex-col items-center justify-center py-10 space-y-4">
        <div class="w-20 h-20 bg-green-50 rounded-2xl flex items-center justify-center">✓</div>
        <p class="text-lg font-semibold text-green-700">Session Active</p>
        <button hx-post="/accounts/${id}/disconnect" hx-target="#session-content" hx-swap="innerHTML" hx-confirm="Disconnect this session?" class="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg">Disconnect</button>
      </div>`)
    }
    return c.html(`<div x-data="{ mode: 'qr' }" class="space-y-5">
      <div class="flex items-center justify-center"><div class="flex bg-gray-100 rounded-lg p-0.5">
        <button @click="mode = 'qr'" :class="mode === 'qr' ? 'bg-white shadow-sm' : 'text-gray-500'" class="px-4 py-2 text-sm">QR Code</button>
        <button @click="mode = 'phone'" :class="mode === 'phone' ? 'bg-white shadow-sm' : 'text-gray-500'" class="px-4 py-2 text-sm">Phone Pairing</button>
      </div></div>
      <div x-show="mode === 'qr'"><div id="qr-area" hx-get="/accounts/${id}/qr" hx-trigger="load" hx-swap="innerHTML"><p class="text-sm text-gray-400 text-center py-12">Loading QR code…</p></div></div>
      <div x-show="mode === 'phone'"><div id="pair-area" class="text-center py-6"><button hx-post="/accounts/${id}/pair" hx-target="#pair-area" hx-swap="innerHTML" class="px-5 py-2.5 text-gray-900 bg-brand-500 rounded-lg">Generate Pairing Code</button></div></div>
    </div>`)
  })

  app.get('/accounts/:id/qr', async (c) => {
    const id = c.req.param('id')
    const token = getToken(c)!
    const res = await backend.proxy('GET', `/api/v1/accounts/${id}/session/qr`, token)
    if (!res.ok) {
      const j: any = await res.json().catch(() => ({ error: 'Failed to fetch QR' }))
      c.header('Content-Type', 'text/html; charset=utf-8')
      return c.html(
        `<div class="flex flex-col items-center py-8"><div class="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3">${j.error ?? 'Failed'}</div><button hx-get="/accounts/${id}/qr" hx-target="#qr-area" hx-swap="innerHTML" class="text-xs text-brand-800">↻ Try again</button></div>`
      )
    }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('image')) {
      const buf = Buffer.from(await res.arrayBuffer())
      const b64 = buf.toString('base64')
      c.header('Content-Type', 'text/html; charset=utf-8')
      return c.html(
        `<div class="flex flex-col items-center py-4"><img src="data:image/png;base64,${b64}" class="w-64 h-64 rounded-xl border" /><p class="text-xs text-gray-500 mt-3">Open WhatsApp → Linked Devices → Link a Device</p><button hx-get="/accounts/${id}/qr" hx-target="#qr-area" hx-swap="innerHTML" class="mt-3 text-xs text-brand-800">↻ Refresh QR</button></div>`
      )
    }
    return c.html(await res.text())
  })

  app.post('/accounts/:id/pair', async (c) => {
    const id = c.req.param('id')
    const token = getToken(c)!
    const { data: acc } = await backend.json('GET', `/api/v1/accounts/${id}`, token)
    const phone = (acc as any)?.phone_number ?? (acc as any)?.phoneNumber ?? ''
    const res = await backend.proxy('POST', `/api/v1/accounts/${id}/session/pair`, token, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    c.header('Content-Type', 'text/html; charset=utf-8')
    if (!res.ok) {
      const j: any = await res.json().catch(() => ({ error: 'Pairing failed' }))
      return c.html(
        `<div class="max-w-sm mx-auto text-center py-6"><div class="p-3 bg-red-50 border rounded-lg text-sm text-red-700">${j.error}</div><button hx-post="/accounts/${id}/pair" hx-target="#pair-area" hx-swap="innerHTML" class="text-xs text-brand-800">Try again</button></div>`
      )
    }
    const j: any = await res.json().catch(() => ({}))
    const code = j.linking_code ?? j.code ?? (await res.text())
    return c.html(
      `<div class="max-w-sm mx-auto text-center space-y-4 py-6"><div class="p-5 bg-brand-50 border rounded-xl"><p class="text-xs text-gray-500 mb-2 uppercase">Your Pairing Code</p><p class="text-4xl font-mono font-bold text-brand-800 tracking-[0.3em]">${code}</p></div><p class="text-xs text-gray-500">Open WhatsApp → Linked Devices → Link with Phone Number</p><button hx-post="/accounts/${id}/pair" hx-target="#pair-area" hx-swap="innerHTML" class="text-xs text-brand-800">↻ Generate new code</button></div>`
    )
  })

  app.post('/accounts/:id/disconnect', async (c) => {
    const id = c.req.param('id')
    const token = getToken(c)!
    await backend.json('DELETE', `/api/v1/accounts/${id}/session`, token)
    c.header('Content-Type', 'text/html; charset=utf-8')
    return c.html(`<div x-data="{ mode: 'qr' }" class="space-y-5"><div id="qr-area" hx-get="/accounts/${id}/qr" hx-trigger="load" hx-swap="innerHTML">Loading…</div></div>`)
  })
}
