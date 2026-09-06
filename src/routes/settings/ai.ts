import type { Hono } from 'hono'
import { config } from '../../config.js'
import { getIdentity, getToken, getFlash, setFlash, hasPerm } from '../../middleware/auth.js'
import { backend } from '../../lib/api.js'
import { renderPage } from '../../lib/render/index.js'

export function registerAiSettingsRoutes(app: Hono): void {
  app.get('/settings/ai', async (c) => {
    const identity = getIdentity(c)
    if (!identity || !hasPerm(identity, '*')) return c.text('forbidden', 403)
    const token = getToken(c)!
    const fromConfig = !!config.llm.apiKey || (!!config.llm.provider && config.llm.provider !== '') || !!config.llm.baseURL
    if (fromConfig) {
      const flash = getFlash(c)
      return c.html(
        renderPage('ai-settings', {
          Title: 'LLM Configuration — NoTalk',
          Page: 'ai-settings',
          Version: '1.0.0',
          Identity: identity,
          Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
          Data: {
            Enabled: config.llm.enabled,
            Provider: config.llm.provider || 'openai',
            APIKey: config.llm.apiKey,
            BaseURL: config.llm.baseURL,
            Model: config.llm.model || 'gpt-4o-mini',
            FromConfig: true,
          },
        })
      )
    }
    const res = await backend.proxy('GET', '/settings/ai', token)
    const html = await res.text()
    if (res.status === 404) {
      return c.html(
        renderPage('ai-settings', {
          Title: 'LLM Configuration — NoTalk',
          Page: 'ai-settings',
          Version: '1.0.0',
          Identity: identity,
          Flash: null,
          Data: { Enabled: false, Provider: 'openai', APIKey: '', BaseURL: '', Model: 'gpt-4o-mini', FromConfig: false },
        })
      )
    }
    return c.html(html, res.status as any)
  })

  app.post('/settings/ai', async (c) => {
    const identity = getIdentity(c)
    if (!identity || !hasPerm(identity, '*')) return c.text('forbidden', 403)
    const token = getToken(c)!
    if (config.llm.apiKey || config.llm.provider || config.llm.baseURL) {
      setFlash(c, 'error', 'LLM settings are managed via config file or environment variables and cannot be edited here.')
      return c.redirect('/settings/ai', 303)
    }
    const form = await c.req.parseBody()
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(form)) body.append(k, String(v))
    const res = await backend.proxy('POST', '/settings/ai', token, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const loc = res.headers.get('location') || '/settings/ai'
    const sc = res.headers.get('set-cookie')
    if (sc) c.header('Set-Cookie', sc)
    return c.redirect(loc, 303)
  })
}
