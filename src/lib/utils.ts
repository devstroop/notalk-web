// Port of Go render.go funcMap — keep UI behaviour identical
export function timeAgo(v: string | null | undefined): string {
  if (!v) return ''
  const t = Date.parse(v)
  if (isNaN(t)) return v
  const d = Date.now() - t
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

export function initial(s: string): string {
  return s ? s[0] ?? '' : ''
}

export function truncate(v: string | null | undefined, n: number): string {
  if (!v) return ''
  return v.length <= n ? v : v.slice(0, n) + '…'
}

export function fmtDate(s: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
