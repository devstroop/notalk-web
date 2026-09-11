import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash, setFlash } from '../../middleware/auth.js'
import { backend } from '../../lib/api.js'
import { renderPage } from '../../lib/render/index.js'

export function registerChannelsDetailRoutes(app: Hono): void {
  app.get('/channels/:id', async (c) => {
    const id = c.req.param('id')
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    // Try channels first, fallback to accounts
    let status = 500
    let data: any = null
    try {
      const res = await backend.json('GET', `/api/v1/channels/${id}`, token)
      status = res.status
      data = res.data
    } catch {}
    if (status >= 400 || !data) {
      const res2 = await backend.json('GET', `/api/v1/accounts/${id}`, token)
      status = res2.status
      data = res2.data
      if (status >= 400) {
        setFlash(c, 'error', 'Channel not found.')
        return c.redirect('/channels', 303)
      }
    }
    // Fetch webhook/proxy only for whatsapp type
    const type = data?.type ?? data?.Type ?? 'whatsapp'
    let whJSON = 'null'
    let pxJSON = 'null'
    if (type === 'whatsapp' || !type) {
      const wh = await backend.json('GET', `/api/v1/accounts/${id}/webhook`, token)
      if (wh.status === 200 && (wh.data as any)?.url) {
        const d: any = wh.data
        whJSON = JSON.stringify({ url: d.url, events: d.events ?? [], enabled: d.enabled !== false })
      }
      const px = await backend.json('GET', `/api/v1/accounts/${id}/proxy`, token)
      if (px.status === 200 && (px.data as any)?.host) pxJSON = JSON.stringify(px.data)
    }
    const name = data.account_name ?? data.name ?? data.AccountName ?? ''
    const identifier = data.identifier ?? data.phone_number ?? data.PhoneNumber ?? ''
    const phone = data.phone_number ?? data.identifier ?? ''
    return c.html(
      renderPage('channel-detail', {
        Title: `${name || 'Channel'} — NoTalk`,
        Page: 'channel-detail',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {
          Channel: {
            ID: data.id ?? data.ID ?? id,
            Name: name,
            AccountName: name,
            Type: type,
            Identifier: identifier,
            PhoneNumber: phone,
            Connected: data.status?.connected ?? data.connected ?? data.authorized ?? data.Authorized ?? false,
          },
          Account: {
            ID: data.id ?? data.ID ?? id,
            AccountName: name,
            PhoneNumber: phone,
            Connected: data.status?.connected ?? data.connected ?? data.authorized ?? false,
          },
          WebhookJSON: whJSON,
          ProxyJSON: pxJSON,
        },
      })
    )
  })
}
