import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash, setFlash } from '../../middleware/auth.js'
import { backend } from '../../lib/api.js'
import { renderPage } from '../../lib/render/index.js'

export function registerAccountsListRoutes(app: Hono): void {
  app.get('/accounts', async (c) => {
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    const { data } = await backend.json('GET', '/api/v1/accounts', token)
    const accounts: any[] = Array.isArray(data) ? data : (data?.accounts ?? [])
    const rows = accounts.map((a: any) => ({
      ID: a.id,
      AccountName: a.account_name ?? a.accountName ?? '',
      PhoneNumber: a.phone_number ?? a.phoneNumber ?? '',
      Connected: a.status?.connected ?? a.connected ?? a.authorized ?? a.Authorized ?? false,
      CreatedAt: a.created_at ?? a.createdAt ?? '',
    }))
    return c.html(
      renderPage('accounts', {
        Title: 'Accounts — NoTalk',
        Page: 'accounts',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Accounts: rows },
      })
    )
  })

  app.post('/accounts', async (c) => {
    const token = getToken(c)!
    const form = await c.req.parseBody()
    const account_name = String(form['account_name'] || '').trim()
    const phone_number = String(form['phone_number'] || '').trim()
    if (!account_name || !phone_number) {
      setFlash(c, 'error', 'Account name and phone number are required.')
      return c.redirect('/accounts', 303)
    }
    const { status, data } = await backend.json('POST', '/api/v1/accounts', token, { account_name, phone_number })
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to create account')
      return c.redirect('/accounts', 303)
    }
    if (c.req.header('HX-Request') === 'true') {
      c.header('HX-Redirect', '/accounts')
      return c.text('', 200)
    }
    setFlash(c, 'success', 'Account created successfully.')
    return c.redirect('/accounts', 303)
  })
}
