import type { Hono } from 'hono'
import { getIdentity, getFlash } from '../middleware/auth.js'
import { backend } from '../lib/api.js'
import { renderPage } from '../lib/render/index.js'

export function registerPublicRoutes(app: Hono): void {
  app.get('/', async (c) => {
    const identity = getIdentity(c)
    if (identity) return c.redirect('/dashboard', 302)
    const flash = getFlash(c)
    const { config } = await import('../config.js')
    return c.html(
      renderPage('home', {
        Title: 'NoTalk — Social Engagement Made Simple',
        Page: 'home',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { RegistrationEnabled: config.auth.registrationEnabled },
      })
    )
  })

  app.get('/about', async (c) => {
    const flash = getFlash(c)
    const { config } = await import('../config.js')
    return c.html(
      renderPage('about', {
        Title: 'About — NoTalk',
        Page: 'about',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { RegistrationEnabled: config.auth.registrationEnabled },
      })
    )
  })

  app.get('/terms', async (c) => {
    const flash = getFlash(c)
    const { config } = await import('../config.js')
    return c.html(
      renderPage('terms', {
        Title: 'Terms — NoTalk',
        Page: 'terms',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { RegistrationEnabled: config.auth.registrationEnabled },
      })
    )
  })

  app.get('/privacy', async (c) => {
    const flash = getFlash(c)
    const { config } = await import('../config.js')
    return c.html(
      renderPage('privacy', {
        Title: 'Privacy — NoTalk',
        Page: 'privacy',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { RegistrationEnabled: config.auth.registrationEnabled },
      })
    )
  })

  app.get('/pricing', async (c) => {
    const flash = getFlash(c)
    let plans: any[] = []
    // 1) Try public fetch (works if backend allows anon)
    try {
      const base = (process.env.NOTALK_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '')
      const res = await fetch(`${base}/api/v1/billing/plans`, {
        headers: { Accept: 'application/json' },
      })
      if (res.ok) {
        const j: any = await res.json()
        plans = Array.isArray(j) ? j : (j?.plans ?? j?.data ?? [])
      }
    } catch {}
    // 2) Try with user token
    if (plans.length === 0) {
      try {
        const { getToken } = await import('../middleware/auth.js')
        const token = getToken(c)
        if (token) {
          const { data } = await backend.json('GET', '/api/v1/billing/plans', token)
          plans = Array.isArray(data) ? data : (data?.plans ?? [])
        }
      } catch {}
    }
    // 3) Try with secret (so public pricing works even when backend requires auth)
    if (plans.length === 0) {
      try {
        const { config } = await import('../config.js')
        const secret = config.auth.secretKey
        if (secret && secret !== 'changeme') {
          const base = config.backend.url.replace(/\/$/, '')
          const res = await fetch(`${base}/api/v1/billing/plans`, {
            headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
          })
          if (res.ok) {
            const j: any = await res.json()
            plans = Array.isArray(j) ? j : (j?.plans ?? j?.data ?? [])
          }
        } else if (secret === 'changeme') {
          // In hosted env with default secret, still try — workers have changeme
          const base = config.backend.url.replace(/\/$/, '')
          const res = await fetch(`${base}/api/v1/billing/plans`, {
            headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
          })
          if (res.ok) {
            const j: any = await res.json()
            plans = Array.isArray(j) ? j : (j?.plans ?? j?.data ?? [])
          }
        }
      } catch {}
    }
    // 4) Static fallback when backend is down or still empty — keeps pricing usable offline
    if (plans.length === 0) {
      plans = [
        { ID: 'free', Name: 'Free', Description: 'For personal use', PriceCents: 0, Interval: 'month', Limits: { DailyMessages: 20, MaxAccounts: 1, APIAccess: false, MCPAccess: false, Webhooks: false, Copilot: false, Autopilot: false, DailyMessagesRaw: 20 } },
        { ID: 'pro', Name: 'Professional', Description: 'For creators & teams', PriceCents: 1900, Interval: 'month', Limits: { DailyMessages: 0, MaxAccounts: 5, APIAccess: true, MCPAccess: true, Webhooks: true, Copilot: true, Autopilot: true } },
        { ID: 'business', Name: 'Business', Description: 'Scale with confidence', PriceCents: 4900, Interval: 'month', Limits: { DailyMessages: 0, MaxAccounts: 0, APIAccess: true, MCPAccess: true, Webhooks: true, Copilot: true, Autopilot: true } },
        { ID: 'enterprise', Name: 'Enterprise', Description: 'Custom & dedicated', PriceCents: 0, Interval: 'month', Limits: { DailyMessages: 0, MaxAccounts: 0, APIAccess: true, MCPAccess: true, Webhooks: true, Copilot: true, Autopilot: true } },
      ]
      // Normalize to shape pricing.html expects: .ID, .Name, .Description, .PriceCents, .Description, .Limits
      plans = plans.map(p => ({ ...p, Limits: { DailyMessages: p.Limits.DailyMessages, MaxAccounts: p.Limits.MaxAccounts, APIAccess: p.Limits.APIAccess, MCPAccess: p.Limits.MCPAccess, Webhooks: p.Limits.Webhooks, Copilot: p.Limits.Copilot, Autopilot: p.Limits.Autopilot } }))
    }
    const { config: cfg2 } = await import('../config.js')
    return c.html(
      renderPage('pricing', {
        Title: 'Pricing — NoTalk',
        Page: 'pricing',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Plans: plans, RegistrationEnabled: cfg2.auth.registrationEnabled },
      })
    )
  })
}
