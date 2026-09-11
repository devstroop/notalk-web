import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash, setFlash } from '../../middleware/auth.js'
import { backend } from '../../lib/api.js'
import { renderPage } from '../../lib/render/index.js'

export function registerAccountsListRoutes(app: Hono): void {
  // Deprecated alias — redirect to agnostic /channels (kept for backward compat, 302)
  app.get('/accounts', async (c) => {
    const url = new URL(c.req.url)
    const qs = url.search
    return c.redirect(`/channels${qs}`, 302)
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
