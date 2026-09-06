import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { webAuth } from './middleware/auth.js'

export function createApp(): Hono {
  const app = new Hono()

  // Static and health are always public
  app.use('/static/*', serveStatic({ root: './public' }))
  app.get('/favicon.ico', (c) => c.redirect('/static/favicon.svg', 301))
  app.get('/health', (c) => c.json({ status: 'ok', service: 'notalk-web', version: '1.0.0' }))

  return app
}

export function mountAuthWall(app: Hono): void {
  app.use('/*', webAuth)
}
