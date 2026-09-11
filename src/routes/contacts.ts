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

  // Create contact — only id is mandatory (hidden); all else optional, standard fields
  app.post('/contacts', async (c) => {
    const token = getToken(c)!
    const form = await c.req.parseBody()
    const get = (k: string) => String(form[k] ?? '').trim()
    const payload: any = {}
    // Standard name fields — map to model; name is display_name
    const name = get('name')
    const given = get('given_name')
    const family = get('family_name')
    const middle = get('middle_name')
    const prefix = get('name_prefix')
    const suffix = get('name_suffix')
    const nickname = get('nickname')
    if (name) payload.name = name
    else if (given || family) payload.name = [given, family].filter(Boolean).join(' ')
    if (given) payload.given_name = given
    if (family) payload.family_name = family
    if (middle) payload.middle_name = middle
    if (prefix) payload.name_prefix = prefix
    if (suffix) payload.name_suffix = suffix
    if (nickname) payload.nickname = nickname
    // Organization
    const company = get('company'), dept = get('department'), title = get('job_title')
    if (company) payload.company = company
    if (dept) payload.department = dept
    if (title) payload.job_title = title
    // Contact points — optional
    const phone = get('phone'), email = get('email')
    if (phone) payload.phone = phone
    if (email) payload.email = email
    // Birthday, website, photo
    const birthday = get('birthday'), website = get('website'), photo = get('photo_url')
    if (birthday) payload.birthday = birthday
    if (website) payload.website = website
    if (photo) payload.photo_url = photo
    // Notes, tags, starred
    const notes = get('notes'), tagsRaw = get('tags')
    if (notes) payload.notes = notes
    if (tagsRaw) payload.tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean)
    if (form['starred'] !== undefined) payload.starred = String(form['starred']) === 'on' || String(form['starred']) === 'true'
    // allow completely empty contact — will create with id only

    const { status, data } = await backend.json('POST', '/api/v1/contacts', token, payload)
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to create contact')
      return c.redirect('/contacts', 303)
    }
    setFlash(c, 'success', 'Contact created.')
    return c.redirect('/contacts', 303)
  })

  // Update contact — all standard fields optional, allow clearing by sending empty string
  app.post('/contacts/:id/update', async (c) => {
    const token = getToken(c)!
    const id = c.req.param('id')
    const form = await c.req.parseBody()
    const payload: any = {}
    const fields = ['name','display_name','given_name','family_name','middle_name','name_prefix','name_suffix','nickname','company','department','job_title','phone','email','birthday','website','photo_url','notes','source']
    for (const f of fields) {
      if (form[f] !== undefined) payload[f] = String(form[f] ?? '').trim()
    }
    if (form['tags'] !== undefined) {
      const raw = String(form['tags'] ?? '').trim()
      payload.tags = raw ? raw.split(',').map((s:string) => s.trim()).filter(Boolean) : []
    }
    if (form['starred'] !== undefined) {
      // checkbox: on => true, missing => false handled via hidden field
      payload.starred = String(form['starred']) === 'on' || String(form['starred']) === 'true'
    } else if (form['starred_checkbox'] !== undefined) {
      payload.starred = false
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
