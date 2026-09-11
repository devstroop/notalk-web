import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash, setFlash } from '../middleware/auth.js'
import { backend } from '../lib/api.js'
import { renderPage } from '../lib/render/index.js'

export function registerContactsRoutes(app: Hono): void {
  // List contacts page — only id is mandatory; phone/email/name all optional
  app.get('/contacts', async (c) => {
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    const url = new URL(c.req.url)
    const q = url.searchParams.get('q') || ''

    let contacts: any[] = []
    let total = 0
    try {
      const query: Record<string, string> = {}
      if (q) query.q = q
      query.limit = '100'
      const { data } = await backend.json('GET', '/api/v1/contacts', token, undefined, query)
      contacts = Array.isArray(data) ? data : (data?.contacts ?? [])
      total = (data?.total ?? contacts.length)
    } catch {}

    return c.html(
      renderPage('contacts', {
        Title: 'Contacts — NoTalk',
        Page: 'contacts',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Contacts: contacts, Q: q, Total: total },
      })
    )
  })

  // Create contact — lean: only id is mandatory (hidden); phone/email optional
  app.post('/contacts', async (c) => {
    const token = getToken(c)!
    const form = await c.req.parseBody()
    const get = (k: string) => String(form[k] ?? '').trim()
    const payload: any = {}
    const name = get('name')
    const phone = get('phone')
    const email = get('email')
    const company = get('company')
    const notes = get('notes')
    const tagsRaw = get('tags')
    if (name) payload.name = name
    if (phone) payload.phone = phone
    if (email) payload.email = email
    if (company) payload.company = company
    if (notes) payload.notes = notes
    if (tagsRaw) payload.tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean)
    if (form['starred'] !== undefined) payload.starred = String(form['starred']) === 'on' || String(form['starred']) === 'true'

    const { status, data } = await backend.json('POST', '/api/v1/contacts', token, payload)
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to create contact')
      return c.redirect('/contacts', 303)
    }
    setFlash(c, 'success', 'Contact created.')
    return c.redirect('/contacts', 303)
  })

  // Update contact — lean: allow clearing by sending empty string
  app.post('/contacts/:id/update', async (c) => {
    const token = getToken(c)!
    const id = c.req.param('id')
    const form = await c.req.parseBody()
    const payload: any = {}
    for (const f of ['name','phone','email','company','notes']) {
      if (form[f] !== undefined) payload[f] = String(form[f] ?? '').trim()
    }
    if (form['tags'] !== undefined) {
      const raw = String(form['tags'] ?? '').trim()
      payload.tags = raw ? raw.split(',').map((s:string) => s.trim()).filter(Boolean) : []
    }
    if (form['starred'] !== undefined) {
      payload.starred = String(form['starred']) === 'on' || String(form['starred']) === 'true'
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
