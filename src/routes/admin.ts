import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash, setFlash, hasPerm } from '../middleware/auth.js'
import { backend } from '../lib/api.js'
import { renderPage } from '../lib/render/index.js'

function requireAdmin(c: any): boolean {
  const id = getIdentity(c)
  return !!id && hasPerm(id, '*')
}

export function registerAdminRoutes(app: Hono): void {
  // Users
  app.get('/admin/users', async (c) => {
    if (!requireAdmin(c)) return c.text('forbidden', 403)
    const token = getToken(c)!
    const flash = getFlash(c)
    const { data: users } = await backend.json('GET', '/api/v1/users', token)
    const { data: roles } = await backend.json('GET', '/api/v1/roles', token)
    return c.html(
      renderPage('users', {
        Title: 'Users — NoTalk',
        Page: 'users',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Users: Array.isArray(users) ? users : (users?.users ?? []), Roles: Array.isArray(roles) ? roles : (roles?.roles ?? []) },
      })
    )
  })

  // Roles
  app.get('/admin/roles', async (c) => {
    if (!requireAdmin(c)) return c.text('forbidden', 403)
    const token = getToken(c)!
    const flash = getFlash(c)
    const { data: roles } = await backend.json('GET', '/api/v1/roles', token)
    return c.html(
      renderPage('roles', {
        Title: 'Roles — NoTalk',
        Page: 'roles',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Roles: Array.isArray(roles) ? roles : (roles?.roles ?? []) },
      })
    )
  })

  function splitPerms(raw: string): string[] {
    return raw.replace(/\n/g, ',').split(',').map((s) => s.trim()).filter(Boolean)
  }

  app.post('/admin/roles', async (c) => {
    if (!requireAdmin(c)) return c.text('forbidden', 403)
    const token = getToken(c)!
    const form = await c.req.parseBody()
    const name = String(form['name'] ?? '').trim()
    const description = String(form['description'] ?? '').trim()
    const permsRaw = String(form['permissions'] ?? '').trim()
    if (!name) {
      setFlash(c, 'error', 'Role name is required.')
      return c.redirect('/admin/roles', 303)
    }
    const permissions = splitPerms(permsRaw)
    const { status, data } = await backend.json('POST', '/api/v1/roles', token, { name, description, permissions })
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to create role')
      return c.redirect('/admin/roles', 303)
    }
    setFlash(c, 'success', 'Role created.')
    return c.redirect('/admin/roles', 303)
  })

  app.post('/admin/roles/:id/update', async (c) => {
    if (!requireAdmin(c)) return c.text('forbidden', 403)
    const token = getToken(c)!
    const id = c.req.param('id')
    const form = await c.req.parseBody()
    const name = String(form['name'] ?? '').trim()
    const description = String(form['description'] ?? '').trim()
    const permsRaw = String(form['permissions'] ?? '').trim()
    const permissions = splitPerms(permsRaw)
    const payload: any = {}
    if (name) payload.name = name
    payload.description = description
    payload.permissions = permissions
    const { status, data } = await backend.json('PATCH', `/api/v1/roles/${id}`, token, payload)
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to update role')
      return c.redirect('/admin/roles', 303)
    }
    setFlash(c, 'success', 'Role updated.')
    return c.redirect('/admin/roles', 303)
  })

  app.post('/admin/roles/:id/delete', async (c) => {
    if (!requireAdmin(c)) return c.text('forbidden', 403)
    const token = getToken(c)!
    const id = c.req.param('id')
    const { status, data } = await backend.json('DELETE', `/api/v1/roles/${id}`, token)
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to delete role')
      return c.redirect('/admin/roles', 303)
    }
    setFlash(c, 'success', 'Role deleted.')
    return c.redirect('/admin/roles', 303)
  })

  // API Keys
  app.get('/api-keys', async (c) => {
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    const { data } = await backend.json('GET', '/api/v1/api-keys', token)
    // Load accounts for the create dropdown (filter by permission like old web)
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
      renderPage('api-keys', {
        Title: 'API Keys — NoTalk',
        Page: 'api-keys',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Keys: Array.isArray(data) ? data : (data?.keys ?? data?.api_keys ?? []), Accounts: accounts },
      })
    )
  })

  // API Keys — Create (form via fetch, returns JSON)
  app.post('/api-keys', async (c) => {
    const token = getToken(c)!
    const form = await c.req.parseBody()
    const name = String(form['name'] ?? '').trim()
    const account_id = String(form['account_id'] ?? '').trim()
    const expires_at_raw = String(form['expires_at'] ?? '').trim()
    if (!name) return c.json({ error: 'name is required' }, 400)
    let expires_at: string | undefined
    if (expires_at_raw) {
      const d = new Date(expires_at_raw)
      if (isNaN(d.getTime())) return c.json({ error: 'invalid expiry date' }, 400)
      if (d.getTime() < Date.now()) return c.json({ error: 'expiry must be in the future' }, 400)
      expires_at = d.toISOString()
    }
    const payload: any = { name }
    if (account_id) payload.account_id = account_id
    if (expires_at) payload.expires_at = expires_at
    const { status, data } = await backend.json('POST', '/api/v1/api-keys', token, payload)
    if (status >= 400) return c.json({ error: (data as any)?.error || 'failed to create key' }, status as any)
    return c.json(data, 201 as any)
  })

  app.post('/api-keys/:id/delete', async (c) => {
    const token = getToken(c)!
    const id = c.req.param('id')
    const { status, data } = await backend.json('DELETE', `/api/v1/api-keys/${id}`, token)
    if (status >= 400) return c.json({ error: (data as any)?.error || 'failed to delete' }, status as any)
    return c.json({ status: 'deleted' })
  })

  // MCP
  app.get('/mcp-server', async (c) => {
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    const { data } = await backend.json('GET', '/api/v1/mcp', token)
    return c.html(
      renderPage('mcp', {
        Title: 'MCP Server — NoTalk',
        Page: 'mcp',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: data ?? {},
      })
    )
  })

  // Settings (general)
  app.get('/settings', async (c) => {
    const identity = getIdentity(c)!
    const flash = getFlash(c)
    const token = getToken(c)!
    let user: any = null
    let appName = ''
    let appTagline = ''
    let currency = 'USD'
    let timezone = 'UTC'
    let billingEnabled = false
    // Try to load current user if not system
    const uid = (identity as any)?.userId ?? (identity as any)?.userID ?? (identity as any)?.sub
    if (identity && uid && uid !== 'system' && uid !== 'api-key') {
      try {
        const { data: u } = await backend.json('GET', `/api/v1/users/${uid}`, token)
        user = u
      } catch {}
      // Fallback to /api/v1/auth/me if available
      if (!user) {
        try {
          const { data: me } = await backend.json('GET', '/api/v1/auth/me', token)
          user = me
        } catch {}
      }
    }
    // Try to load settings if backend supports it
    try {
      const { data: s } = await backend.json('GET', '/api/v1/settings', token)
      if (s) {
        currency = s.currency ?? s.Currency ?? currency
        timezone = s.timezone ?? s.Timezone ?? timezone
        appName = s.app_name ?? s.appName ?? s.AppName ?? appName
        appTagline = s.app_tagline ?? s.appTagline ?? s.AppTagline ?? appTagline
        billingEnabled = !!(s.billing_enabled ?? s.BillingEnabled)
      }
    } catch {}
    // Also try individual settings keys
    try {
      const { data: cur } = await backend.json('GET', '/api/v1/settings/localization.currency', token).catch(() => ({ data: null } as any))
      if (cur) currency = String(cur)
    } catch {}
    return c.html(
      renderPage('settings', {
        Title: 'Settings — NoTalk',
        Page: 'settings',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {
          User: user,
          Currency: currency,
          Timezone: timezone,
          AppName: appName,
          AppTagline: appTagline,
          BillingEnabled: billingEnabled,
        },
      })
    )
  })

  // Autopilot per-account
  app.get('/accounts/:id/autopilot', async (c) => {
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const id = c.req.param('id')
    const flash = getFlash(c)
    const { data } = await backend.json('GET', `/api/v1/accounts/${id}`, token)
    return c.html(
      renderPage('autopilot', {
        Title: `Autopilot — ${(data as any)?.account_name ?? 'Account'} — NoTalk`,
        Page: 'autopilot',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Account: data },
      })
    )
  })
}
