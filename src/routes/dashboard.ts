import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash } from '../middleware/auth.js'
import { backend } from '../lib/api.js'
import { renderPage } from '../lib/render/index.js'

export function registerDashboardRoutes(app: Hono): void {
  app.get('/dashboard', async (c) => {
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    let channels: any[] = []
    let totalUsers = 0
    let backendDown = false
    try {
      const { data } = await backend.json('GET', '/api/v1/channels', token)
      channels = Array.isArray(data) ? data : (data?.channels ?? data?.accounts ?? [])
    } catch {
      // Fallback to legacy accounts
      try {
        const { data } = await backend.json('GET', '/api/v1/accounts', token)
        channels = Array.isArray(data) ? data : (data?.accounts ?? [])
      } catch {
        backendDown = true
        channels = []
      }
    }
    const rows = channels.map((a: any) => ({
      id: a.id,
      accountName: a.account_name ?? a.name ?? a.AccountName ?? '',
      phoneNumber: a.phone_number ?? a.identifier ?? a.PhoneNumber ?? a.Identifier ?? '',
      type: a.type ?? a.Type ?? 'whatsapp',
      connected: a.status?.connected ?? a.connected ?? a.authorized ?? a.Authorized ?? false,
      createdAt: a.created_at ?? a.createdAt ?? new Date().toISOString(),
    }))
    const connected = rows.filter((r) => r.connected).length
    const byType = rows.reduce((acc: any, r: any) => {
      acc[r.type] = (acc[r.type] || 0) + 1
      return acc
    }, {})
    try {
      const { status: us, data: udata } = await backend.json('GET', '/api/v1/users', token)
      if (us === 200) totalUsers = Array.isArray(udata) ? udata.length : (udata?.users?.length ?? udata?.total ?? 0)
    } catch {
      backendDown = true
    }

    return c.html(
      renderPage('dashboard', {
        Title: 'Dashboard — NoTalk',
        Page: 'dashboard',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {
          TotalAccounts: channels.length,
          TotalChannels: channels.length,
          Connected: connected,
          Disconnected: channels.length - connected,
          TotalUsers: totalUsers,
          ByType: byType,
          Accounts: rows.slice(0, 5).map((r) => ({
            ID: r.id,
            AccountName: r.accountName,
            PhoneNumber: r.phoneNumber,
            Type: r.type,
            Connected: r.connected,
            CreatedAt: r.createdAt,
          })),
        },
      })
    )
  })
}
