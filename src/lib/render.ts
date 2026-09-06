import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
function findTemplatesDir(): string {
  const candidates = [
    join(__dirname, '../../templates'),
    join(__dirname, '../templates'),
    join(process.cwd(), 'templates'),
    join(process.cwd(), 'notalk-web/templates'),
    '/Volumes/EXT/wa-workspace/notalk-web/templates',
    join(process.cwd(), 'dist/templates'),
  ]
  for (const p of candidates) if (existsSync(p)) return p
  return candidates[0]
}
const TEMPLATES_DIR = findTemplatesDir()
export function timeAgo(v: string | null | undefined): string {
  if (!v) return ''
  const t = Date.parse(v)
  if (isNaN(t)) return String(v)
  const d = Date.now() - t
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}
const cache = new Map<string, string>()
function raw(path: string): string {
  if (cache.has(path)) return cache.get(path)!
  const full = join(TEMPLATES_DIR, path)
  const s = existsSync(full) ? readFileSync(full, 'utf-8') : `<!-- missing ${path} -->`
  cache.set(path, s)
  return s
}
export interface PageData {
  Title: string
  Heading?: string
  Page: string
  Version: string
  Identity: { userId: string; username: string; roleName: string; permissions: string[] } | null
  Flash: { Type: string; Message: string } | null
  Data: any
}
const pageLayout: Record<string, string> = {
  home: 'home', about: 'home', terms: 'home', privacy: 'home',
  dashboard: 'base', accounts: 'base', 'account-detail': 'base', users: 'base',
  roles: 'base', 'api-keys': 'base', messaging: 'base', mcp: 'base',
  settings: 'base', assistant: 'base', autopilot: 'base',
  login: 'auth', register: 'auth', 'forgot-password': 'auth', 'reset-password': 'auth',
  error: 'auth', 'ai-settings': 'base',
}
function hasPerm(id: any, perm: string): boolean {
  if (!id) return false
  for (const p of id.permissions ?? []) {
    if (p === '*') return true
    if (p === perm) return true
    if (p.endsWith(':*') && perm.startsWith(p.slice(0, -1))) return true
  }
  return false
}
function esc(s: string): string { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function escAttr(s: string): string { return esc(s) }

function expandRangeBlocks(html: string, data: PageData): string {
  const accounts: any[] = (data.Data?.Accounts ?? data.Data?.accounts ?? []) as any[]
  const norm = accounts.map((a: any) => ({
    ID: a.ID ?? a.id ?? '', AccountName: a.AccountName ?? a.account_name ?? a.accountName ?? '', PhoneNumber: a.PhoneNumber ?? a.phone_number ?? a.phoneNumber ?? '', Connected: a.Connected ?? a.connected ?? a.status?.connected ?? false, CreatedAt: a.CreatedAt ?? a.created_at ?? a.createdAt ?? '',
  }))
  if (html.includes('window._accountConnected')) {
    const connMap = norm.map(a => `"${escAttr(a.ID)}": ${a.Connected ? 'true' : 'false'}`).join(',\n  ')
    const metaMap = norm.map(a => `"${escAttr(a.ID)}": { name: "${escAttr(a.AccountName)}", phone: "${escAttr(a.PhoneNumber)}" }`).join(',\n  ')
    html = html.replace(/window\._accountConnected\s*=\s*\{[\s\S]*?\};/, `window._accountConnected = {\n  ${connMap}\n};`)
    html = html.replace(/window\._accountMeta\s*=\s*\{[\s\S]*?\};/, `window._accountMeta = {\n  ${metaMap}\n};`)
    // Also handle the account picker dropdown's {{if .Data.Accounts}} {{range}} block for messaging
    // Pattern: {{if .Data.Accounts}} {{range .Data.Accounts}} <button ...> ... {{end}} {{else}} <div>No accounts...</div> {{end}}
    const pickerRe = /\{\{if \.Data\.Accounts\}\}[\s\S]*?\{\{range \.Data\.Accounts\}\}([\s\S]*?)\{\{end\}\}[\s\S]*?\{\{else\}\}([\s\S]*?)\{\{end\}\}/g
    // Alternative simpler: directly replace the entire if-range-else block with generated picker HTML
    // Find the specific picker block via its surrounding markers: the dropdown panel
    // For robustness, handle any {{if .Data.Accounts}} {{range}} ... {{else}} ... {{end}} in messaging
    if (html.includes('{{if .Data.Accounts}}') && html.includes('{{range .Data.Accounts}}')) {
      // Generate picker buttons HTML matching original HTMX/Alpine structure
      let pickerHtml = ''
      if (norm.length === 0) {
        pickerHtml = `<div class="px-4 py-3 text-sm text-gray-400 text-center">No accounts yet. <a href="/accounts" class="text-brand-800 hover:underline">Create one</a></div>`
      } else {
        pickerHtml = norm.map(a => `
          <button type="button"
                  @click="sender = '${escAttr(a.ID)}'; open = false; onAccountChange()"
                  class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left group"
                  :class="sender === '${escAttr(a.ID)}' ? 'bg-brand-50' : ''">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all"
                 :class="sender === '${escAttr(a.ID)}' ? 'bg-brand-500 text-gray-900' : 'bg-gray-100 text-gray-600'">
              ${escAttr((a.AccountName?.[0] ?? '?').toUpperCase())}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">${esc(a.AccountName)}</p>
              ${a.PhoneNumber ? `<p class="text-xs text-gray-400">${esc(a.PhoneNumber)}</p>` : ''}
            </div>
            <span class="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${a.Connected ? 'text-green-700 bg-green-100' : 'text-amber-700 bg-amber-100'}">
              <span class="w-1.5 h-1.5 rounded-full ${a.Connected ? 'bg-green-500' : 'bg-amber-400'}"></span>
              ${a.Connected ? 'Online' : 'Offline'}
            </span>
          </button>`).join('')
      }
      // Replace the entire if-range-else block for picker
      // Find from {{if .Data.Accounts}} to the final {{end}} that closes the if (after the else)
      // Use a greedy that captures up to the last {{end}} before the dropdown's closing </div>
      // Simpler: replace the known pattern that includes the range and else
      const fullPickerRe = /\{\{if \.Data\.Accounts\}\}\s*\{\{range \.Data\.Accounts\}\}[\s\S]*?\{\{end\}\}\s*\{\{else\}\}[\s\S]*?\{\{end\}\}/g
      if (fullPickerRe.test(html)) {
        html = html.replace(fullPickerRe, pickerHtml)
      } else {
        // Fallback: try to replace just the range part
        html = html.replace(/\{\{range \.Data\.Accounts\}\}[\s\S]*?\{\{end\}\}/g, pickerHtml)
      }
    }
  }
  return html
}

function evalPageTemplate(page: string, data: PageData): string {
  const layoutName = pageLayout[page] ?? 'base'
  const layoutRaw = raw(`layouts/${layoutName}.html`)
  const pageRaw = raw(`pages/${page}.html`)
  const contentMatch = pageRaw.match(/\{\{define "content"\}\}([\s\S]*)\{\{end\}\}\s*$/)
  const contentRaw = contentMatch ? contentMatch[1] : (() => {
    let c = pageRaw.replace(/\{\{define "content"\}\}/, '')
    const lastEnd = c.lastIndexOf('{{end}}')
    if (lastEnd !== -1) c = c.slice(0, lastEnd)
    return c
  })()
  let content = contentRaw
  if (page === 'accounts') {
    const accounts: any[] = (data.Data?.Accounts ?? []) as any[]
    const norm = accounts.map((a: any) => ({
      ID: a.ID ?? a.id ?? '', AccountName: a.AccountName ?? a.account_name ?? a.accountName ?? '', PhoneNumber: a.PhoneNumber ?? a.phone_number ?? a.phoneNumber ?? '', Connected: a.Connected ?? a.connected ?? a.status?.connected ?? false, CreatedAt: a.CreatedAt ?? a.created_at ?? a.createdAt ?? '',
    }))
    let rowsHtml = ''
    if (norm.length === 0) {
      rowsHtml = `<tr><td colspan="5"><div class="px-5 py-12 text-center"><p class="text-sm text-gray-500">No accounts yet.</p><a href="/accounts" class="mt-3 inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-brand-600">Create account</a></div></td></tr>`
    } else {
      rowsHtml = norm.map(a => `
          <tr class="hover:bg-gray-50 transition-colors">
            <td class="px-5 py-3"><a href="/accounts/${escAttr(a.ID)}" class="font-medium text-gray-900 hover:text-brand-800">${esc(a.AccountName)}</a></td>
            <td class="px-5 py-3 text-gray-500">${esc(a.PhoneNumber)}</td>
            <td class="px-5 py-3">${a.Connected ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Connected</span>` : `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Disconnected</span>`}</td>
            <td class="px-5 py-3 text-gray-500">${esc(timeAgo(a.CreatedAt))}</td>
            <td class="px-5 py-3 text-right"><div class="flex items-center justify-end gap-3"><a href="/accounts/${escAttr(a.ID)}/autopilot" class="text-sm font-medium text-violet-600">Autopilot</a><a href="/accounts/${escAttr(a.ID)}" class="text-brand-800 text-sm font-medium">Manage →</a></div></td>
          </tr>`).join('')
    }
    content = content.replace(/<tbody class="divide-y divide-gray-50">[\s\S]*?<\/tbody>/, `<tbody class="divide-y divide-gray-50">${rowsHtml}</tbody>`)
    content = content.replace(/\{\{[^}]+\}\}/g, (m) => m.includes('hx-') || m.includes('x-') ? m : '')
  } else if (page === 'dashboard') {
    const accounts: any[] = (data.Data?.Accounts ?? []) as any[]
    const norm = accounts.map((a: any) => ({
      ID: a.ID ?? a.id ?? '', AccountName: a.AccountName ?? a.account_name ?? a.accountName ?? '', PhoneNumber: a.PhoneNumber ?? a.phone_number ?? a.phoneNumber ?? '', Connected: a.Connected ?? a.connected ?? a.status?.connected ?? false, CreatedAt: a.CreatedAt ?? a.created_at ?? a.createdAt ?? '',
    }))
    let recentHtml = ''
    if (norm.length === 0) {
      recentHtml = `<div class="px-5 py-12 text-center"><p class="text-sm text-gray-500">No accounts yet.</p><a href="/accounts" class="mt-3 inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-brand-600">Create account</a></div>`
    } else {
      recentHtml = norm.map(a => `
        <div class="px-5 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">${(a.AccountName?.[0] ?? '?').toUpperCase()}</div>
            <div><p class="text-sm font-medium text-gray-900">${a.AccountName}</p><p class="text-xs text-gray-500">${a.PhoneNumber}</p></div>
          </div>
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5 text-xs ${a.Connected ? 'text-green-700 bg-green-50 border-green-200' : 'text-gray-500 bg-gray-50 border-gray-200'} border rounded-full px-2.5 py-1"><span class="w-2 h-2 rounded-full ${a.Connected ? 'bg-green-500' : 'bg-gray-400'}"></span>${a.Connected ? 'Connected' : 'Disconnected'}</span>
            <a href="/accounts/${a.ID}" class="text-xs font-medium text-brand-800 hover:text-brand-900">View →</a>
          </div>
        </div>`).join('')
    }
    content = content.replace(/<div class="divide-y divide-gray-100">[\s\S]*?<a href="\/accounts" class="mt-3[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, `<div class="divide-y divide-gray-100">${recentHtml}</div>\n    </div>\n  </div>`)
    content = content.replace(/\{\{range \.Data\.Accounts\}\}[\s\S]*?\{\{end\}\}/g, recentHtml)
  } else if (page === 'messaging') {
    content = expandRangeBlocks(content, data)
  } else {
    content = expandRangeBlocks(content, data)
  }
  let html = layoutRaw.replace(/\{\{define "layout"\}\}/, '').replace(/\{\{end\}\}\s*$/, '')
  const partials = ['sidebar','navbar','toast','public-nav','public-footer']
  for (const p of partials) {
    const re = new RegExp(`\\{\\{template "partial/${p}"[^}]*\\}\\}`, 'g')
    let part = raw(`partials/${p}.html`)
    part = part.replace(/\{\{define "[^"]*"\}\}/, '')
    part = part.replace(/\{\{end\}\}\s*$/, '')
    html = html.replace(re, part)
  }
  const components = ['badge','stat-card','empty-state']
  for (const c of components) {
    const re = new RegExp(`\\{\\{template "component/${c}"[^}]*\\}\\}`, 'g')
    let comp = raw(`components/${c}.html`)
    comp = comp.replace(/\{\{define "[^"]*"\}\}/, '')
    comp = comp.replace(/\{\{end\}\}\s*$/, '')
    html = html.replace(re, comp)
  }
  html = html.replace(/\{\{template "content"[^}]*\}\}/g, content)
  const repl: Array<[RegExp,string]> = [
    [/\{\{\.Title\}\}/g, esc(data.Title)],
    [/\{\{\.Heading\}\}/g, esc(data.Heading ?? '')],
    [/\{\{\.Version\}\}/g, esc(data.Version)],
    [/\{\{\.Page\}\}/g, esc(data.Page)],
  ]
  for (const [re, val] of repl) html = html.replace(re, val)
  html = renderGoConditionals(html, data)
  html = interpolateData(html, data)
  html = interpolateHelpers(html)
  if (html.includes('window._accountConnected') && html.includes('{{range')) {
    html = expandRangeBlocks(html, data)
  }
  return html
}
function renderGoConditionals(html: string, data: PageData): string {
  html = html.replace(/\{\{if hasPrefix \.Version "v"\}\}([\s\S]*?)\{\{else if eq \.Version "dev"\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{end\}\}/g, (_m,a,b,c) => {
    if (data.Version.startsWith('v')) return a
    if (data.Version==='dev') return b
    return c
  })
  if (data.Flash) {
    // Separate container class conditionals (no else) — use negative lookahead to avoid matching the icon chain which has {{else
    html = html.replace(/\{\{if eq \.Flash\.Type "success"\}\}((?:(?!\{\{else).)*?)\{\{end\}\}/g, (_m, inner) => (data.Flash!.Type === 'success' ? inner : ''))
    html = html.replace(/\{\{if eq \.Flash\.Type "error"\}\}((?:(?!\{\{else).)*?)\{\{end\}\}/g, (_m, inner) => (data.Flash!.Type === 'error' ? inner : ''))
    html = html.replace(/\{\{if eq \.Flash\.Type "info"\}\}((?:(?!\{\{else).)*?)\{\{end\}\}/g, (_m, inner) => (data.Flash!.Type === 'info' ? inner : ''))
    // Icon chain: {{if eq "success"}}...{{else if eq "error"}}...{{else}}...{{end}}
    html = html.replace(
      /\{\{if eq \.Flash\.Type "success"\}\}([\s\S]*?)\{\{else if eq \.Flash\.Type "error"\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{end\}\}/g,
      (_m, a, b, c) => {
        if (data.Flash!.Type === 'success') return a
        if (data.Flash!.Type === 'error') return b
        return c
      }
    )
    html = html.replace(/\{\{if \.Flash\}\}/g, '').replace(/\{\{if \.Flash\.Type[^}]+\}\}/g,'')
    html = html.replace(/\{\{\.Flash\.Type\}\}/g, esc(data.Flash.Type))
    html = html.replace(/\{\{\.Flash\.Message\}\}/g, esc(data.Flash.Message))
  } else {
    html = html.replace(/\{\{if \.Flash\}\}[\s\S]*?<\/div>\s*\{\{end\}\}/g,'')
    if (html.includes('{{if .Flash}}')) html = html.replace(/\{\{if \.Flash\}\}[\s\S]*?\{\{end\}\}/g,'')
  }
  if (data.Identity) {
    html = html.replace(/\{\{if \.Identity\}\}, \{\{\.Identity\.Username\}\}\{\{end\}\}/g, `, ${esc(data.Identity.username)}`)
    html = html.replace(/\{\{\.Identity\.Username\}\}/g, esc(data.Identity.username))
  } else {
    html = html.replace(/\{\{if \.Identity\}\}[\s\S]*?\{\{end\}\}/g,'')
  }
  html = html.replace(/\{\{if \.Identity\.HasPermission "\*"[^}]*\}\}/g, hasPerm(data.Identity,'*') ? '' : '<!--noPerm-->')
  html = html.replace(/<!--noPerm-->[\s\S]*?\{\{end\}\}/g, '')
  html = html.replace(/\{\{if[^}]*\}\}/g,'').replace(/\{\{else\}\}/g,'').replace(/\{\{end\}\}/g,'')
  html = html.replace(/\{\{-?[^}]*\$[^}]*\}\}/g,'')
  return html
}
function interpolateData(html: string, data: PageData): string {
  const d: any = data.Data ?? {}
  if (typeof d.RegistrationEnabled === 'boolean') {
    html = html.replace(/\{\{if \.Data\.RegistrationEnabled\}\}([\s\S]*?)\{\{end\}\}/g, (_m, inner) => d.RegistrationEnabled ? inner : '')
  }
  if (d.Token) html = html.replace(/\{\{\.Data\.Token\}\}/g, esc(String(d.Token)))
  html = html.replace(/\{\{\.Data\.TotalAccounts\}\}/g, String(d.TotalAccounts ?? 0))
  html = html.replace(/\{\{\.Data\.Connected\}\}/g, String(d.Connected ?? 0))
  html = html.replace(/\{\{\.Data\.Disconnected\}\}/g, String(d.Disconnected ?? 0))
  html = html.replace(/\{\{\.Data\.TotalUsers\}\}/g, String(d.TotalUsers ?? 0))
  return html
}
function interpolateHelpers(html: string): string {
  html = html.replace(/\{\{[^}]+\}\}/g, '')
  return html
}
export function renderPage(page: string, data: PageData): string {
  return evalPageTemplate(page, data)
}
export function renderFragment(html: string): string { return html }
