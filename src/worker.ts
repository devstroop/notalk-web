import { createApp, mountAuthWall } from './app.js'
import { registerPublicRoutes } from './routes/public.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerDashboardRoutes } from './routes/dashboard.js'
import { registerAccountsListRoutes } from './routes/accounts/list.js'
import { registerAccountsDetailRoutes } from './routes/accounts/detail.js'
import { registerAccountsFragments } from './routes/accounts/fragments.js'
import { registerWhatsappRoutes } from './routes/whatsapp.js'
import { registerAiSettingsRoutes } from './routes/settings/ai.js'
import { registerAssistantRoutes } from './routes/assistant.js'
import { registerAdminRoutes } from './routes/admin.js'
import { registerBillingRoutes } from './routes/billing.js'
import { registerContactsRoutes } from './routes/contacts.js'

export interface Env {
  NOTALK_BACKEND_URL?: string
  BACKEND_URL?: string
  NOTALK_AUTH_SECRET_KEY?: string
  FRONTEND_SECRET_KEY?: string
  NOTALK_AUTH_REGISTRATION_ENABLED?: string
  FRONTEND_REGISTRATION_ENABLED?: string
  NOTALK_LLM_ENABLED?: string
  NOTALK_LLM_PROVIDER?: string
  NOTALK_LLM_API_KEY?: string
  NOTALK_LLM_BASE_URL?: string
  NOTALK_LLM_MODEL?: string
  ASSETS?: any
}

const app = (() => {
  const a = createApp()
  registerPublicRoutes(a)
  registerAuthRoutes(a)
  mountAuthWall(a)
  registerDashboardRoutes(a)
  registerAccountsListRoutes(a)
  registerAccountsDetailRoutes(a)
  registerAccountsFragments(a)
  registerWhatsappRoutes(a)
  registerAssistantRoutes(a)
  registerAiSettingsRoutes(a)
  registerAdminRoutes(a)
  registerBillingRoutes(a)
  registerContactsRoutes(a)
  a.all('*', async (c) => {
    const { getFlash, getIdentity } = await import('./middleware/auth.js')
    const { renderPage } = await import('./lib/render/index.js')
    const flash = getFlash(c)
    return c.html(
      renderPage('error', {
        Title: 'Not Found — NoTalk',
        Page: 'error',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Code: '404', Title: 'Page not found', Message: "The page you're looking for doesn't exist." },
      }),
      404
    )
  })
  return a
})()

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    // Expose env to config via both process.env (Node compat) and globalThis (edge)
    const g: any = globalThis as any
    g.__WRANGLER_ENV__ = env
    try {
      for (const [k, v] of Object.entries(env)) {
        if (v != null && typeof process !== 'undefined' && !(k in (process as any).env)) (process as any).env[k] = v as string
      }
    } catch {}
    return app.fetch(request, env as any, ctx as any)
  },
}
