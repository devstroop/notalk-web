export interface NormalizedAccount {
  ID: string
  AccountName: string
  PhoneNumber: string
  Connected: boolean
  CreatedAt: string
}

export function normalizeAccount(a: any): NormalizedAccount {
  return {
    ID: a.ID ?? a.id ?? '',
    AccountName: a.AccountName ?? a.account_name ?? a.accountName ?? '',
    PhoneNumber: a.PhoneNumber ?? a.phone_number ?? a.phoneNumber ?? '',
    Connected: a.Connected ?? a.connected ?? a.status?.connected ?? false,
    CreatedAt: a.CreatedAt ?? a.created_at ?? a.createdAt ?? '',
  }
}

export function normalizeAccounts(list: any[]): NormalizedAccount[] {
  const arr = (list ?? []) as any[]
  return arr.map(normalizeAccount)
}
