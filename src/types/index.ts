// Shared BFF types — shape mirrors Go handler models so templates stay 1:1
export interface Identity {
  userId: string
  username: string
  roleName: string
  permissions: string[]
}

export function hasPermission(id: Identity | null, required: string): boolean {
  if (!id) return false
  for (const p of id.permissions) {
    if (p === '*') return true
    if (p === required) return true
    if (p.endsWith(':*') && required.startsWith(p.slice(0, -1))) return true
  }
  return false
}

export interface AccountRow {
  id: string
  accountName: string
  phoneNumber: string
  connected: boolean
  createdAt: string
}

export interface PageData<T = any> {
  title: string
  heading: string
  page: string
  version: string
  identity: Identity | null
  flash: { type: string; message: string } | null
  data: T
}

// Go-compatible PageData (Title/Version) — used by render
export interface GoPageData {
  Title: string
  Heading?: string
  Page: string
  Version: string
  Identity: Identity | null
  Flash: { Type: string; Message: string } | null
  Data: any
}

export type HonoEnv = {
  Variables: {
    identity: Identity | null
    token: string | null
    flash: { type: string; message: string } | null
  }
}
