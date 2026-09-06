import { Hono } from 'hono'
import { webAuth } from './middleware/auth.js'

export function createApp(): Hono {
  const app = new Hono()

  // Health is always public; static is handled by:
  // - Node: src/index.ts via @hono/node-server/serveStatic
  // - Workers: wrangler.jsonc `assets` (no serveStatic needed)
  app.get('/health', (c) => c.json({ status: 'ok', service: 'notalk-web', version: '1.0.0' }))

  return app
}

export function mountAuthWall(app: Hono): void {
  app.use('/*', webAuth)
}
