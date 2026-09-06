import type { Hono } from 'hono'
import { config } from '../config.js'
import { getIdentity, getToken, getFlash, setFlash } from '../middleware/auth.js'
import { backend } from '../lib/api.js'
import { renderPage } from '../lib/render/index.js'

export function registerAssistantRoutes(app: Hono): void {
  app.get('/assistant', async (c) => {
    const identity = getIdentity(c)
    if (!identity) return c.redirect('/login', 303)
    const flash = getFlash(c)
    const aiEnabled = config.llm.enabled
    const provider = config.llm.provider || 'openai'
    const model = config.llm.model || 'gpt-4o-mini'
    let history: any[] = []
    // Try to load history from backend if available (optional, ignore errors)
    try {
      const token = getToken(c)!
      const res = await backend.json('GET', '/api/v1/assistant/history', token)
      if (res.status === 200) {
        if (Array.isArray(res.data)) history = res.data
        else if ((res.data as any)?.history && Array.isArray((res.data as any).history)) history = (res.data as any).history
        else if ((res.data as any)?.messages) history = (res.data as any).messages
      }
    } catch {}
    return c.html(
      renderPage('assistant', {
        Title: 'Copilot — NoTalk',
        Page: 'assistant',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { AIEnabled: aiEnabled, Provider: provider, Model: model, History: history },
      })
    )
  })

  app.post('/assistant/chat', async (c) => {
    const identity = getIdentity(c)
    if (!identity) return c.text('unauthorized', 401)
    if (!config.llm.enabled) {
      return c.json({ error: 'LLM not configured. Set NOTALK_LLM_API_KEY or enable in Settings → LLM Configuration.' }, 503)
    }
    // For now, proxy to backend if it has an agent endpoint, otherwise return a simple SSE mock
    // Try backend first
    try {
      const token = getToken(c)!
      const body = await c.req.parseBody()
      const message = String((body as any)['message'] ?? '').trim()
      if (!message) return c.json({ error: 'message required' }, 400)
      // Try to proxy to backend's agent (if exists)
      const res = await backend.proxy('POST', '/api/v1/assistant/chat', token, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (res.status !== 404) {
        // Stream through
        const ct = res.headers.get('content-type') || 'text/event-stream'
        c.header('Content-Type', ct)
        return c.body(Buffer.from(await res.arrayBuffer()), res.status as any)
      }
    } catch {}
    // Fallback: simple SSE echo if backend not implemented
    const body = await c.req.parseBody()
    const message = String((body as any)['message'] ?? '').trim()
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        const send = (obj: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`))
        send({ type: 'text', content: `Echo: ${message} (LLM proxy not configured in backend)` })
        send({ type: 'done' })
        controller.close()
      },
    })
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  })

  app.post('/assistant/clear', async (c) => {
    const identity = getIdentity(c)
    if (!identity) return c.redirect('/login', 303)
    try {
      const token = getToken(c)!
      await backend.json('DELETE', '/api/v1/assistant/history', token)
    } catch {}
    return c.redirect('/assistant', 303)
  })
}
