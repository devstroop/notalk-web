import type { Hono } from 'hono'
import { getIdentity, getFlash } from '../middleware/auth.js'
import { backend } from '../lib/api.js'
import { renderPage } from '../lib/render/index.js'

export function registerPublicRoutes(app: Hono): void {
  app.get('/', async (c) => {
    const identity = getIdentity(c)
    if (identity) return c.redirect('/dashboard', 302)
    const flash = getFlash(c)
    return c.html(
      renderPage('home', {
        Title: 'NoTalk — Social Engagement Made Simple',
        Page: 'home',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {},
      })
    )
  })

  app.get('/about', (c) => {
    const flash = getFlash(c)
    return c.html(
      renderPage('about', {
        Title: 'About — NoTalk',
        Page: 'about',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {},
      })
    )
  })

  app.get('/terms', (c) => {
    const flash = getFlash(c)
    return c.html(
      renderPage('terms', {
        Title: 'Terms — NoTalk',
        Page: 'terms',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {},
      })
    )
  })

  app.get('/privacy', (c) => {
    const flash = getFlash(c)
    return c.html(
      renderPage('privacy', {
        Title: 'Privacy — NoTalk',
        Page: 'privacy',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {},
      })
    )
  })

  app.get('/pricing', async (c) => {
    const flash = getFlash(c)
    let plans: any[] = []
    try {
      const res = await fetch(`${process.env.NOTALK_BACKEND_URL || 'http://localhost:5000'}/api/v1/billing/plans`, {
        headers: { Accept: 'application/json' },
      })
      if (res.ok) {
        const j: any = await res.json()
        plans = Array.isArray(j) ? j : (j?.plans ?? [])
      }
    } catch {}
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
    return c.html(
      renderPage('pricing', {
        Title: 'Pricing — NoTalk',
        Page: 'pricing',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Plans: plans },
      })
    )
  })
}
