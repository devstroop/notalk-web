import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash, setFlash } from '../../middleware/auth.js'
import { backend } from '../../lib/api.js'
import { renderPage } from '../../lib/render/index.js'

export function registerChannelsListRoutes(app: Hono): void {
  app.get('/channels', async (c) => {
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    const typeFilter = c.req.query('type') || ''
    // Fetch from new agnostic endpoint, fallback to accounts for whatsapp
    let raw: any = null
    try {
      const q: Record<string, string> = {}
      if (typeFilter) q.type = typeFilter
      const { data } = await backend.json('GET', '/api/v1/channels', token, undefined, q)
      raw = data
    } catch {
      // Fallback to legacy accounts if channels not yet available
      try {
        const { data } = await backend.json('GET', '/api/v1/accounts', token)
        raw = data
      } catch {}
    }
    const list: any[] = Array.isArray(raw) ? raw : (raw?.channels ?? raw?.accounts ?? raw?.Accounts ?? [])
    const rows = list.map((a: any) => ({
      ID: a.id ?? a.ID ?? '',
      AccountName: a.account_name ?? a.name ?? a.AccountName ?? '',
      PhoneNumber: a.phone_number ?? a.identifier ?? a.PhoneNumber ?? a.Identifier ?? '',
      Type: a.type ?? a.Type ?? 'whatsapp',
      Identifier: a.identifier ?? a.phone_number ?? a.Identifier ?? a.PhoneNumber ?? '',
      Connected: a.status?.connected ?? a.connected ?? a.authorized ?? a.Authorized ?? false,
      CreatedAt: a.created_at ?? a.createdAt ?? '',
    }))
    return c.html(
      renderPage('channels', {
        Title: 'Channels — NoTalk',
        Page: 'channels',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Channels: rows, Accounts: rows, FilterType: typeFilter },
      })
    )
  })

  app.post('/channels', async (c) => {
    const token = getToken(c)!
    const form = await c.req.parseBody()
    const name = String(form['name'] || form['account_name'] || '').trim()
    const type = String(form['type'] || 'whatsapp').trim() || 'whatsapp'
    const identifier = String(form['identifier'] || form['phone_number'] || '').trim()
    const phone_number = String(form['phone_number'] || '').trim()
    // For whatsapp, identifier is phone; for email, identifier is email
    const finalIdentifier = identifier || phone_number
    if (!name || !finalIdentifier) {
      setFlash(c, 'error', 'Name and identifier (phone for WhatsApp, email for Email) are required.')
      return c.redirect('/channels', 303)
    }
    const payload: any = { type, name, identifier: finalIdentifier }
    // Include config for email if provided (e.g., smtp)
    const configRaw = String(form['config'] || '').trim()
    if (configRaw) {
      try { payload.config = JSON.parse(configRaw) } catch { payload.config = configRaw }
    }
    // Backward compat: also send phone_number/account_name
    if (type === 'whatsapp') {
      payload.phone_number = finalIdentifier
      payload.account_name = name
    }
    let status = 500
    let data: any = null
    try {
      const res = await backend.json('POST', '/api/v1/channels', token, payload)
      status = res.status
      data = res.data
    } catch (e: any) {
      // Fallback to legacy accounts endpoint for whatsapp
      if (type === 'whatsapp') {
        const res2 = await backend.json('POST', '/api/v1/accounts', token, { account_name: name, phone_number: finalIdentifier })
        status = res2.status
        data = res2.data
      }
    }
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to create channel')
      return c.redirect('/channels', 303)
    }
    if (c.req.header('HX-Request') === 'true') {
      c.header('HX-Redirect', '/channels')
      return c.text('', 200)
    }
    setFlash(c, 'success', 'Channel created successfully.')
    return c.redirect('/channels', 303)
  })
}
