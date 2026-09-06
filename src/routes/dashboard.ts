import type { Hono } from 'hono'
import { getIdentity, getToken, getFlash } from '../middleware/auth.js'
import { backend } from '../lib/api.js'
import { renderPage } from '../lib/render/index.js'

export function registerDashboardRoutes(app: Hono): void {
  app.get('/dashboard', async (c) => {
    const identity = getIdentity(c)!
    const token = getToken(c)!
    const flash = getFlash(c)
    const { data } = await backend.json('GET', '/api/v1/accounts', token)
    const accounts: any[] = Array.isArray(data) ? data : (data?.accounts ?? [])
    const rows = accounts.map((a: any) => ({
      id: a.id,
      accountName: a.account_name ?? a.accountName ?? '',
      phoneNumber: a.phone_number ?? a.phoneNumber ?? '',
      connected: a.status?.connected ?? a.connected ?? a.authorized ?? a.Authorized ?? false,
      createdAt: a.created_at ?? a.createdAt ?? new Date().toISOString(),
    }))
    const connected = rows.filter((r) => r.connected).length
    let totalUsers = 0
    const { status: us, data: udata } = await backend.json('GET', '/api/v1/users', token)
    if (us === 200) totalUsers = Array.isArray(udata) ? udata.length : (udata?.users?.length ?? udata?.total ?? 0)

    return c.html(
      renderPage('dashboard', {
        Title: 'Dashboard — NoTalk',
        Page: 'dashboard',
        Version: '1.0.0',
        Identity: identity,
        Flash: flash ? { Type: flash.Type, Message: flash.Message } : null,
        Data: {
          TotalAccounts: accounts.length,
          Connected: connected,
          Disconnected: accounts.length - connected,
          TotalUsers: totalUsers,
          Accounts: rows.slice(0, 5).map((r) => ({
            ID: r.id,
            AccountName: r.accountName,
            PhoneNumber: r.phoneNumber,
            Connected: r.connected,
            CreatedAt: r.createdAt,
          })),
        },
      })
    )
  })
}
