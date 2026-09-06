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
    // Only trigger session-tab refresh when becoming connected — this replaces the previous
    // `every 3s` polling of the whole session tab which caused QR to flash "Loading QR code…"
    // on every poll. Now QR loads once (hx-trigger="load" on #qr-area) and stays; the 2s
    // badge poll will trigger this only when connected, so the tab flips to "Session Active"
    // without flashing while disconnected.
    if (connected) c.header('HX-Trigger', 'sessionConnected')
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
        <button @click="mode = 'qr'" :class="mode === 'qr' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'" class="px-4 py-2 text-sm font-medium rounded-md transition-all">QR Code</button>
        <button @click="mode = 'phone'" :class="mode === 'phone' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'" class="px-4 py-2 text-sm font-medium rounded-md transition-all">Phone Pairing</button>
      </div></div>
      <div x-show="mode === 'qr'"><div id="qr-area" hx-get="/accounts/${id}/qr" hx-trigger="load" hx-swap="innerHTML" hx-indicator="#qr-area"><div class="flex flex-col items-center justify-center py-10 space-y-3"><div class="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center animate-pulse"><svg class="w-8 h-8 text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg></div><p class="text-sm font-medium text-gray-600">Generating QR code…</p><p class="text-xs text-gray-400">This takes a second</p></div></div></div>
      <div x-show="mode === 'phone'"><div id="pair-area" class="text-center py-6"><button hx-post="/accounts/${id}/pair" hx-target="#pair-area" hx-swap="innerHTML" hx-indicator="#pair-area" class="px-5 py-2.5 text-white bg-brand-500 hover:bg-brand-600 rounded-xl font-medium shadow-sm transition-all inline-flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01-0 0.19 2 2 0 012-2.18h3a2 2 0 012 1.72 12.05 12.05 0 00.57 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l4.27-1.09a2 2 0 012.11.45 12.03 12.03 0 002.81.57A2 2 0 0122 16.92z"/></svg>Generate Pairing Code</button></div></div>
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
        `<div class="flex flex-col items-center py-8 space-y-4"><div class="w-12 h-12 rounded-full bg-red-50 border border-red-100 flex items-center justify-center"><svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg></div><div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 max-w-sm text-center">${j.error ?? 'Failed to generate QR'}</div><p class="text-xs text-gray-400">Please try again — QR may have expired</p><button hx-get="/accounts/${id}/qr" hx-target="#qr-area" hx-swap="innerHTML" hx-indicator="#qr-area" hx-disabled-elt="this" class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-full shadow-sm transition-all disabled:opacity-50 htmx-indicator:opacity-50"><svg class="w-3.5 h-3.5 htmx-indicator-hidden" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 17.25V21a2.652 2.652 0 01-2.09.99H6a2 2 0 01-2-2V6a2 2 0 012-2h7.25"/></svg><svg class="w-3.5 h-3.5 animate-spin hidden htmx-indicator:block" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Try again</button></div>`
      )
    }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('image')) {
      const buf = Buffer.from(await res.arrayBuffer())
      const b64 = buf.toString('base64')
      c.header('Content-Type', 'text/html; charset=utf-8')
      return c.html(
        `<div class="flex flex-col items-center py-2 space-y-3" x-data="{ expires: 30, refreshing: false }" x-init="let t=setInterval(() => { if(expires>0) expires--; else clearInterval(t) }, 1000)" hx-on::before-request="refreshing = true" hx-on::after-swap="refreshing = false">
          <style>#qr-area.htmx-request .qr-img{opacity:.45}#qr-area.htmx-request .qr-overlay{opacity:1;pointer-events:auto}.qr-overlay{opacity:0;pointer-events:none;transition:opacity .2s}</style>
          <div class="relative group">
            <div class="absolute -inset-1 bg-gradient-to-r from-brand-500 to-violet-500 rounded-[1.1rem] blur opacity-20 group-hover:opacity-30 transition"></div>
            <div class="relative bg-white p-3 rounded-2xl shadow-xl border border-gray-200">
              <img src="data:image/png;base64,${b64}" class="qr-img w-64 h-64 rounded-xl transition-opacity duration-300" alt="WhatsApp QR Code" />
              <div class="qr-overlay absolute inset-3 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center"><div class="flex flex-col items-center gap-2"><svg class="w-8 h-8 text-brand-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><span class="text-xs font-medium text-gray-600">Refreshing…</span></div></div>
            </div>
          </div>
          <div class="flex flex-col items-center gap-2 w-full max-w-xs">
            <div class="flex items-center gap-2 text-xs w-full">
              <span class="text-gray-500 shrink-0">Expires in</span>
              <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-brand-500 to-violet-500 rounded-full transition-all duration-1000 ease-linear" :style="'width:' + (expires/30*100) + '%' " :class="expires < 10 ? '!from-amber-500 !to-orange-500' : ''"></div>
              </div>
              <span class="font-mono font-bold tabular-nums min-w-[2ch] text-right" :class="expires < 10 ? 'text-amber-600' : 'text-gray-700'" x-text="expires + 's'"></span>
            </div>
            <p x-show="expires === 0" x-transition class="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">QR expired — please refresh</p>
          </div>
          <p class="text-xs text-gray-500 text-center leading-relaxed">Open <span class="font-semibold text-gray-700">WhatsApp</span> → <span class="font-medium">Linked Devices</span> → <span class="inline-flex items-center gap-1 font-medium text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">Link a Device <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></span></p>
          <button hx-get="/accounts/${id}/qr" hx-target="#qr-area" hx-swap="innerHTML" hx-indicator="#qr-area" hx-disabled-elt="this" @click="refreshing = true" class="group inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 rounded-full shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <svg class="w-3.5 h-3.5 transition-transform group-hover:rotate-180 duration-300" :class="refreshing ? 'animate-spin' : ''" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M20.015 4.356V9.348m0 0H15.023m4.992 0l-3.181-3.183a8.25 8.25 0 00-13.803 3.7"/></svg>
            <span x-text="refreshing ? 'Refreshing…' : 'Refresh QR'"></span>
          </button>
        </div>`
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
