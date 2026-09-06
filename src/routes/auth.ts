import type { Hono } from 'hono'
import { config } from '../config.js'
import { getFlash, setFlash, getIdentity, setSession, clearSession } from '../middleware/auth.js'
import { backend } from '../lib/api.js'
import { renderPage } from '../lib/render/index.js'

export function registerAuthRoutes(app: Hono): void {
  app.get('/login', (c) => {
    const flash = getFlash(c)
    return c.html(
      renderPage('login', {
        Title: 'Sign in — NoTalk',
        Page: 'login',
        Version: '1.0.0',
        Identity: null,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { RegistrationEnabled: config.auth.registrationEnabled, SecretKeyHint: true },
      })
    )
  })

  app.post('/login', async (c) => {
    const form = await c.req.parseBody()
    const username = String(form['username'] || '').trim()
    const password = String(form['password'] || '')
    if (!username || !password) {
      setFlash(c, 'error', 'Username and password are required.')
      return c.redirect('/login', 303)
    }
    if (username === 'system' && password === config.auth.secretKey) {
      setSession(c, config.auth.secretKey)
      return c.redirect('/dashboard', 303)
    }
    const { status, data } = await backend.json('POST', '/api/v1/auth/login', null, { username, password })
    if (status !== 200 || !data?.token) {
      const msg = (data as any)?.error || 'Invalid credentials.'
      setFlash(c, 'error', msg)
      return c.redirect('/login', 303)
    }
    setSession(c, data.token)
    return c.redirect('/dashboard', 303)
  })

  app.post('/logout', (c) => {
    clearSession(c)
    return c.redirect('/login', 303)
  })

  if (config.auth.registrationEnabled) {
    app.get('/register', (c) => {
      const flash = getFlash(c)
      return c.html(
        renderPage('register', {
          Title: 'Register — NoTalk',
          Page: 'register',
          Version: '1.0.0',
          Identity: null,
          Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
          Data: {},
        })
      )
    })
    app.post('/register', async (c) => {
      const form = await c.req.parseBody()
      const username = String(form['username'] || '').trim()
      const email = String(form['email'] || '').trim()
      const password = String(form['password'] || '')
      if (!username || !password) {
        setFlash(c, 'error', 'Username and password are required.')
        return c.redirect('/register', 303)
      }
      const { status, data } = await backend.json('POST', '/api/v1/auth/register', null, { username, email, password })
      if (status >= 400) {
        setFlash(c, 'error', (data as any)?.error || 'Registration failed.')
        return c.redirect('/register', 303)
      }
      setFlash(c, 'success', 'Account created. Please sign in.')
      return c.redirect('/login', 303)
    })
  }

  app.get('/forgot-password', (c) => {
    const flash = getFlash(c)
    return c.html(
      renderPage('forgot-password', {
        Title: 'Forgot Password — NoTalk',
        Page: 'forgot-password',
        Version: '1.0.0',
        Identity: null,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {},
      })
    )
  })
  app.post('/forgot-password', async (c) => {
    const form = await c.req.parseBody()
    const email = String(form['email'] || '').trim()
    await backend.json('POST', '/api/v1/auth/forgot-password', null, { email })
    setFlash(c, 'success', 'If an account with that email exists, a reset link has been sent.')
    return c.redirect('/forgot-password', 303)
  })
  app.get('/reset-password', (c) => {
    const token = c.req.query('token') || ''
    if (!token) {
      setFlash(c, 'error', 'Invalid or missing reset token.')
      return c.redirect('/forgot-password', 303)
    }
    const flash = getFlash(c)
    return c.html(
      renderPage('reset-password', {
        Title: 'Reset Password — NoTalk',
        Page: 'reset-password',
        Version: '1.0.0',
        Identity: null,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Token: token },
      })
    )
  })
  app.post('/reset-password', async (c) => {
    const form = await c.req.parseBody()
    const token = String(form['token'] || '')
    const password = String(form['password'] || '')
    const confirm = String(form['confirm_password'] || '')
    if (!token || password.length < 8 || password !== confirm) {
      setFlash(c, 'error', password !== confirm ? 'Passwords do not match.' : 'Password must be at least 8 characters.')
      return c.redirect(`/reset-password?token=${encodeURIComponent(token)}`, 303)
    }
    const { status, data } = await backend.json('POST', '/api/v1/auth/reset-password', null, { token, new_password: password })
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Reset failed.')
      return c.redirect(`/reset-password?token=${encodeURIComponent(token)}`, 303)
    }
    setFlash(c, 'success', 'Password reset successfully. Please sign in.')
    return c.redirect('/login', 303)
  })
}
