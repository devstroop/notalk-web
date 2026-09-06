import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash, setFlash } from '../../middleware/auth.js'
import { backend } from '../../lib/api.js'
import { renderPage } from '../../lib/render/index.js'

export function registerAccountsDetailRoutes(app: Hono): void {
  app.get('/accounts/:id', async (c) => {
    const id = c.req.param('id')
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    const { status, data } = await backend.json('GET', `/api/v1/accounts/${id}`, token)
    if (status >= 400) {
      setFlash(c, 'error', 'Account not found.')
      return c.redirect('/accounts', 303)
    }
    const wh = await backend.json('GET', `/api/v1/accounts/${id}/webhook`, token)
    const px = await backend.json('GET', `/api/v1/accounts/${id}/proxy`, token)
    let whJSON = 'null'
    if (wh.status === 200 && (wh.data as any)?.url) {
      const d: any = wh.data
      whJSON = JSON.stringify({ url: d.url, events: d.events ?? [], enabled: d.enabled !== false })
    }
    let pxJSON = 'null'
    if (px.status === 200 && (px.data as any)?.host) pxJSON = JSON.stringify(px.data)

    return c.html(
      renderPage('account-detail', {
        Title: `${(data as any).account_name ?? 'Account'} — NoTalk`,
        Page: 'account-detail',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {
          Account: {
            ID: (data as any).id,
            AccountName: (data as any).account_name ?? (data as any).accountName ?? '',
            PhoneNumber: (data as any).phone_number ?? (data as any).phoneNumber ?? '',
            Connected: (data as any).status?.connected ?? (data as any).connected ?? (data as any).authorized ?? (data as any).Authorized ?? false,
          },
          WebhookJSON: whJSON,
          ProxyJSON: pxJSON,
        },
      })
    )
  })
}
