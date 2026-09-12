import { createApp, mountAuthWall } from './app.js'
import { registerPublicRoutes } from './routes/public.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerDashboardRoutes } from './routes/dashboard.js'
import { registerAccountsListRoutes } from './routes/accounts/list.js'
import { registerAccountsDetailRoutes } from './routes/accounts/detail.js'
import { registerAccountsChatRoutes } from './routes/accounts/chat.js'
import { registerAccountsFragments } from './routes/accounts/fragments.js'
import { registerWhatsappRoutes } from './routes/whatsapp.js'
import { registerAiSettingsRoutes } from './routes/settings/ai.js'
import { registerAssistantRoutes } from './routes/assistant.js'
import { registerAdminRoutes } from './routes/admin.js'
import { registerBillingRoutes } from './routes/billing.js'
import { registerContactsRoutes } from './routes/contacts.js'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { config } from './config.js'
import { getFlash, getIdentity } from './middleware/auth.js'
import { renderPage } from './lib/render/index.js'

const app = createApp()
app.use('/static/*', serveStatic({ root: './public' }))
app.get('/favicon.ico', (c) => c.redirect('/static/favicon.svg', 301))

registerPublicRoutes(app)
registerAuthRoutes(app)

mountAuthWall(app)

registerDashboardRoutes(app)
registerAccountsListRoutes(app)
registerAccountsDetailRoutes(app)
registerAccountsChatRoutes(app)
registerAccountsFragments(app)
registerWhatsappRoutes(app)
registerAssistantRoutes(app)
registerAiSettingsRoutes(app)
registerAdminRoutes(app)
registerBillingRoutes(app)
registerContactsRoutes(app)

// 404 — keep last, after all other routes
app.all('*', (c) => {
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

const port = config.server.port
console.log(`[notalk-web] listening on http://${config.server.host}:${port} → backend ${config.backend.url} (HTMX unchanged)`)
serve({ fetch: app.fetch, port, hostname: config.server.host })
