import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash, setFlash } from '../../middleware/auth.js'
import { backend } from '../../lib/api.js'
import { renderPage } from '../../lib/render/index.js'

export function registerAccountsChatRoutes(app: Hono): void {
  // Per-account WhatsApp web — dedicated URL, no account picker.
  // Ownership is enforced by the backend (non-owners get >= 400).
  app.get('/accounts/:id/chat', async (c) => {
    const id = c.req.param('id')
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    const { status, data } = await backend.json('GET', `/api/v1/accounts/${id}`, token)
    if (status >= 400) {
      setFlash(c, 'error', 'Account not found.')
      return c.redirect('/accounts', 303)
    }
    const a: any = data
    const account = {
      ID: a.id,
      AccountName: a.account_name ?? '',
      PhoneNumber: a.phone_number ?? '',
      Connected: a.status?.connected ?? a.connected ?? a.authorized ?? false,
    }
    return c.html(
      renderPage('messaging', {
        Title: `${account.AccountName || 'Account'} · WhatsApp Web — NoTalk`,
        Page: 'account-chat',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Account: account },
      })
    )
  })
}
