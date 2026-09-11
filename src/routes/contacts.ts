import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash, setFlash } from '../middleware/auth.js'
import { backend } from '../lib/api.js'
import { renderPage } from '../lib/render/index.js'

export function registerContactsRoutes(app: Hono): void {
  // List contacts page
  app.get('/contacts', async (c) => {
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    const url = new URL(c.req.url)
    const q = url.searchParams.get('q') || ''
    const account_id = url.searchParams.get('account_id') || ''

    let contacts: any[] = []
    let total = 0
    try {
      const query: Record<string, string> = {}
      if (q) query.q = q
      if (account_id) query.account_id = account_id
      query.limit = '100'
      const { data } = await backend.json('GET', '/api/v1/contacts', token, undefined, query)
      contacts = Array.isArray(data) ? data : (data?.contacts ?? [])
      total = (data?.total ?? contacts.length)
    } catch {}

    let accounts: any[] = []
    try {
      const { data: accData } = await backend.json('GET', '/api/v1/accounts', token)
      const list: any[] = Array.isArray(accData) ? accData : (accData?.accounts ?? [])
      accounts = list.map((a: any) => ({
        ID: a.id,
        AccountName: a.account_name ?? a.accountName ?? '',
        PhoneNumber: a.phone_number ?? a.phoneNumber ?? '',
      }))
    } catch {}

    return c.html(
      renderPage('contacts', {
        Title: 'Contacts — NoTalk',
        Page: 'contacts',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Contacts: contacts, Accounts: accounts, Q: q, AccountFilter: account_id, Total: total },
      })
    )
  })

  // Create contact
  app.post('/contacts', async (c) => {
    const token = getToken(c)!
    const form = await c.req.parseBody()
    const phone = String(form['phone'] ?? '').trim()
    const name = String(form['name'] ?? '').trim()
    const email = String(form['email'] ?? '').trim()
    const notes = String(form['notes'] ?? '').trim()
    const account_id = String(form['account_id'] ?? '').trim()

    if (!phone || !name) {
      setFlash(c, 'error', 'Phone and name are required.')
      return c.redirect('/contacts', 303)
    }

    const payload: any = { phone, name }
    if (email) payload.email = email
    if (notes) payload.notes = notes
    if (account_id) payload.account_id = account_id

    const { status, data } = await backend.json('POST', '/api/v1/contacts', token, payload)
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to create contact')
      return c.redirect('/contacts', 303)
    }
    setFlash(c, 'success', 'Contact created.')
    return c.redirect('/contacts', 303)
  })

  // Update contact
  app.post('/contacts/:id/update', async (c) => {
    const token = getToken(c)!
    const id = c.req.param('id')
    const form = await c.req.parseBody()
    const phone = String(form['phone'] ?? '').trim()
    const name = String(form['name'] ?? '').trim()
    const email = String(form['email'] ?? '').trim()
    const notes = String(form['notes'] ?? '').trim()
    const account_id = String(form['account_id'] ?? '')

    const payload: any = {}
    if (phone) payload.phone = phone
    if (name) payload.name = name
    // Always send email/notes to allow clearing
    payload.email = email
    payload.notes = notes
    // account_id: empty string means clear, undefined means keep
    if (form['account_id'] !== undefined) {
      payload.account_id = account_id.trim()
    }

    const { status, data } = await backend.json('PATCH', `/api/v1/contacts/${id}`, token, payload)
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to update contact')
      return c.redirect('/contacts', 303)
    }
    setFlash(c, 'success', 'Contact updated.')
    return c.redirect('/contacts', 303)
  })

  // Delete contact
  app.post('/contacts/:id/delete', async (c) => {
    const token = getToken(c)!
    const id = c.req.param('id')
    const { status, data } = await backend.json('DELETE', `/api/v1/contacts/${id}`, token)
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to delete contact')
      return c.redirect('/contacts', 303)
    }
    setFlash(c, 'success', 'Contact deleted.')
    return c.redirect('/contacts', 303)
  })

  // Import CSV
  app.post('/contacts/import', async (c) => {
    const token = getToken(c)!
    const body = await c.req.arrayBuffer()
    const ct = c.req.header('content-type') || 'multipart/form-data'
    const res = await backend.proxy('POST', '/api/v1/contacts/import', token, {
      headers: { 'Content-Type': ct },
      body: Buffer.from(body),
    })
    const text = await res.text()
    let data: any = null
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    if (res.status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Import failed')
      return c.redirect('/contacts', 303)
    }
    const accepted = data?.accepted ?? 0
    const skipped = data?.skipped ?? 0
    setFlash(c, 'success', `Imported ${accepted} contact(s), skipped ${skipped}.`)
    return c.redirect('/contacts', 303)
  })
}
