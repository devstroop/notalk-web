import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash, setFlash, hasPerm } from '../middleware/auth.js'
import { backend } from '../lib/api.js'
import { renderPage } from '../lib/render/index.js'

function requireAdmin(c: any): boolean {
  const id = getIdentity(c)
  return !!id && hasPerm(id, '*')
}

export function registerBillingRoutes(app: Hono): void {
  // Billing admin redirect
  app.get('/admin/billing', async (c) => {
    if (!requireAdmin(c)) return c.redirect('/dashboard', 303)
    return c.redirect('/admin/billing/plans', 303)
  })

  // Plans
  app.get('/admin/billing/plans', async (c) => {
    if (!requireAdmin(c)) return c.redirect('/dashboard', 303)
    const token = getToken(c)!
    const flash = getFlash(c)
    const { data } = await backend.json('GET', '/api/v1/billing/plans', token)
    const plans: any[] = Array.isArray(data) ? data : (data?.plans ?? [])
    return c.html(
      renderPage('billing-plans', {
        Title: 'Plans — NoTalk',
        Page: 'billing-plans',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Plans: plans },
      })
    )
  })

  app.post('/admin/billing/plans', async (c) => {
    if (!requireAdmin(c)) return c.text('forbidden', 403)
    const token = getToken(c)!
    const form = await c.req.parseBody()
    const id = String(form['id'] ?? '').trim()
    const name = String(form['name'] ?? '').trim()
    const description = String(form['description'] ?? '').trim()
    const price_cents = parseInt(String(form['price_cents'] ?? '0'), 10) || 0
    const daily_messages = parseInt(String(form['daily_messages'] ?? '0'), 10) || 0
    const max_accounts = parseInt(String(form['max_accounts'] ?? '0'), 10) || 0
    const api_access = form['api_access'] === 'on'
    const mcp_access = form['mcp_access'] === 'on'
    const webhooks = form['webhooks'] === 'on'
    const copilot = form['copilot'] === 'on'
    const autopilot = form['autopilot'] === 'on'
    const is_default = form['is_default'] === 'on'
    const payload: any = {
      id: id || undefined,
      name,
      description,
      price_cents,
      interval: 'month',
      limits: { daily_messages, max_accounts, api_access, mcp_access, webhooks, copilot, autopilot },
      is_default,
    }
    const { status, data } = await backend.json('POST', '/api/v1/billing/plans', token, payload)
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to create plan')
      return c.redirect('/admin/billing/plans', 303)
    }
    setFlash(c, 'success', 'Plan created.')
    return c.redirect('/admin/billing/plans', 303)
  })

  app.post('/admin/billing/plans/:id/update', async (c) => {
    if (!requireAdmin(c)) return c.text('forbidden', 403)
    const token = getToken(c)!
    const id = c.req.param('id')
    const form = await c.req.parseBody()
    const name = String(form['name'] ?? '').trim()
    const description = String(form['description'] ?? '').trim()
    const price_cents = form['price_cents'] !== undefined ? parseInt(String(form['price_cents']), 10) : undefined
    const daily_messages = form['daily_messages'] !== undefined ? parseInt(String(form['daily_messages']), 10) : undefined
    const max_accounts = form['max_accounts'] !== undefined ? parseInt(String(form['max_accounts']), 10) : undefined
    const payload: any = {}
    if (name) payload.name = name
    payload.description = description
    if (price_cents !== undefined && !isNaN(price_cents)) payload.price_cents = price_cents
    const limits: any = {}
    if (daily_messages !== undefined && !isNaN(daily_messages)) limits.daily_messages = daily_messages
    if (max_accounts !== undefined && !isNaN(max_accounts)) limits.max_accounts = max_accounts
    limits.api_access = form['api_access'] === 'on'
    limits.mcp_access = form['mcp_access'] === 'on'
    limits.webhooks = form['webhooks'] === 'on'
    limits.copilot = form['copilot'] === 'on'
    limits.autopilot = form['autopilot'] === 'on'
    payload.limits = limits
    if (form['is_default'] !== undefined) payload.is_default = form['is_default'] === 'on'
    const { status, data } = await backend.json('PATCH', `/api/v1/billing/plans/${id}`, token, payload)
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to update plan')
      return c.redirect('/admin/billing/plans', 303)
    }
    setFlash(c, 'success', 'Plan updated.')
    return c.redirect('/admin/billing/plans', 303)
  })

  app.post('/admin/billing/plans/:id/delete', async (c) => {
    if (!requireAdmin(c)) return c.text('forbidden', 403)
    const token = getToken(c)!
    const id = c.req.param('id')
    const { status, data } = await backend.json('DELETE', `/api/v1/billing/plans/${id}`, token)
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to delete plan')
      return c.redirect('/admin/billing/plans', 303)
    }
    setFlash(c, 'success', 'Plan deleted.')
    return c.redirect('/admin/billing/plans', 303)
  })

  // Subscriptions
  app.get('/admin/billing/subscriptions', async (c) => {
    if (!requireAdmin(c)) return c.redirect('/dashboard', 303)
    const token = getToken(c)!
    const flash = getFlash(c)
    const { data: subsData } = await backend.json('GET', '/api/v1/billing/subscriptions', token)
    const { data: plansData } = await backend.json('GET', '/api/v1/billing/plans', token)
    const subs: any[] = Array.isArray(subsData) ? subsData : (subsData?.subscriptions ?? [])
    const plans: any[] = Array.isArray(plansData) ? plansData : (plansData?.plans ?? [])
    let active = 0, trial = 0, canceled = 0
    for (const s of subs) {
      if (s.status === 'active') active++
      else if (s.status === 'trialing') trial++
      else if (s.status === 'canceled') canceled++
    }
    return c.html(
      renderPage('billing-subscriptions', {
        Title: 'Subscriptions — NoTalk',
        Page: 'billing-subscriptions',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Subscriptions: subs, Plans: plans, ActiveCount: active, TrialCount: trial, CanceledCount: canceled },
      })
    )
  })

  app.post('/admin/billing/subscriptions/:user_id/assign', async (c) => {
    if (!requireAdmin(c)) return c.text('forbidden', 403)
    const token = getToken(c)!
    const userID = c.req.param('user_id')
    const form = await c.req.parseBody()
    const plan_id = String(form['plan_id'] ?? '').trim()
    if (!plan_id) {
      setFlash(c, 'error', 'Plan is required.')
      return c.redirect('/admin/billing/subscriptions', 303)
    }
    const { status, data } = await backend.json('POST', `/api/v1/billing/subscriptions/${userID}/assign`, token, { plan_id })
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to assign plan')
      return c.redirect('/admin/billing/subscriptions', 303)
    }
    setFlash(c, 'success', 'Plan assigned.')
    return c.redirect('/admin/billing/subscriptions', 303)
  })

  app.post('/admin/billing/subscriptions/:user_id/delete', async (c) => {
    if (!requireAdmin(c)) return c.text('forbidden', 403)
    const token = getToken(c)!
    const userID = c.req.param('user_id')
    const { status, data } = await backend.json('DELETE', `/api/v1/billing/subscriptions/${userID}`, token)
    if (status >= 400) {
      setFlash(c, 'error', (data as any)?.error || 'Failed to delete subscription')
      return c.redirect('/admin/billing/subscriptions', 303)
    }
    setFlash(c, 'success', 'Subscription removed.')
    return c.redirect('/admin/billing/subscriptions', 303)
  })

  // Usage
  app.get('/admin/billing/usage', async (c) => {
    if (!requireAdmin(c)) return c.redirect('/dashboard', 303)
    const token = getToken(c)!
    const flash = getFlash(c)
    const { data } = await backend.json('GET', '/api/v1/billing/usage', token)
    const usage: any[] = Array.isArray(data) ? data : (data?.usage ?? [])
    let total = 0
    for (const u of usage) total += u.messages_sent ?? u.Messages ?? 0
    const avg = usage.length ? Math.floor(total / usage.length) : 0
    return c.html(
      renderPage('billing-usage', {
        Title: 'Usage — NoTalk',
        Page: 'billing-usage',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: { Usage: usage, TotalMessages: total, AvgMessages: avg },
      })
    )
  })

  // Billing overview (combined)
  app.get('/admin/billing', async (c) => {
    if (!requireAdmin(c)) return c.redirect('/dashboard', 303)
    return c.redirect('/admin/billing/plans', 303)
  })

  // Admin Configuration
  app.get('/admin/configuration', async (c) => {
    if (!requireAdmin(c)) return c.redirect('/dashboard', 303)
    const token = getToken(c)!
    const flash = getFlash(c)
    const { data } = await backend.json('GET', '/api/v1/billing/config', token).catch(() => ({ data: {} } as any))
    return c.html(
      renderPage('admin-config', {
        Title: 'Configuration — NoTalk',
        Page: 'admin-config',
        Version: '1.0.0',
        Identity: getIdentity(c),
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {
          BillingEnabled: !!(data as any)?.billing_enabled,
          ActiveGateway: (data as any)?.active_gateway ?? '',
          StripeKeySet: !!(data as any)?.stripe_key_set,
          StripeWebhookSet: !!(data as any)?.stripe_webhook_set,
          RazorpayKeySet: !!(data as any)?.razorpay_key_set,
          RazorpaySecretSet: !!(data as any)?.razorpay_secret_set,
          PayUKeySet: !!(data as any)?.payu_key_set,
          PayUSaltSet: !!(data as any)?.payu_salt_set,
        },
      })
    )
  })

  // Subscription (user-facing)
  app.get('/subscription', async (c) => {
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    // For system, redirect to dashboard
    if ((identity as any)?.userId === 'system' || (identity as any)?.userID === 'system') {
      return c.redirect('/dashboard', 303)
    }
    // Try to get subscription and usage
    let sub: any = null, plan: any = null, plans: any[] = [], dailyUsage = 0, accountCount = 0
    try {
      const { data: subData } = await backend.json('GET', `/api/v1/billing/subscriptions`, token)
      const subs: any[] = Array.isArray(subData) ? subData : (subData?.subscriptions ?? [])
      sub = subs.find((s: any) => s.user_id === (identity as any).userId || s.userID === (identity as any).userId) ?? null
    } catch {}
    try {
      const { data: plansData } = await backend.json('GET', '/api/v1/billing/plans', token)
      plans = Array.isArray(plansData) ? plansData : (plansData?.plans ?? [])
    } catch {}
    return c.html(
      renderPage('subscription', {
        Title: 'Subscription — NoTalk',
        Page: 'subscription',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {
          Plans: plans,
          SubStatus: sub?.status ?? 'none',
          SubPeriodEnd: sub?.current_period_end ?? sub?.CurrentPeriodEnd ?? '',
          PlanID: sub?.plan_id ?? sub?.PlanID ?? 'free',
          PlanName: sub?.plan_name ?? sub?.PlanName ?? '',
          DailyUsage: dailyUsage,
          AccountCount: accountCount,
        },
      })
    )
  })
}
