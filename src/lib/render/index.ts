import { readdirSync, statSync } from 'node:fs'
import { raw, getTemplatesDir, listBundled } from './cache.js'
import { normalizeAccounts } from '../normalize.js'
import { timeAgo } from '../utils.js'
import { hasPermission, type GoPageData as PageData } from '../../types/index.js'

// Auto-discover layouts/partials/components instead of hardcoding
function discover(dir: string): string[] {
  try {
    // Recursive so collections (e.g. components/forms) resolve as nested names.
    const walk = (sub: string): string[] => {
      const out: string[] = []
      for (const e of readdirSync(`${getTemplatesDir()}/${dir}${sub}`)) {
        if (statSync(`${getTemplatesDir()}/${dir}${sub}/${e}`).isDirectory()) out.push(...walk(`${sub}/${e}`))
        else if (e.endsWith('.html')) out.push(`${sub ? sub.slice(1) + '/' : ''}${e.replace('.html', '')}`)
      }
      return out
    }
    const fsList = walk('')
    if (fsList.length > 0) return fsList
  } catch {}
  // Workers / fallback: use embedded bundledTemplates (fs unavailable in Workers)
  try {
    const bundled = listBundled(dir)
    if (bundled.length > 0) return bundled
  } catch {}
  return []
}

const layoutsProd = discover('layouts')
const partialsProd = discover('partials')
const componentsProd = discover('components')

function getLayouts(): string[] {
  return process.env.NODE_ENV === 'production' ? layoutsProd : discover('layouts')
}
function getPartials(): string[] {
  return process.env.NODE_ENV === 'production' ? partialsProd : discover('partials')
}
function getComponents(): string[] {
  return process.env.NODE_ENV === 'production' ? componentsProd : discover('components')
}

// Keep explicit fallback for pageLayout but allow auto-discovery for missing
const pageLayout: Record<string, string> = {
  home: 'home',
  about: 'home',
  terms: 'home',
  privacy: 'home',
  pricing: 'home',
  dashboard: 'base',
  accounts: 'base',
  'account-detail': 'base',
  users: 'base',
  roles: 'base',
  'api-keys': 'base',
  messaging: 'base',
  mcp: 'base',
  settings: 'base',
  assistant: 'base',
  autopilot: 'base',
  billing: 'base',
  'billing-plans': 'base',
  'billing-subscriptions': 'base',
  'billing-usage': 'base',
  'admin-config': 'base',
  subscription: 'base',
  contacts: 'base',
  login: 'auth',
  register: 'auth',
  'forgot-password': 'auth',
  'reset-password': 'auth',
  error: 'auth',
  'ai-settings': 'base',
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function escAttr(s: string): string {
  return esc(s)
}

function hasPerm(id: any, perm: string): boolean {
  return hasPermission(id as any, perm)
}

function expandRangeBlocks(html: string, data: PageData): string {
  const accounts = normalizeAccounts(data.Data?.Accounts ?? data.Data?.accounts ?? [])
  if (html.includes('window._accountConnected')) {
    const connMap = accounts.map((a) => `"${escAttr(a.ID)}": ${a.Connected ? 'true' : 'false'}`).join(',\n  ')
    const metaMap = accounts.map((a) => `"${escAttr(a.ID)}": { name: "${escAttr(a.AccountName)}", phone: "${escAttr(a.PhoneNumber)}" }`).join(',\n  ')
    html = html.replace(/window\._accountConnected\s*=\s*\{[\s\S]*?\};/, `window._accountConnected = {\n  ${connMap}\n};`)
    html = html.replace(/window\._accountMeta\s*=\s*\{[\s\S]*?\};/, `window._accountMeta = {\n  ${metaMap}\n};`)
    if (html.includes('{{if .Data.Accounts}}') && html.includes('{{range .Data.Accounts}}')) {
      let pickerHtml = ''
      if (accounts.length === 0) {
        pickerHtml = `<div class="px-4 py-3 text-sm text-gray-400 text-center">No accounts yet. <a href="/accounts" class="text-brand-800 hover:underline">Create one</a></div>`
      } else {
        pickerHtml = accounts
          .map(
            (a) => `
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
          </button>`
          )
          .join('')
      }
      const fullPickerRe = /\{\{if \.Data\.Accounts\}\}\s*\{\{range \.Data\.Accounts\}\}[\s\S]*?\{\{end\}\}\s*\{\{else\}\}[\s\S]*?\{\{end\}\}/g
      if (fullPickerRe.test(html)) {
        html = html.replace(fullPickerRe, pickerHtml)
      } else {
        html = html.replace(/\{\{range \.Data\.Accounts\}\}[\s\S]*?\{\{end\}\}/g, pickerHtml)
      }
    }
  }
  return html
}

function renderGoConditionals(html: string, data: PageData): string {
  html = html.replace(
    /\{\{if hasPrefix \.Version "v"\}\}([\s\S]*?)\{\{else if eq \.Version "dev"\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{end\}\}/g,
    (_m, a, b, c) => {
      if (data.Version.startsWith('v')) return a
      if (data.Version === 'dev') return b
      return c
    }
  )
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
    html = html.replace(/\{\{if \.Flash\}\}/g, '').replace(/\{\{if \.Flash\.Type[^}]+\}\}/g, '')
    html = html.replace(/\{\{\.Flash\.Type\}\}/g, esc(data.Flash.Type))
    html = html.replace(/\{\{\.Flash\.Message\}\}/g, esc(data.Flash.Message))
  } else {
    html = html.replace(/\{\{if \.Flash\}\}[\s\S]*?<\/div>\s*\{\{end\}\}/g, '')
    if (html.includes('{{if .Flash}}')) html = html.replace(/\{\{if \.Flash\}\}[\s\S]*?\{\{end\}\}/g, '')
  }
  if (data.Identity) {
    html = html.replace(/\{\{if \.Identity\}\}, \{\{\.Identity\.Username\}\}\{\{end\}\}/g, `, ${esc(data.Identity.username)}`)
    html = html.replace(/\{\{\.Identity\.Username\}\}/g, esc(data.Identity.username))
    // upper(initial ...) for avatar circles (navbar); engine has no string ops otherwise.
    html = html.replace(/\{\{upper \(initial \.Identity\.Username\)\}\}/g, () => {
      const ch = String((data.Identity as any)?.username ?? '').trim().charAt(0).toUpperCase()
      return esc(ch || '?')
    })
  } else {
    html = html.replace(/\{\{if \.Identity\}\}[\s\S]*?\{\{end\}\}/g, '')
  }
  html = html.replace(/\{\{if \.Identity\.HasPermission "\*"[^}]*\}\}/g, hasPerm(data.Identity, '*') ? '' : '<!--noPerm-->')
  html = html.replace(/<!--noPerm-->[\s\S]*?\{\{end\}\}/g, '')
  // Handle Go template variables for sidebar ({{- $item := "..." -}} / {{$item}} etc)
  // Must be before generic if/else stripping so active states can be evaluated
  const goVars: Record<string, string> = {}
  // Extract definitions like {{- $item   := "flex ..." -}}
  html = html.replace(/\{\{-?\s*\$(\w+)\s*:=\s*"([^"]*)"\s*-?\}\}/g, (_m, name, val) => {
    goVars[name] = val
    return ''
  })
  // Also handle single-quoted variants (just in case)
  html = html.replace(/\{\{-?\s*\$(\w+)\s*:=\s*'([^']*)'\s*-?\}\}/g, (_m, name, val) => {
    goVars[name] = val
    return ''
  })
  // Fallback defaults if not found (e.g., when partial not yet inlined or definitions stripped elsewhere)
  if (!goVars['item']) goVars['item'] = 'flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors'
  if (!goVars['child']) goVars['child'] = 'flex items-center gap-2.5 ml-2 px-3 py-2 rounded-md text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors'
  if (!goVars['active']) goVars['active'] = 'bg-white/10 text-white'
  if (!goVars['label']) goVars['label'] = 'px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500'
  // Handle {{if eq .Page "xxx"}}{{$active}}{{end}} and {{if or (eq .Page "a") (eq .Page "b")}}{{$active}}{{end}}
  html = html.replace(/\{\{if eq \.Page "([^"]+)"\}\}\s*\{\{\$active\}\}\s*\{\{end\}\}/g, (_m, p) => (data.Page === p ? goVars['active'] : ''))
  html = html.replace(/\{\{if or\s*\(eq \.Page "([^"]+)"\)\s*\(eq \.Page "([^"]+)"\)\s*\}\}\s*\{\{\$active\}\}\s*\{\{end\}\}/g, (_m, p1, p2) => (data.Page === p1 || data.Page === p2 ? goVars['active'] : ''))
  // Generic or with more args (e.g., 3+) — fallback: check if Page is among listed strings
  html = html.replace(/\{\{if or([^}]+)\}\}\s*\{\{\$active\}\}\s*\{\{end\}\}/g, (m, inner) => {
    const pages = [...inner.matchAll(/"([^"]+)"/g)].map((x) => x[1])
    return pages.includes(data.Page) ? goVars['active'] : ''
  })
  // Replace remaining {{$var}} usages (e.g., class="{{$item}}", class="{{$label}}")
  html = html.replace(/\{\{\$(\w+)\}\}/g, (_m, name) => goVars[name] ?? '')
  html = html.replace(/\{\{-?\s*\$[^}]*\}\}/g, '')
  // Handle assistant AIEnabled and generic Data conditionals before generic stripping (must be after goVars but before generic if)
  const getDataByPath = (path: string): any => {
    const parts = path.split('.')
    let cur: any = data.Data
    for (const p of parts) {
      if (cur == null) return undefined
      cur = cur[p]
    }
    return cur
  }
  // Specific AIEnabled (needs to be before generic Data handling to preserve true/false)
  const aiEnabled = (data.Data as any)?.AIEnabled
  if (typeof aiEnabled === 'boolean') {
    html = html.replace(/\{\{if \.Data\.AIEnabled\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{end\}\}/g, (_m, a, b) => aiEnabled ? a : b)
    html = html.replace(/\{\{if not \.Data\.AIEnabled\}\}([\s\S]*?)\{\{end\}\}/g, (_m, inner) => !aiEnabled ? inner : '')
    html = html.replace(/\{\{if \.Data\.AIEnabled\}\}true\{\{else\}\}false\{\{end\}\}/g, aiEnabled ? 'true' : 'false')
  }
  // Generic Data.Config / Data.Connected / Data.Logs etc with else - handle User with nested if separately
  const handleUserIf = (html: string): string => {
    const startTag = '{{if .Data.User}}'
    const elseTag = '{{else}}'
    const endTag = '{{end}}'
    let result = '', lastIndex = 0
    while (true) {
      const startIdx = html.indexOf(startTag, lastIndex)
      if (startIdx === -1) { result += html.slice(lastIndex); break }
      result += html.slice(lastIndex, startIdx)
      let depth = 1, searchIdx = startIdx + startTag.length, elseIdx = -1, endIdx = -1
      while (depth > 0 && searchIdx < html.length) {
        const nextIf = html.indexOf('{{if', searchIdx)
        const nextRange = html.indexOf('{{range', searchIdx)
        const nextWith = html.indexOf('{{with', searchIdx)
        let nextOpen = -1
        if (nextIf !== -1) nextOpen = nextIf
        if (nextRange !== -1 && (nextOpen === -1 || nextRange < nextOpen)) nextOpen = nextRange
        if (nextWith !== -1 && (nextOpen === -1 || nextWith < nextOpen)) nextOpen = nextWith
        const nextElse = html.indexOf(elseTag, searchIdx)
        const nextEnd = html.indexOf(endTag, searchIdx)
        const cands: any[] = []
        if (nextOpen !== -1) cands.push({idx: nextOpen, type: 'if'})
        if (nextElse !== -1) cands.push({idx: nextElse, type: 'else'})
        if (nextEnd !== -1) cands.push({idx: nextEnd, type: 'end'})
        if (cands.length===0) break
        cands.sort((a,b)=>a.idx-b.idx)
        const nxt = cands[0]
        if (nxt.type==='if') { depth++; searchIdx = nxt.idx+4 }
        else if (nxt.type==='else' && depth===1 && elseIdx===-1) { elseIdx = nxt.idx; searchIdx = nxt.idx+elseTag.length }
        else if (nxt.type==='end') { depth--; if (depth===0) { endIdx = nxt.idx; break } searchIdx = nxt.idx+endTag.length }
        else searchIdx = nxt.idx+4
      }
      if (endIdx===-1) { result += html.slice(startIdx); break }
      const ifBlock = elseIdx!==-1 ? html.slice(startIdx+startTag.length, elseIdx) : html.slice(startIdx+startTag.length, endIdx)
      const elseBlock = elseIdx!==-1 ? html.slice(elseIdx+elseTag.length, endIdx) : ''
      const v = getDataByPath('User')
      const truthy = Array.isArray(v) ? v.length>0 : !!v
      result += truthy ? ifBlock : elseBlock
      lastIndex = endIdx + endTag.length
    }
    return result
  }
  html = handleUserIf(html)
  // Depth-aware generic .Data conditionals. The old blind regexes paired an
  // {{if}} with a far-away {{else}}/{{end}} from an unrelated block (e.g. an
  // if without else swallowing content up to the next block's else), silently
  // deleting page regions. Match with nesting depth like handleUsersIf does.
  const evalDataIfs = (src: string): string => {
    const openRe = /\{\{if (not )?(\.Data\.[A-Za-z0-9_.]+)\}\}/g
    let result = '', rest = src
    for (let guard = 0; guard < 50; guard++) {
      openRe.lastIndex = 0
      const om = openRe.exec(rest)
      if (!om) break
      const neg = !!om[1]
      const path = om[2].slice(6)
      // scan with depth counting; record top-level exact {{else}} only
      // ({{else if ...}} belongs to chains handled by specific handlers)
      let depth = 1, idx = om.index + om[0].length, elseIdx = -1, endIdx = -1
      while (depth > 0 && idx < rest.length) {
        const ni = rest.indexOf('{{if', idx)
        const nr = rest.indexOf('{{range', idx)
        const nw = rest.indexOf('{{with', idx)
        const ne = rest.indexOf('{{else}}', idx)
        const nd = rest.indexOf('{{end}}', idx)
        const cands: Array<{ i: number; t: string }> = []
        if (ni !== -1) cands.push({ i: ni, t: 'open' })
        if (nr !== -1) cands.push({ i: nr, t: 'open' })
        if (nw !== -1) cands.push({ i: nw, t: 'open' })
        if (ne !== -1) cands.push({ i: ne, t: 'else' })
        if (nd !== -1) cands.push({ i: nd, t: 'end' })
        if (!cands.length) break
        cands.sort((a, b) => a.i - b.i)
        const nx = cands[0]
        if (nx.t === 'open') { depth++; idx = nx.i + 4 }
        else if (nx.t === 'else' && depth === 1 && elseIdx === -1) { elseIdx = nx.i; idx = nx.i + 8 }
        else if (nx.t === 'end') {
          depth--
          if (depth === 0) { endIdx = nx.i; break }
          idx = nx.i + 7
        } else { idx = nx.i + 4 }
      }
      if (endIdx === -1) break // unbalanced: leave rest untouched
      const a = rest.slice(om.index + om[0].length, elseIdx !== -1 ? elseIdx : endIdx)
      const b = elseIdx !== -1 ? rest.slice(elseIdx + 8, endIdx) : ''
      const v = getDataByPath(path)
      const truthy = Array.isArray(v) ? v.length > 0 : !!v
      const keep = neg ? !truthy : truthy
      result += rest.slice(0, om.index) + (keep ? a : b)
      rest = rest.slice(endIdx + 7)
    }
    return result + rest
  }
  html = evalDataIfs(html)
  // Handle inline checked and true/false for Config
  html = html.replace(/\{\{if \.Data\.Config\.Enabled\}\}checked\{\{end\}\}/g, getDataByPath('Config.Enabled') ? 'checked' : '')
  html = html.replace(/\{\{if \.Data\.Config\.EscalationEnabled\}\}checked\{\{end\}\}/g, getDataByPath('Config.EscalationEnabled') ? 'checked' : '')
  html = html.replace(/\{\{if \.Data\.Config\.EscalationEnabled\}\}true\{\{else\}\}false\{\{end\}\}/g, getDataByPath('Config.EscalationEnabled') ? 'true' : 'false')
  html = html.replace(/\{\{if \.Data\.Config\.Enabled\}\}true\{\{else\}\}false\{\{end\}\}/g, getDataByPath('Config.Enabled') ? 'true' : 'false')
  // Settings: handle User RoleName eq and User Email
  html = html.replace(/\{\{if eq \.Data\.User\.RoleName "admin"\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{end\}\}/g, (_m, a, b) => {
    const v = getDataByPath('User.RoleName') ?? getDataByPath('User.role_name') ?? getDataByPath('User.roleName')
    return v === 'admin' ? a : b
  })
  html = html.replace(/\{\{if \.Data\.User\.Email\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{end\}\}/g, (_m, a, b) => {
    const v = getDataByPath('User.Email') ?? getDataByPath('User.email')
    return v ? a : b
  })
  // Settings: handle Currency and Timezone selected
  html = html.replace(/\{\{if eq \.Data\.Currency "([^"]+)"\}\}selected\{\{end\}\}/g, (_m, val) => {
    const cur = getDataByPath('Currency')
    return cur === val ? 'selected' : ''
  })
  html = html.replace(/\{\{if eq \.Data\.Timezone "([^"]+)"\}\}selected\{\{end\}\}/g, (_m, val) => {
    const tz = getDataByPath('Timezone')
    return tz === val ? 'selected' : ''
  })
  html = html.replace(/\{\{if[^}]*\}\}/g, '').replace(/\{\{else\}\}/g, '').replace(/\{\{end\}\}/g, '')
  return html
}

function interpolateData(html: string, data: PageData): string {
  const d: any = data.Data ?? {}
  if (typeof d.RegistrationEnabled === 'boolean') {
    html = html.replace(/\{\{if \.Data\.RegistrationEnabled\}\}([\s\S]*?)\{\{end\}\}/g, (_m, inner) => (d.RegistrationEnabled ? inner : ''))
  }
  if (d.Token) html = html.replace(/\{\{\.Data\.Token\}\}/g, esc(String(d.Token)))
  html = html.replace(/\{\{\.Data\.TotalAccounts\}\}/g, String(d.TotalAccounts ?? 0))
  html = html.replace(/\{\{\.Data\.Connected\}\}/g, String(d.Connected ?? 0))
  html = html.replace(/\{\{\.Data\.Disconnected\}\}/g, String(d.Disconnected ?? 0))
  html = html.replace(/\{\{\.Data\.TotalUsers\}\}/g, String(d.TotalUsers ?? 0))
  // Account-detail: support Account fields and webhook/proxy JSON (raw, not escaped)
  if (d.Account) {
    const acc: any = d.Account
    html = html.replace(/\{\{\.Data\.Account\.ID\}\}/g, escAttr(String(acc.ID ?? acc.id ?? '')))
    html = html.replace(/\{\{\.Data\.Account\.AccountName\}\}/g, esc(String(acc.AccountName ?? acc.accountName ?? '')))
    html = html.replace(/\{\{\.Data\.Account\.PhoneNumber\}\}/g, esc(String(acc.PhoneNumber ?? acc.phoneNumber ?? '')))
    // Fallback lower-case variants
    html = html.replace(/\{\{\.Data\.Account\.id\}\}/g, escAttr(String(acc.ID ?? '')))
  }
  // Settings: support User fields
  if (d.User) {
    const u: any = d.User
    html = html.replace(/\{\{\.Data\.User\.Username\}\}/g, esc(String(u.Username ?? u.username ?? '')))
    html = html.replace(/\{\{\.Data\.User\.Email\}\}/g, esc(String(u.Email ?? u.email ?? '')))
    html = html.replace(/\{\{\.Data\.User\.RoleName\}\}/g, esc(String(u.RoleName ?? u.role_name ?? u.roleName ?? '')))
    html = html.replace(/\{\{\.Data\.User\.CreatedAt\}\}/g, esc(String(u.CreatedAt ?? u.created_at ?? '')))
    html = html.replace(/\{\{timeAgo \.Data\.User\.CreatedAt\}\}/g, esc(timeAgo(String(u.CreatedAt ?? u.created_at ?? ''))))
  }
  // Settings: generic fields
  if (d.AppName !== undefined) html = html.replace(/\{\{\.Data\.AppName\}\}/g, esc(String(d.AppName ?? '')))
  if (d.AppTagline !== undefined) html = html.replace(/\{\{\.Data\.AppTagline\}\}/g, esc(String(d.AppTagline ?? '')))
  if (d.Currency !== undefined) html = html.replace(/\{\{\.Data\.Currency\}\}/g, esc(String(d.Currency ?? '')))
  if (d.Timezone !== undefined) html = html.replace(/\{\{\.Data\.Timezone\}\}/g, esc(String(d.Timezone ?? '')))
  if (d.WebhookJSON !== undefined) html = html.replace(/\{\{\.Data\.WebhookJSON\}\}/g, String(d.WebhookJSON ?? 'null'))
  if (d.ProxyJSON !== undefined) html = html.replace(/\{\{\.Data\.ProxyJSON\}\}/g, String(d.ProxyJSON ?? 'null'))
  // Assistant: AIEnabled, Provider, Model, History
  if (typeof d.AIEnabled === 'boolean') {
    // Handle {{if .Data.AIEnabled}} ... {{else}} ... {{end}} for assistant header
    html = html.replace(/\{\{if \.Data\.AIEnabled\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{end\}\}/g, (_m, a, b) => (d.AIEnabled ? a : b))
    html = html.replace(/\{\{if not \.Data\.AIEnabled\}\}([\s\S]*?)\{\{end\}\}/g, (_m, inner) => (!d.AIEnabled ? inner : ''))
  }
  if (d.Provider !== undefined) html = html.replace(/\{\{\.Data\.Provider\}\}/g, esc(String(d.Provider ?? '')))
  if (d.Model !== undefined) html = html.replace(/\{\{\.Data\.Model\}\}/g, esc(String(d.Model ?? '')))
  if (d.History !== undefined) {
    const hist = d.History ?? []
    html = html.replace(/\{\{\.Data\.History \| json\}\}/g, JSON.stringify(hist))
    html = html.replace(/\{\{\.Data\.History\}\}/g, JSON.stringify(hist))
  }
  // Handle {{if .Data.AIEnabled}}true{{else}}false{{end}} inside Alpine disabled attributes
  html = html.replace(/\{\{if \.Data\.AIEnabled\}\}true\{\{else\}\}false\{\{end\}\}/g, d.AIEnabled ? 'true' : 'false')
  // New: support year helper that was previously stripped
  html = html.replace(/\{\{now\.Year\}\}/g, String(new Date().getFullYear()))
  return html
}

function interpolateHelpers(html: string): string {
  // Keep hx-* and Alpine attributes, strip only truly unknown Go templates
  // Previously stripped all {{...}}, now preserve known helpers and strip rest
  return html.replace(/\{\{[^}]+\}\}/g, (m) => {
    if (m.includes('hx-') || m.includes('x-') || m.includes('@click')) return m
    // Preserve already handled ones, otherwise strip
    return ''
  })
}

function evalPageTemplate(page: string, data: PageData): string {
  const layouts = getLayouts()
  const partials = getPartials()
  const components = getComponents()
  const layoutName = pageLayout[page] ?? (layouts.includes(page) ? page : 'base')
  const layoutRaw = raw(`layouts/${layoutName}.html`)
  const pageRaw = raw(`pages/${page}.html`)
  const contentMatch = pageRaw.match(/\{\{define "content"\}\}([\s\S]*)\{\{end\}\}\s*$/)
  const contentRaw = contentMatch
    ? contentMatch[1]
    : (() => {
        let c = pageRaw.replace(/\{\{define "content"\}\}/, '')
        const lastEnd = c.lastIndexOf('{{end}}')
        if (lastEnd !== -1) c = c.slice(0, lastEnd)
        return c
      })()
  let content = contentRaw
  if (page === 'accounts') {
    const accounts = normalizeAccounts(data.Data?.Accounts ?? [])
    let rowsHtml = ''
    if (accounts.length === 0) {
      rowsHtml = `<tr><td colspan="5"><div class="px-5 py-12 text-center"><p class="text-sm text-gray-500">No accounts yet.</p></div></td></tr>`
    } else {
      rowsHtml = accounts
        .map(
          (a) => `
          <tr class="hover:bg-gray-50 transition-colors">
            <td class="px-5 py-3"><a href="/accounts/${escAttr(a.ID)}" class="font-medium text-gray-900 hover:text-brand-800">${esc(a.AccountName)}</a></td>
            <td class="px-5 py-3 text-gray-500">${esc(a.PhoneNumber)}</td>
            <td class="px-5 py-3">${a.Connected ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Connected</span>` : `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Disconnected</span>`}</td>
            <td class="px-5 py-3 text-gray-500">${esc(timeAgo(a.CreatedAt))}</td>
            <td class="px-5 py-3 text-right"><div class="flex items-center justify-end gap-3"><a href="/accounts/${escAttr(a.ID)}/chat" class="text-sm font-medium text-green-700 hover:text-green-800">Chat</a><a href="/accounts/${escAttr(a.ID)}/autopilot" class="text-sm font-medium text-violet-600">Autopilot</a><a href="/accounts/${escAttr(a.ID)}" class="text-brand-800 text-sm font-medium">Manage →</a></div></td>
          </tr>`
        )
        .join('')
    }
    content = content.replace(/<tbody class="divide-y divide-gray-50">[\s\S]*?<\/tbody>/, `<tbody class="divide-y divide-gray-50">${rowsHtml}</tbody>`)
  } else if (page === 'dashboard') {
    const accounts = normalizeAccounts(data.Data?.Accounts ?? [])
    let recentHtml = ''
    if (accounts.length === 0) {
      recentHtml = `<div class="px-5 py-12 text-center"><p class="text-sm text-gray-500">No accounts yet.</p></div>`
    } else {
      recentHtml = accounts
        .map(
          (a) => `
        <div class="px-5 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">${(a.AccountName?.[0] ?? '?').toUpperCase()}</div>
            <div><p class="text-sm font-medium text-gray-900">${a.AccountName}</p><p class="text-xs text-gray-500">${a.PhoneNumber}</p></div>
          </div>
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5 text-xs ${a.Connected ? 'text-green-700 bg-green-50 border-green-200' : 'text-gray-500 bg-gray-50 border-gray-200'} border rounded-full px-2.5 py-1"><span class="w-2 h-2 rounded-full ${a.Connected ? 'bg-green-500' : 'bg-gray-400'}"></span>${a.Connected ? 'Connected' : 'Disconnected'}</span>
            <a href="/accounts/${a.ID}" class="text-xs font-medium text-brand-800 hover:text-brand-900">View →</a>
          </div>
        </div>`
        )
        .join('')
    }
    content = content.replace(/<div class="divide-y divide-gray-100">[\s\S]*?<a href="\/accounts" class="mt-3[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, `<div class="divide-y divide-gray-100">${recentHtml}</div>\n    </div>\n  </div>`)
    content = content.replace(/\{\{range \.Data\.Accounts\}\}[\s\S]*?\{\{end\}\}/g, recentHtml)
  } else if (page === 'users') {
    const users: any[] = Array.isArray((data.Data as any)?.Users) ? (data.Data as any).Users : ((data.Data as any)?.users ?? [])
    const roles: any[] = Array.isArray((data.Data as any)?.Roles) ? (data.Data as any).Roles : ((data.Data as any)?.roles ?? [])
    const rolesOptions = roles.map((r: any) => `<option value="${escAttr(String(r.ID ?? r.id ?? ''))}">${esc(String(r.Name ?? r.name ?? ''))}</option>`).join('')
    // Handle {{range .Data.Roles}} for select options (appears in Create/Edit modals) - do this first before handling the main if
    content = content.replace(/\{\{range \.Data\.Roles\}\}[\s\S]*?\{\{end\}\}/g, rolesOptions)
    // Handle main users table {{if .Data.Users}} ... {{else}} ... {{end}} with proper nesting via helper
    const hasUsers = users.length > 0
    // Helper to correctly handle nested {{if}} by finding matching {{end}}
    const handleUsersIf = (html: string): string => {
      const startTag = '{{if .Data.Users}}'
      const elseTag = '{{else}}'
      const endTag = '{{end}}'
      let result = ''
      let lastIndex = 0
      while (true) {
        const startIdx = html.indexOf(startTag, lastIndex)
        if (startIdx === -1) {
          result += html.slice(lastIndex)
          break
        }
        result += html.slice(lastIndex, startIdx)
        // Find matching end by counting nesting (handle {{if, {{range, {{with)
        let depth = 1
        let searchIdx = startIdx + startTag.length
        let elseIdx = -1
        let endIdx = -1
        while (depth > 0 && searchIdx < html.length) {
          const nextIf = html.indexOf('{{if', searchIdx)
          const nextRange = html.indexOf('{{range', searchIdx)
          const nextWith = html.indexOf('{{with', searchIdx)
          let nextOpen = -1
          if (nextIf !== -1) nextOpen = nextIf
          if (nextRange !== -1 && (nextOpen === -1 || nextRange < nextOpen)) nextOpen = nextRange
          if (nextWith !== -1 && (nextOpen === -1 || nextWith < nextOpen)) nextOpen = nextWith
          const nextElse = html.indexOf(elseTag, searchIdx)
          const nextEnd = html.indexOf(endTag, searchIdx)
          const candidates = [
            nextOpen !== -1 ? { idx: nextOpen, type: 'if' as const } : null,
            nextElse !== -1 ? { idx: nextElse, type: 'else' as const } : null,
            nextEnd !== -1 ? { idx: nextEnd, type: 'end' as const } : null,
          ].filter(Boolean) as Array<{ idx: number; type: 'if' | 'else' | 'end' }>
          if (candidates.length === 0) break
          candidates.sort((a, b) => a.idx - b.idx)
          const next = candidates[0]
          if (next.type === 'if') {
            depth++
            searchIdx = next.idx + 4
          } else if (next.type === 'else' && depth === 1 && elseIdx === -1) {
            elseIdx = next.idx
            searchIdx = next.idx + elseTag.length
          } else if (next.type === 'end') {
            depth--
            if (depth === 0) {
              endIdx = next.idx
              break
            }
            searchIdx = next.idx + endTag.length
          } else {
            searchIdx = next.idx + 4
          }
        }
        if (endIdx === -1) {
          result += html.slice(startIdx)
          break
        }
        const ifBlock = elseIdx !== -1 ? html.slice(startIdx + startTag.length, elseIdx) : html.slice(startIdx + startTag.length, endIdx)
        const elseBlock = elseIdx !== -1 ? html.slice(elseIdx + elseTag.length, endIdx) : ''
        if (hasUsers) {
          const rowsHtml = users.map((u: any) => {
            const enabled = !!(u.Enabled ?? (u as any).enabled)
            const roleName = String(u.RoleName ?? (u as any).role_name ?? u.roleName ?? '')
            const roleClass = roleName === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
            const uEmail: any = (u as any).Email ?? (u as any).email
            const emailCell = uEmail ? esc(String(uEmail)) : '<span class="text-gray-300">—</span>'
            const statusCell = enabled ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>' : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Disabled</span>'
            return `
        <tr class="hover:bg-gray-50 transition-colors">
          <td class="px-4 py-3 font-medium text-gray-900">${esc(String(u.Username ?? u.username ?? ''))}</td>
          <td class="px-4 py-3 text-gray-500">${emailCell}</td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleClass}">
              ${esc(roleName)}
            </span>
          </td>
          <td class="px-4 py-3">
            ${statusCell}
          </td>
          <td class="px-4 py-3 text-gray-500">${esc(timeAgo(String(u.CreatedAt ?? u.created_at ?? '')))}</td>
          <td class="px-4 py-3 text-right">
            <div class="flex items-center justify-end gap-1">
              <button @click="editUser = { id: '${escAttr(String(u.ID ?? (u as any).id ?? ''))}', username: '${escAttr(String(u.Username ?? (u as any).username ?? ''))}', email: '${escAttr(String((u as any).Email ?? (u as any).email ?? ''))}', roleID: '${escAttr(String(u.RoleID ?? (u as any).role_id ?? (u as any).roleID ?? ''))}', enabled: ${enabled ? 'true' : 'false'} }"
                class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Edit">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              </button>
              <button @click="resetUser = { id: '${escAttr(String(u.ID ?? (u as any).id ?? ''))}', username: '${escAttr(String(u.Username ?? (u as any).username ?? ''))}' }"
                class="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors" title="Reset Password">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </button>
              <form method="POST" action="/admin/users/${escAttr(String(u.ID ?? (u as any).id ?? ''))}/delete" hx-boost="false"
                onsubmit="return confirm('Delete user ${escAttr(String(u.Username ?? (u as any).username ?? ''))}? This cannot be undone.')">
                <button type="submit"
                  class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </form>
            </div>
          </td>
        </tr>`
          }).join('')
          let tableHtml = ifBlock
          const beforeMatch = tableHtml.match(/<tbody[^>]*>[\s\S]*?<\/tbody>/)
          tableHtml = tableHtml.replace(/<tbody[^>]*>[\s\S]*?<\/tbody>/, () => `<tbody class="divide-y divide-gray-100">${rowsHtml}</tbody>`)
          tableHtml = tableHtml.replace(/\{\{[^}]+\}\}/g, (m: string) => (m.includes('hx-')||m.includes('x-')?m:''))
          result += tableHtml
        } else {
          result += elseBlock
        }
        lastIndex = endIdx + endTag.length
      }
      return result
    }
    content = handleUsersIf(content)
    // Fallback: if still has stray {{range .Data.Users}} (when no outer if), expand it
    if (content.includes('{{range .Data.Users}}')) {
      const users2: any[] = users
      const rowsHtml2 = users2.map((u: any) => {
        const enabled = !!u.Enabled
        return `<tr><td>${esc(String(u.Username ?? ''))}</td><td>${enabled ? 'true' : 'false'}</td></tr>`
      }).join('')
      content = content.replace(/\{\{range \.Data\.Users\}\}[\s\S]*?\{\{end\}\}/g, rowsHtml2)
    }
    // Ensure any remaining {{range .Data.Roles}} (if not already replaced) is handled
    if (content.includes('{{range .Data.Roles}}')) {
      content = content.replace(/\{\{range \.Data\.Roles\}\}[\s\S]*?\{\{end\}\}/g, rolesOptions)
    }
    // Handle inline {{if .Email}} etc that may remain
    content = content.replace(/\{\{if \.Email\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{end\}\}/g, (_m, a, b) => a.includes('{{.Email}}') ? a.replace(/\{\{\.Email\}\}/g, (data.Data as any)?.Users?.[0]?.Email ? esc(String((data.Data as any).Users[0].Email)) : '') : b)
  } else if (page === 'roles') {
    const roles: any[] = Array.isArray((data.Data as any)?.Roles) ? (data.Data as any).Roles : ((data.Data as any)?.roles ?? [])
    const hasRoles = roles.length > 0
    // Use helper to correctly handle nested {{if}} for {{if .Data.Roles}} ... {{else}} ... {{end}}
    const handleRolesIfInner = (html: string): string => {
      const startTag = '{{if .Data.Roles}}'
      const elseTag = '{{else}}'
      const endTag = '{{end}}'
      let result = ''
      let lastIndex = 0
      while (true) {
        const startIdx = html.indexOf(startTag, lastIndex)
        if (startIdx === -1) {
          result += html.slice(lastIndex)
          break
        }
        result += html.slice(lastIndex, startIdx)
        let depth = 1
        let searchIdx = startIdx + startTag.length
        let elseIdx = -1
        let endIdx = -1
        while (depth > 0 && searchIdx < html.length) {
          const nextIf = html.indexOf('{{if', searchIdx)
          const nextRange = html.indexOf('{{range', searchIdx)
          const nextWith = html.indexOf('{{with', searchIdx)
          let nextOpen = -1
          if (nextIf !== -1) nextOpen = nextIf
          if (nextRange !== -1 && (nextOpen === -1 || nextRange < nextOpen)) nextOpen = nextRange
          if (nextWith !== -1 && (nextOpen === -1 || nextWith < nextOpen)) nextOpen = nextWith
          const nextElse = html.indexOf(elseTag, searchIdx)
          const nextEnd = html.indexOf(endTag, searchIdx)
          const candidates = [
            nextOpen !== -1 ? { idx: nextOpen, type: 'if' as const } : null,
            nextElse !== -1 ? { idx: nextElse, type: 'else' as const } : null,
            nextEnd !== -1 ? { idx: nextEnd, type: 'end' as const } : null,
          ].filter(Boolean) as Array<{ idx: number; type: 'if' | 'else' | 'end' }>
          if (candidates.length === 0) break
          candidates.sort((a, b) => a.idx - b.idx)
          const next = candidates[0]
          if (next.type === 'if') {
            depth++
            searchIdx = next.idx + 4
          } else if (next.type === 'else' && depth === 1 && elseIdx === -1) {
            elseIdx = next.idx
            searchIdx = next.idx + elseTag.length
          } else if (next.type === 'end') {
            depth--
            if (depth === 0) {
              endIdx = next.idx
              break
            }
            searchIdx = next.idx + endTag.length
          } else {
            searchIdx = next.idx + 4
          }
        }
        if (endIdx === -1) {
          result += html.slice(startIdx)
          break
        }
        const ifBlock = elseIdx !== -1 ? html.slice(startIdx + startTag.length, elseIdx) : html.slice(startIdx + startTag.length, endIdx)
        const elseBlock = elseIdx !== -1 ? html.slice(elseIdx + elseTag.length, endIdx) : ''
        if (hasRoles) {
          const rowsHtml = roles.map((r: any) => {
            const isBuiltin = !!(r.IsBuiltin ?? r.is_builtin ?? (r as any).isBuiltin)
            const permsRaw: any = (r as any).Permissions ?? (r as any).permissions
            const perms: string[] = Array.isArray(permsRaw) ? permsRaw : (typeof permsRaw === 'string' ? permsRaw.split(',').map((s: string) => s.trim()).filter(Boolean) : [])
            const permsHtml = perms.map((p) => `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-mono">${esc(p)}</span>`).join('')
            const typeBadge = isBuiltin ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Built-in</span>' : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Custom</span>'
            const permsStr = perms.join(', ')
            const rName: string = String((r as any).Name ?? (r as any).name ?? '')
            const rDesc: string | undefined = (r as any).Description ?? (r as any).description
            const rUserCount: any = (r as any).UserCount ?? (r as any).user_count ?? (r as any).userCount ?? ''
            return `
        <tr class="hover:bg-gray-50 transition-colors">
          <td class="px-4 py-3 font-medium text-gray-900">${esc(rName)}</td>
          <td class="px-4 py-3 text-gray-500">${rDesc ? esc(String(rDesc)) : '<span class="text-gray-300">—</span>'}</td>
          <td class="px-4 py-3">
            <div class="flex flex-wrap gap-1">
              ${permsHtml}
            </div>
          </td>
          <td class="px-4 py-3 text-gray-500">${esc(String(rUserCount))}</td>
          <td class="px-4 py-3">
            ${typeBadge}
          </td>
          <td class="px-4 py-3 text-right">
            <div class="flex items-center justify-end gap-1">
              <button @click="editRole = { id: '${escAttr(String((r as any).ID ?? (r as any).id ?? ''))}', name: '${escAttr(rName)}', description: '${escAttr(String(rDesc ?? ''))}', permissions: '${escAttr(permsStr)}', isBuiltin: ${isBuiltin ? 'true' : 'false'} }"
                class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Edit">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              </button>
              ${!isBuiltin ? `<form method="POST" action="/admin/roles/${escAttr(String((r as any).ID ?? (r as any).id ?? ''))}/delete" hx-boost="false"
                onsubmit="return confirm('Delete role ${escAttr(rName)}?')">
                <button type="submit"
                  class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </form>` : ''}
            </div>
          </td>
        </tr>`
        }).join('')
        let tableHtml = ifBlock
        tableHtml = tableHtml.replace(/<tbody[^>]*>[\s\S]*?<\/tbody>/, `<tbody class="divide-y divide-gray-100">${rowsHtml}</tbody>`)
        tableHtml = tableHtml.replace(/\{\{[^}]+\}\}/g, (m: string) => (m.includes('hx-') || m.includes('x-') ? m : ''))
        result += tableHtml
      } else {
        result += elseBlock
      }
      lastIndex = endIdx + endTag.length
      }
      return result
    }
    content = handleRolesIfInner(content)
    // Fallback for stray {{range .Data.Roles}} (when no outer if)
    if (content.includes('{{range .Data.Roles}}')) {
      const roles2: any[] = roles
      const rolesOptionsFallback = roles2.map((r: any) => `<option value="${escAttr(String(r.ID ?? r.id ?? ''))}">${esc(String(r.Name ?? r.name ?? ''))}</option>`).join('')
      content = content.replace(/\{\{range \.Data\.Roles\}\}[\s\S]*?\{\{end\}\}/g, rolesOptionsFallback)
    }
    } else if (page === 'api-keys') {
    const keys: any[] = Array.isArray((data.Data as any)?.Keys) ? (data.Data as any).Keys : ((data.Data as any)?.keys ?? (data.Data as any)?.api_keys ?? [])
    const accounts = normalizeAccounts((data.Data as any)?.Accounts ?? (data.Data as any)?.accounts ?? [])
    // Handle accounts dropdown for create modal
    const accountsOptions = accounts.map((a: any) => `<option value="${escAttr(String(a.ID))}">${esc(a.AccountName)} (${esc(a.PhoneNumber)})</option>`).join('')
    content = content.replace(/\{\{range \.Data\.Accounts\}\}[\s\S]*?\{\{end\}\}/g, accountsOptions || '')
    // Handle keys table with proper nesting for {{if .Data.Keys}} ... {{else}} ... {{end}}
    const hasKeys = keys.length > 0
    const handleKeysIf = (html: string): string => {
      const startTag = '{{if .Data.Keys}}'
      const elseTag = '{{else}}'
      const endTag = '{{end}}'
      let result = ''
      let lastIndex = 0
      while (true) {
        const startIdx = html.indexOf(startTag, lastIndex)
        if (startIdx === -1) { result += html.slice(lastIndex); break }
        result += html.slice(lastIndex, startIdx)
        let depth = 1, searchIdx = startIdx + startTag.length, elseIdx = -1, endIdx = -1
        while (depth > 0 && searchIdx < html.length) {
          const nextIf = html.indexOf('{{if', searchIdx)
          const nextRange = html.indexOf('{{range', searchIdx)
          const nextWith = html.indexOf('{{with', searchIdx)
          let nextOpen = -1
          if (nextIf !== -1) nextOpen = nextIf
          if (nextRange !== -1 && (nextOpen === -1 || nextRange < nextOpen)) nextOpen = nextRange
          if (nextWith !== -1 && (nextOpen === -1 || nextWith < nextOpen)) nextOpen = nextWith
          const nextElse = html.indexOf(elseTag, searchIdx)
          const nextEnd = html.indexOf(endTag, searchIdx)
          const candidates: Array<{idx:number,type:'if'|'else'|'end'}> = [
            nextOpen !== -1 ? {idx: nextOpen, type: 'if'} : null,
            nextElse !== -1 ? {idx: nextElse, type: 'else'} : null,
            nextEnd !== -1 ? {idx: nextEnd, type: 'end'} : null,
          ].filter(Boolean) as any
          if (candidates.length===0) break
          candidates.sort((a,b)=>a.idx-b.idx)
          const next = candidates[0]
          if (next.type==='if') { depth++; searchIdx = next.idx+4 }
          else if (next.type==='else' && depth===1 && elseIdx===-1) { elseIdx = next.idx; searchIdx = next.idx+elseTag.length }
          else if (next.type==='end') { depth--; if (depth===0) { endIdx = next.idx; break } searchIdx = next.idx+endTag.length }
          else searchIdx = next.idx+4
        }
        if (endIdx===-1) { result += html.slice(startIdx); break }
        const ifBlock = elseIdx!==-1 ? html.slice(startIdx+startTag.length, elseIdx) : html.slice(startIdx+startTag.length, endIdx)
        const elseBlock = elseIdx!==-1 ? html.slice(elseIdx+elseTag.length, endIdx) : ''
        if (hasKeys) {
          const rowsHtml = keys.map((k: any) => {
            const kName = String(k.Name ?? k.name ?? '')
            const kPrefix = String(k.Prefix ?? k.prefix ?? '')
            const kAccountID = String(k.AccountID ?? k.account_id ?? k.accountId ?? '')
            const kEnabled = !!(k.Enabled ?? k.enabled)
            const kLastUsed = String(k.LastUsed ?? k.last_used ?? '')
            const kExpiresAt = String(k.ExpiresAt ?? k.expires_at ?? '')
            const kCreatedAt = String(k.CreatedAt ?? k.created_at ?? '')
            const kID = String(k.ID ?? k.id ?? '')
            const accountCell = kAccountID ? esc(kAccountID.slice(0,8)) : '<span class="text-gray-300">all</span>'
            const statusBadge = kEnabled ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>' : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Disabled</span>'
            const lastUsedCell = kLastUsed ? esc(timeAgo(kLastUsed)) : '<span class="text-gray-300">never</span>'
            const expiresCell = kExpiresAt ? esc(timeAgo(kExpiresAt)) : '<span class="text-gray-300">never</span>'
            return `<tr class="hover:bg-gray-50 transition-colors"><td class="px-4 py-3 font-medium text-gray-900">${esc(kName)}</td><td class="px-4 py-3"><code class="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">${esc(kPrefix)}…</code></td><td class="px-4 py-3 text-gray-500">${accountCell}</td><td class="px-4 py-3">${statusBadge}</td><td class="px-4 py-3 text-gray-500">${lastUsedCell}</td><td class="px-4 py-3 text-gray-500">${expiresCell}</td><td class="px-4 py-3 text-gray-500">${esc(timeAgo(kCreatedAt))}</td><td class="px-4 py-3 text-right"><button @click="deleteID = '${escAttr(kID)}'; deleteName = '${escAttr(kName)}'; deleteOpen = true" class="text-red-500 hover:text-red-700 text-sm font-medium">Revoke</button></td></tr>`
          }).join('')
          let tableHtml = ifBlock
          const m = ifBlock.match(/<tbody[^>]*>[\s\S]*?<\/tbody>/)
          tableHtml = tableHtml.replace(/<tbody[^>]*>[\s\S]*?<\/tbody>/, () => `<tbody class="divide-y divide-gray-100">${rowsHtml}</tbody>`)
          tableHtml = tableHtml.replace(/\{\{[^}]+\}\}/g, (m: string) => (m.includes('hx-')||m.includes('x-')?m:''))
          result += tableHtml
        } else {
          result += elseBlock
        }
        lastIndex = endIdx + endTag.length
      }
      return result
    }
    content = handleKeysIf(content)
    // Fallback for any remaining {{range .Data.Keys}} outside if
    if (content.includes('{{range .Data.Keys}}')) {
      const fallbackRows = keys.map((k: any) => `<tr><td>${esc(String(k.Name ?? k.name ?? ''))}</td></tr>`).join('')
      content = content.replace(/\{\{range \.Data\.Keys\}\}[\s\S]*?\{\{end\}\}/g, fallbackRows)
    }
    if (content.includes('{{range .Data.Accounts}}')) {
      content = content.replace(/\{\{range \.Data\.Accounts\}\}[\s\S]*?\{\{end\}\}/g, accountsOptions)
    }
    } else if (page === 'contacts') {
      const contacts: any[] = Array.isArray((data.Data as any)?.Contacts) ? (data.Data as any).Contacts : ((data.Data as any)?.contacts ?? [])
      const groups: any[] = Array.isArray((data.Data as any)?.Groups) ? (data.Data as any).Groups : ((data.Data as any)?.groups ?? [])
      const q: string = String((data.Data as any)?.Q ?? '')
      const groupFilter: string = String((data.Data as any)?.GroupFilter ?? (data.Data as any)?.group_id ?? '')
      // Handle contacts table {{if .Data.Contacts}} ... {{range .Data.Contacts}} ... {{else}} ... {{end}}
      const hasContacts = contacts.length > 0
      const handleContactsIf = (html: string): string => {
        const startTag = '{{if .Data.Contacts}}'
        const elseTag = '{{else}}'
        const endTag = '{{end}}'
        let result = ''
        let lastIndex = 0
        while (true) {
          const startIdx = html.indexOf(startTag, lastIndex)
          if (startIdx === -1) { result += html.slice(lastIndex); break }
          result += html.slice(lastIndex, startIdx)
          let depth = 1, searchIdx = startIdx + startTag.length, elseIdx = -1, endIdx = -1
          while (depth > 0 && searchIdx < html.length) {
            const nextIf = html.indexOf('{{if', searchIdx)
            const nextRange = html.indexOf('{{range', searchIdx)
            const nextWith = html.indexOf('{{with', searchIdx)
            let nextOpen = -1
            if (nextIf !== -1) nextOpen = nextIf
            if (nextRange !== -1 && (nextOpen === -1 || nextRange < nextOpen)) nextOpen = nextRange
            if (nextWith !== -1 && (nextOpen === -1 || nextWith < nextOpen)) nextOpen = nextWith
            const nextElse = html.indexOf(elseTag, searchIdx)
            const nextEnd = html.indexOf(endTag, searchIdx)
            const cands: Array<{idx:number,type:'if'|'else'|'end'}> = [
              nextOpen !== -1 ? {idx: nextOpen, type: 'if'} : null,
              nextElse !== -1 ? {idx: nextElse, type: 'else'} : null,
              nextEnd !== -1 ? {idx: nextEnd, type: 'end'} : null,
            ].filter(Boolean) as any
            if (cands.length===0) break
            cands.sort((a,b)=>a.idx-b.idx)
            const nxt = cands[0]
            if (nxt.type==='if') { depth++; searchIdx = nxt.idx+4 }
            else if (nxt.type==='else' && depth===1 && elseIdx===-1) { elseIdx = nxt.idx; searchIdx = nxt.idx+elseTag.length }
            else if (nxt.type==='end') { depth--; if (depth===0) { endIdx = nxt.idx; break } searchIdx = nxt.idx+endTag.length }
            else searchIdx = nxt.idx+4
          }
          if (endIdx===-1) { result += html.slice(startIdx); break }
          const ifBlock = elseIdx!==-1 ? html.slice(startIdx+startTag.length, elseIdx) : html.slice(startIdx+startTag.length, endIdx)
          const elseBlock = elseIdx!==-1 ? html.slice(elseIdx+elseTag.length, endIdx) : ''
          if (hasContacts) {
            const rowsHtml = contacts.map((c: any) => {
              const id = String(c.ID ?? c.id ?? '')
              const rawName = String(c.Name ?? c.name ?? '')
              const nameCell = rawName ? esc(rawName) : '<span class="text-gray-300">—</span>'
              const starred = c.Starred ?? c.starred ?? false
              const starHtml = starred ? '<span class="text-amber-400 mr-1">★</span>' : ''
              const company = String(c.Company ?? c.company ?? '')
              const companyCell = company ? esc(company) : '<span class="text-gray-300">—</span>'
              const rawPhone = String(c.Phone ?? c.phone ?? '')
              const phoneCell = rawPhone ? esc(rawPhone) : '<span class="text-gray-300">—</span>'
              const email = String(c.Email ?? c.email ?? '')
              const emailCell = email ? esc(email) : '<span class="text-gray-300">—</span>'
              const cGroups: any[] = Array.isArray(c.Groups) ? c.Groups : (Array.isArray(c.groups) ? c.groups : [])
              const groupsCell = cGroups.length ? `<div class="flex flex-wrap gap-1">${cGroups.map((g:any)=>`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white" style="background:${escAttr(String(g.Color||g.color||'#6b7280'))}">${esc(String(g.Name||g.name||''))}</span>`).join('')}</div>` : '<span class="text-gray-300">—</span>'
              const tagsRaw: any = c.Tags ?? c.tags ?? []
              const tagsArr: string[] = Array.isArray(tagsRaw) ? tagsRaw : (typeof tagsRaw === 'string' ? (()=>{try{const p=JSON.parse(tagsRaw); return Array.isArray(p)?p:[]}catch{return []}})() : [])
              const tagsCell = tagsArr.length ? `<div class="flex flex-wrap gap-1.5">${tagsArr.map((t:string)=>`<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">${esc(t)}</span>`).join('')}</div>` : '<span class="text-gray-300">—</span>'
              const createdAt = String(c.CreatedAt ?? c.created_at ?? '')
              const groupIds = cGroups.map((g:any)=> String(g.ID||g.id||'')).filter(Boolean)
              return `<tr class="hover:bg-gray-50 transition-colors"><td class="px-4 py-3"><div class="flex items-center gap-2">${starHtml}<span class="font-medium text-gray-900">${nameCell}</span></div></td><td class="px-4 py-3 text-gray-700">${companyCell}</td><td class="px-4 py-3 font-mono text-gray-700">${phoneCell}</td><td class="px-4 py-3 text-gray-500">${emailCell}</td><td class="px-4 py-3">${groupsCell}</td><td class="px-4 py-3">${tagsCell}</td><td class="px-4 py-3 text-gray-500 whitespace-nowrap">${esc(timeAgo(createdAt))}</td><td class="px-4 py-3 text-right"><div class="flex items-center justify-end gap-1"><button @click="editContact = { id: '${escAttr(id)}', name: '${escAttr(String(c.Name ?? c.name ?? ''))}', phone: '${escAttr(String(c.Phone ?? c.phone ?? ''))}', email: '${escAttr(String(email))}', company: '${escAttr(String(c.Company ?? c.company ?? ''))}', notes: '${escAttr(String(c.Notes ?? c.notes ?? ''))}', tags: '${escAttr(tagsArr.join(','))}', starred: ${starred ? 'true' : 'false'}, group_ids: [${groupIds.map((gid:string)=>`'${escAttr(gid)}'`).join(',')}] }" class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button><button @click="deleteContact = { id: '${escAttr(id)}', name: '${escAttr(String(c.Name ?? c.name ?? ''))}' }" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button></div></td></tr>`
            }).join('')
            let tableHtml = ifBlock
            tableHtml = tableHtml.replace(/<tbody[^>]*>[\s\S]*?<\/tbody>/, () => `<tbody class="divide-y divide-gray-100">${rowsHtml}</tbody>`)
            tableHtml = tableHtml.replace(/\{\{[^}]+\}\}/g, (m: string) => (m.includes('hx-')||m.includes('x-')?m:''))
            result += tableHtml
          } else {
            result += elseBlock
          }
          lastIndex = endIdx + endTag.length
        }
        return result
      }
      content = handleContactsIf(content)
      // Fallback stray {{range .Data.Contacts}}
      if (content.includes('{{range .Data.Contacts}}')) {
        const fallback = contacts.map((c: any) => `<tr><td>${esc(String(c.Name ?? ''))}</td><td>${esc(String(c.Phone ?? ''))}</td></tr>`).join('')
        content = content.replace(/\{\{range \.Data\.Contacts\}\}[\s\S]*?\{\{end\}\}/g, fallback)
      }
      // Groups: handle {{if .Data.Groups}} ... {{else}} ... {{end}}
      if (content.includes('{{if .Data.Groups}}')) {
        const hasGroups = groups.length > 0
        const handleGroupsIf = (html: string): string => {
          const startTag = '{{if .Data.Groups}}'
          const elseTag = '{{else}}'
          const endTag = '{{end}}'
          let res = '', li = 0
          while (true) {
            const si = html.indexOf(startTag, li)
            if (si === -1) { res += html.slice(li); break }
            res += html.slice(li, si)
            let depth=1, sIdx=si+startTag.length, eIdx=-1, elIdx=-1
            while (depth>0 && sIdx < html.length) {
              const ni = html.indexOf('{{if', sIdx)
              const nr = html.indexOf('{{range', sIdx)
              let no = -1
              if (ni!==-1) no=ni
              if (nr!==-1 && (no===-1 || nr<no)) no=nr
              const ne = html.indexOf(elseTag, sIdx)
              const nd = html.indexOf(endTag, sIdx)
              const cands:any[]=[]
              if (no!==-1) cands.push({idx:no,type:'if'})
              if (ne!==-1) cands.push({idx:ne,type:'else'})
              if (nd!==-1) cands.push({idx:nd,type:'end'})
              if (!cands.length) break
              cands.sort((a,b)=>a.idx-b.idx)
              const n=cands[0]
              if (n.type==='if'){depth++; sIdx=n.idx+4}
              else if (n.type==='else' && depth===1 && elIdx===-1){elIdx=n.idx; sIdx=n.idx+elseTag.length}
              else if (n.type==='end'){depth--; if(depth===0){eIdx=n.idx; break} sIdx=n.idx+endTag.length}
              else sIdx=n.idx+4
            }
            if (eIdx===-1){res+=html.slice(si); break}
            const ib = elIdx!==-1 ? html.slice(si+startTag.length, elIdx) : html.slice(si+startTag.length, eIdx)
            const eb = elIdx!==-1 ? html.slice(elIdx+elseTag.length, eIdx) : ''
            res += hasGroups ? ib : eb
            li = eIdx+endTag.length
          }
          return res
        }
        content = handleGroupsIf(content)
      }
      // Groups range — generate filter pills, management, checkboxes
      if (content.includes('{{range .Data.Groups}}') && groups.length>0) {
        // For each range, generate by replacing inner placeholders per group
        // We handle generically: expand each range by iterating groups and interpolating .ID/.Name/.Color/.Description/.ContactCount
        content = content.replace(/\{\{range \.Data\.Groups\}\}([\s\S]*?)\{\{end\}\}/g, (_m, inner) => {
          return groups.map((g:any)=>{
            let seg = inner
            seg = seg.replace(/\{\{\.ID\}\}/g, escAttr(String(g.ID||g.id||'')))
            seg = seg.replace(/\{\{\.Name\}\}/g, esc(String(g.Name||g.name||'')))
            seg = seg.replace(/\{\{\.Color\}\}/g, escAttr(String(g.Color||g.color||'#6b7280')))
            seg = seg.replace(/\{\{\.Description\}\}/g, esc(String(g.Description||g.description||'')))
            seg = seg.replace(/\{\{\.ContactCount\}\}/g, String(g.ContactCount||g.contact_count||0))
            // Handle active filter for pills
            seg = seg.replace(/\{\{if eq \$\.Data\.GroupFilter \.ID\}\}([^\{]*?)\{\{else\}\}([^\{]*?)\{\{end\}\}/g, (_:string,a:string,b:string)=> (groupFilter && groupFilter===String(g.ID||g.id||'')) ? a : b)
            // Fallback generic if/else
            seg = seg.replace(/\{\{[^}]+\}\}/g, (m:string)=> m.includes('hx-')||m.includes('x-') ? m : '')
            return seg
          }).join('')
        })
      } else if (content.includes('{{range .Data.Groups}}')) {
        content = content.replace(/\{\{range \.Data\.Groups\}\}[\s\S]*?\{\{end\}\}/g, '')
      }
      // Search value
      if (q) {
        content = content.replace(/value="\{\{\.Data\.Q\}\}"/g, `value="${escAttr(q)}"`)
      } else {
        content = content.replace(/value="\{\{\.Data\.Q\}\}"/g, `value=""`)
      }
      // Cleanup remaining go tags
      content = content.replace(/\{\{\.Data\.Q\}\}/g, esc(q))
      content = content.replace(/\{\{\.Data\.Total\}\}/g, String((data.Data as any)?.Total ?? contacts.length))
      content = content.replace(/\{\{\.Data\.GroupFilter\}\}/g, escAttr(groupFilter))
      // Remove any leftover Data.Groups conditionals not handled
      content = content.replace(/\{\{if \.Data\.Groups\}\}/g, '').replace(/\{\{end\}\}/g, '')
    } else if (page === 'billing' || page === 'billing-plans' || page === 'billing-subscriptions' || page === 'billing-usage' || page === 'admin-config' || page === 'subscription') {
    // Billing pages: handle Plans, Subscriptions, Usage, and divCents helper
    const plans: any[] = Array.isArray((data.Data as any)?.Plans) ? (data.Data as any).Plans : ((data.Data as any)?.plans ?? [])
    const subs: any[] = Array.isArray((data.Data as any)?.Subscriptions) ? (data.Data as any).Subscriptions : ((data.Data as any)?.subscriptions ?? [])
    const usage: any[] = Array.isArray((data.Data as any)?.Usage) ? (data.Data as any).Usage : ((data.Data as any)?.usage ?? [])
    // Handle divCents helper: {{divCents .PriceCents}} -> price/100
    content = content.replace(/\{\{divCents \.PriceCents\}\}/g, (m) => {
      // Will be handled per plan in range, but also handle standalone
      return m
    })
    // Handle Plans table
    if (plans.length > 0 || content.includes('{{range .Data.Plans}}')) {
      const hasPlans = plans.length > 0
      const handlePlansIf = (html: string): string => {
        const startTag = '{{if .Data.Plans}}'
        const elseTag = '{{else}}'
        const endTag = '{{end}}'
        let result = '', lastIndex = 0
        while (true) {
          const startIdx = html.indexOf(startTag, lastIndex)
          if (startIdx === -1) { result += html.slice(lastIndex); break }
          result += html.slice(lastIndex, startIdx)
          let depth = 1, searchIdx = startIdx + startTag.length, elseIdx = -1, endIdx = -1
          while (depth > 0 && searchIdx < html.length) {
            const nextIf = html.indexOf('{{if', searchIdx)
            const nextRange = html.indexOf('{{range', searchIdx)
            const nextWith = html.indexOf('{{with', searchIdx)
            let nextOpen = -1
            if (nextIf !== -1) nextOpen = nextIf
            if (nextRange !== -1 && (nextOpen === -1 || nextRange < nextOpen)) nextOpen = nextRange
            if (nextWith !== -1 && (nextOpen === -1 || nextWith < nextOpen)) nextOpen = nextWith
            const nextElse = html.indexOf(elseTag, searchIdx)
            const nextEnd = html.indexOf(endTag, searchIdx)
            const cands: any[] = []
            if (nextOpen !== -1) cands.push({idx: nextOpen, type: 'if'})
            if (nextElse !== -1) cands.push({idx: nextElse, type: 'else'})
            if (nextEnd !== -1) cands.push({idx: nextEnd, type: 'end'})
            if (cands.length === 0) break
            cands.sort((a,b)=>a.idx-b.idx)
            const nxt = cands[0]
            if (nxt.type === 'if') { depth++; searchIdx = nxt.idx+4 }
            else if (nxt.type === 'else' && depth===1 && elseIdx===-1) { elseIdx = nxt.idx; searchIdx = nxt.idx+elseTag.length }
            else if (nxt.type === 'end') { depth--; if (depth===0) { endIdx = nxt.idx; break } searchIdx = nxt.idx+endTag.length }
            else searchIdx = nxt.idx+4
          }
          if (endIdx===-1) { result += html.slice(startIdx); break }
          const ifBlock = elseIdx!==-1 ? html.slice(startIdx+startTag.length, elseIdx) : html.slice(startIdx+startTag.length, endIdx)
          const elseBlock = elseIdx!==-1 ? html.slice(elseIdx+elseTag.length, endIdx) : ''
          if (hasPlans) {
            const rowsHtml = plans.map((p: any) => {
              const limits = p.PlanLimits ?? p.planLimits ?? p.limits ?? {}
              // Handle limits as JSON string or object
              let lim: any = limits
              if (typeof limits === 'string') { try { lim = JSON.parse(limits) } catch { lim = {} } }
              const daily = lim.DailyMessages ?? lim.daily_messages ?? 0
              const maxAccts = lim.MaxAccounts ?? lim.max_accounts ?? 0
              const apiAccess = !!(lim.APIAccess ?? lim.api_access)
              const mcpAccess = !!(lim.MCPAccess ?? lim.mcp_access)
              const webhooks = !!(lim.Webhooks ?? lim.webhooks)
              const copilot = !!(lim.Copilot ?? lim.copilot)
              const autopilot = !!(lim.Autopilot ?? lim.autopilot)
              const priceCents = p.PriceCents ?? p.price_cents ?? p.PriceCents ?? 0
              const isDefault = !!(p.IsDefault ?? p.is_default)
              const divCents = Math.floor(priceCents/100)
              return `<tr class="hover:bg-gray-50 transition-colors"><td class="px-4 py-3 font-mono text-xs text-gray-500">${esc(String(p.ID ?? p.id ?? ''))}</td><td class="px-4 py-3 font-medium text-gray-900">${esc(String(p.Name ?? p.name ?? ''))}</td><td class="px-4 py-3 text-gray-700">$${divCents}/mo</td><td class="px-4 py-3 text-gray-700">${daily===0?'∞':daily}</td><td class="px-4 py-3 text-gray-700">${maxAccts===0?'∞':maxAccts}</td><td class="px-4 py-3"><div class="flex gap-1 flex-wrap">${apiAccess?'<span class="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">API</span>':''}${mcpAccess?'<span class="px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700">MCP</span>':''}${webhooks?'<span class="px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700">Hooks</span>':''}${copilot?'<span class="px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700">Copilot</span>':''}${autopilot?'<span class="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">Autopilot</span>':''}</div></td><td class="px-4 py-3">${isDefault?'<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Yes</span>':'<span class="text-gray-300">—</span>'}</td><td class="px-4 py-3 text-right"><div class="flex items-center justify-end gap-1"><button @click="editPlan = { id: '${escAttr(String(p.ID ?? p.id ?? ''))}', name: '${escAttr(String(p.Name ?? p.name ?? ''))}', description: '${escAttr(String(p.Description ?? p.description ?? ''))}', priceCents: ${priceCents}, dailyMessages: ${daily}, maxAccounts: ${maxAccts}, apiAccess: ${apiAccess}, mcpAccess: ${mcpAccess}, webhooks: ${webhooks}, copilot: ${copilot}, autopilot: ${autopilot}, isDefault: ${isDefault} }" class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button><form method="POST" action="/admin/billing/plans/${escAttr(String(p.ID ?? p.id ?? ''))}/delete" hx-boost="false" onsubmit="return confirm('Delete plan ${escAttr(String(p.Name ?? p.name ?? ''))}? Plans with active subscriptions cannot be deleted.')"><button type="submit" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button></form></div></td></tr>`
            }).join('')
            let tableHtml = ifBlock
            tableHtml = tableHtml.replace(/<tbody[^>]*>[\s\S]*?<\/tbody>/, () => `<tbody class="divide-y divide-gray-100">${rowsHtml}</tbody>`)
            tableHtml = tableHtml.replace(/\{\{[^}]+\}\}/g, (m: string) => (m.includes('hx-')||m.includes('x-')?m:''))
            // Handle divCents inside
            tableHtml = tableHtml.replace(/\$\{\{divCents \.PriceCents\}\}/g, (m) => {
              // This is handled per row above, but keep for safety
              return m
            })
            result += tableHtml
          } else {
            result += elseBlock
          }
          lastIndex = endIdx + endTag.length
        }
        return result
      }
      content = handlePlansIf(content)
    }
    // Handle Subscriptions and Usage similarly (simple fallback)
    if (subs.length > 0) {
      const subsRows = subs.map((s: any) => {
        const username = String(s.Username ?? s.username ?? s.UserID ?? s.user_id ?? '')
        const planName = String(s.PlanName ?? s.plan_name ?? s.PlanID ?? s.plan_id ?? '')
        const status = String(s.Status ?? s.status ?? '')
        const period = String(s.Period ?? s.period ?? s.CurrentPeriodEnd ?? s.current_period_end ?? '')
        let badge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">${esc(status)}</span>`
        if (status==='active') badge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>'
        else if (status==='trialing') badge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Trial</span>'
        else if (status==='canceled') badge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Canceled</span>'
        return `<tr class="hover:bg-gray-50 transition-colors"><td class="px-4 py-3 font-medium text-gray-900">${esc(username)}</td><td class="px-4 py-3"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">${esc(planName)}</span></td><td class="px-4 py-3">${badge}</td><td class="px-4 py-3 text-gray-500 text-xs">${esc(period)}</td><td class="px-4 py-3 text-right"><div class="flex items-center justify-end gap-1"><button @click="assignSub = { userID: '${escAttr(String(s.UserID ?? s.user_id ?? ''))}', planID: '${escAttr(String(s.PlanID ?? s.plan_id ?? ''))}' }" class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Change Plan"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button><form method="POST" action="/admin/billing/subscriptions/${escAttr(String(s.UserID ?? s.user_id ?? ''))}/delete" hx-boost="false" onsubmit="return confirm('Remove subscription for ${escAttr(username)}?')"><button type="submit" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Remove"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button></form></div></td></tr>`
      }).join('')
      // Replace subscriptions table if present
      if (content.includes('{{range .Data.Subscriptions}}')) {
        content = content.replace(/<tbody[^>]*>[\s\S]*?<\/tbody>/, `<tbody class="divide-y divide-gray-100">${subsRows}</tbody>`)
        // Handle the if/else for subscriptions
        content = content.replace(/\{\{if \.Data\.Subscriptions\}\}[\s\S]*?\{\{else\}\}[\s\S]*?\{\{end\}\}/g, (m) => {
          // If we have subs, keep the table, else keep the else block
          return subs.length > 0 ? m.slice(m.indexOf('<table'), m.indexOf('{{else}}')) + `<tbody class="divide-y divide-gray-100">${subsRows}</tbody>` + m.slice(m.indexOf('</table>')+8, m.indexOf('{{else}}')) : m.slice(m.indexOf('{{else}}')+8, m.indexOf('{{end}}'))
        })
      }
    }
    if (usage.length > 0) {
      const usageRows = usage.map((u: any) => {
        const username = String(u.Username ?? u.username ?? u.UserID ?? u.user_id ?? '')
        const msgs = String(u.Messages ?? u.messages ?? 0)
        return `<tr class="hover:bg-gray-50 transition-colors"><td class="px-4 py-3 font-medium text-gray-900">${esc(username)}</td><td class="px-4 py-3 text-gray-700">${esc(msgs)}</td></tr>`
      }).join('')
      if (content.includes('{{range .Data.Usage}}')) {
        content = content.replace(/<tbody[^>]*>[\s\S]*?<\/tbody>/, `<tbody class="divide-y divide-gray-100">${usageRows}</tbody>`)
      }
    }
    // Handle remaining {{range}} for Plans in assign modal
    if (content.includes('{{range .Data.Plans}}') && plans.length > 0) {
      const opts = plans.map((p: any) => `<option value="${escAttr(String(p.ID ?? p.id ?? ''))}">${esc(String(p.Name ?? p.name ?? ''))} — $${Math.floor((p.PriceCents ?? p.price_cents ?? 0)/100)}/mo</option>`).join('')
      content = content.replace(/\{\{range \.Data\.Plans\}\}[\s\S]*?\{\{end\}\}/g, opts)
    }
    // Clean up any remaining Go templates like divCents, PlanLimits etc.
    content = content.replace(/\{\{\$lim\.[^}]+\}\}/g, '')
    content = content.replace(/\{\{divCents [^}]+\}\}/g, '')
    content = content.replace(/\{\{\.PlanLimits\}\}/g, '')
    } else if (page === 'pricing') {
      const plans: any[] = Array.isArray((data.Data as any)?.Plans) ? (data.Data as any).Plans : ((data.Data as any)?.plans ?? [])
      // Handle {{range .Data.Plans}} with depth counting to correctly handle nested {{if}}/{{range}}/{{with}} inside the range.
      const handlePricingRange = (html: string): string => {
        const startTag = '{{range .Data.Plans}}'
        let result = '', lastIndex = 0
        while (true) {
          const startIdx = html.indexOf(startTag, lastIndex)
          if (startIdx === -1) { result += html.slice(lastIndex); break }
          result += html.slice(lastIndex, startIdx)
          let depth = 1, searchIdx = startIdx + startTag.length, endIdx = -1
          while (depth > 0 && searchIdx < html.length) {
            const nextIf = html.indexOf('{{if', searchIdx)
            const nextRange = html.indexOf('{{range', searchIdx)
            const nextWith = html.indexOf('{{with', searchIdx)
            let nextOpen = -1
            if (nextIf !== -1) nextOpen = nextIf
            if (nextRange !== -1 && (nextOpen === -1 || nextRange < nextOpen)) nextOpen = nextRange
            if (nextWith !== -1 && (nextOpen === -1 || nextWith < nextOpen)) nextOpen = nextWith
            const nextEnd = html.indexOf('{{end}}', searchIdx)
            if (nextEnd === -1) break
            if (nextOpen !== -1 && nextOpen < nextEnd) {
              depth++
              searchIdx = nextOpen + 5
            } else {
              depth--
              if (depth === 0) { endIdx = nextEnd; break }
              searchIdx = nextEnd + 7
            }
          }
          if (endIdx === -1) { result += html.slice(startIdx); break }
          if (plans.length > 0) {
            const cards = plans.map((p: any) => {
              const id = String(p.ID ?? p.id ?? '')
              const name = esc(String(p.Name ?? p.name ?? ''))
              const desc = esc(String(p.Description ?? p.description ?? ''))
              const priceCents = p.PriceCents ?? p.price_cents ?? 0
              const interval = esc(String(p.Interval ?? p.interval ?? 'month'))
              const lim: any = p.Limits ?? p.limits ?? p.PlanLimits ?? {}
              const daily = lim.DailyMessages ?? lim.daily_messages ?? 0
              const maxAccts = lim.MaxAccounts ?? lim.max_accounts ?? 0
              const api = !!(lim.APIAccess ?? lim.api_access)
              const mcp = !!(lim.MCPAccess ?? lim.mcp_access)
              const wh = !!(lim.Webhooks ?? lim.webhooks)
              const cop = !!(lim.Copilot ?? lim.copilot)
              const auto = !!(lim.Autopilot ?? lim.autopilot)
              const isPro = id === 'pro'
              const isEnt = id === 'enterprise'
              const priceHtml = priceCents === 0 && !isEnt ? `<span class="text-4xl font-extrabold text-gray-900">$0</span><span class="text-gray-500 text-sm">/forever</span>` : isEnt ? `<span class="text-4xl font-extrabold text-gray-900">Custom</span><span class="text-gray-500 text-sm">pricing</span>` : `<span class="text-4xl font-extrabold text-gray-900">$${Math.floor(priceCents/100)}</span><span class="text-gray-500 text-sm">/${interval}</span>`
              const dailyHtml = daily === 0 ? `<strong>Unlimited</strong> messages/day` : `<strong>${daily}</strong> messages/day`
              const acctsHtml = maxAccts === 0 ? `<strong>Unlimited</strong> accounts` : `Up to <strong>${maxAccts}</strong> account${maxAccts>1?'s':''}`
              const borderCls = isPro ? 'border-brand-500 ring-2 ring-brand-500' : 'border-gray-200'
              const badge = isPro ? `<div class="absolute -top-3 left-1/2 -translate-x-1/2"><span class="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-brand-600 text-white">Most Popular</span></div>` : ''
              const btn = id==='free' ? `<a href="/register" class="block w-full text-center px-4 py-2.5 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">Get started free</a>` : isPro ? `<a href="/register" class="block w-full text-center px-4 py-2.5 rounded-md bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors shadow-sm">Start with Professional</a>` : id==='business' ? `<a href="/register" class="block w-full text-center px-4 py-2.5 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">Start with Business</a>` : `<a href="/register" class="block w-full text-center px-4 py-2.5 rounded-md border border-gray-900 bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors">Contact sales</a>`
              const feat = (icon: string, ok: boolean, label: string, dim: string) => ok ? `<li class="flex items-start gap-2.5 text-sm"><svg class="w-5 h-5 text-brand-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg><span class="text-gray-700">${label}</span></li>` : `<li class="flex items-start gap-2.5 text-sm"><svg class="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg><span class="text-gray-400">${dim}</span></li>`
              return `<div class="relative bg-white rounded-xl border ${borderCls} p-6 flex flex-col anim-on-scroll">${badge}<div class="mb-5"><h3 class="text-lg font-bold text-gray-900">${name}</h3><p class="text-sm text-gray-500 mt-1">${desc}</p></div><div class="mb-6">${priceHtml}</div><ul class="space-y-3 mb-8 flex-1"><li class="flex items-start gap-2.5 text-sm"><svg class="w-5 h-5 text-brand-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg><span class="text-gray-700">${dailyHtml}</span></li><li class="flex items-start gap-2.5 text-sm"><svg class="w-5 h-5 text-brand-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg><span class="text-gray-700">${acctsHtml}</span></li>${feat('',api,'Full <strong>REST API</strong> access','REST API access')}${feat('',mcp,'<strong>MCP</strong> server access','MCP server access')}${feat('',wh,'Real-time <strong>webhooks</strong>','Webhooks')}${feat('',cop,'<strong>Copilot</strong> assistant','Copilot')}${feat('',auto,'<strong>Autopilot</strong> auto-reply','Autopilot')}${isEnt?`<li class="flex items-start gap-2.5 text-sm"><svg class="w-5 h-5 text-brand-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg><span class="text-gray-700"><strong>Dedicated</strong> support</span></li>`:''}</ul><div>${btn}</div></div>`
            }).join('')
            result += cards
          } else {
            result += ''
          }
          lastIndex = endIdx + '{{end}}'.length
        }
        return result
      }
      if (content.includes('{{range .Data.Plans}}')) {
        content = handlePricingRange(content)
      }
      content = content.replace(/\{\{if \.Data\.Plans\}\}[\s\S]*?\{\{else\}\}[\s\S]*?\{\{end\}\}/g, (m)=> plans.length>0 ? m.replace(/\{\{if[^}]+\}\}/g,'').replace(/\{\{else\}\}[\s\S]*?\{\{end\}\}/,'').replace(/\{\{end\}\}/g,'') : m.slice(m.indexOf('{{else}}')+8, m.indexOf('{{end}}')))
      content = content.replace(/\{\{[^}]+\}\}/g, (m)=> m.includes('hx-')||m.includes('x-') ? m : '')
    } else if (page === 'messaging') {
    content = expandRangeBlocks(content, data)
  } else if (page === 'autopilot') {
    content = expandRangeBlocks(content, data)
  } else {
    content = expandRangeBlocks(content, data)
  }
  let html = layoutRaw.replace(/\{\{define "layout"\}\}/, '').replace(/\{\{end\}\}\s*$/, '')
  // Auto-discovered partials
  for (const p of partials.length ? partials : ['sidebar', 'navbar', 'toast', 'public-nav', 'public-footer']) {
    const re = new RegExp(`\\{\\{template "partial/${p}"[^}]*\\}\\}`, 'g')
    let part = raw(`partials/${p}.html`)
    part = part.replace(/\{\{define "[^"]*"\}\}/, '')
    part = part.replace(/\{\{end\}\}\s*$/, '')
    html = html.replace(re, part)
  }
  html = html.replace(/\{\{template "content"[^}]*\}\}/g, content)
  // Components must inline AFTER the page content merge: calls live in
  // page bodies, and anything unprocessed here is stripped as unknown below.
  for (const c of components.length ? components : ['display/badge', 'display/stat-card', 'display/empty-state']) {
    const re = new RegExp(`\\{\\{template "component/${c}"[^}]*\\}\\}`, 'g')
    let comp = raw(`components/${c}.html`)
    comp = comp.replace(/\{\{define "[^"]*"\}\}/, '')
    comp = comp.replace(/\{\{end\}\}\s*$/, '')
    // dict support: {{template "component/x" (dict "k" "v" ...)}} substitutes
    // {{.k}}, {{if eq .k "lit"}}..{{end}} and {{if .k}}..{{else}}..{{end}} per call.
    // Without this, dict-components render empty (args were silently dropped).
    html = html.replace(re, (call) => {
      // dict values: "literal", .Data.Dotted.Path (resolved now), or bare token.
      const resolveDataPath = (path: string): any => {
        let cur: any = data.Data
        for (const part of path.split('.')) {
          if (cur == null) return ''
          cur = cur[part]
        }
        return cur == null ? '' : cur
      }
      // Falsy: '', false, and the string 'false' (so .Data booleans behave).
      const isTruthy = (v: any): boolean => v !== '' && v !== false && v !== 'false' && v != null
      const dm = call.match(/\(dict([\s\S]*)\)\s*\}\}/)
      const args: Record<string, any> = {}
      if (dm) {
        const toks = [...dm[1].matchAll(/"([^"]*)"|(\.Data\.[A-Za-z0-9_.]+)|(\S+)/g)]
        for (let i = 0; i + 1 < toks.length; i += 2) {
          const key = toks[i][1] ?? ''
          if (!key) continue
          const v = toks[i + 1]
          args[key] = v[1] ?? (v[2] ? resolveDataPath(v[2].slice(6)) : (v[3] ?? ''))
        }
      }
      let out = comp
      out = out.replace(/\{\{\/\*[\s\S]*?\*\/\}\}/g, '')
      // Innermost-first evaluation: single-pass regexes mis-pair markers when
      // conditionals nest (e.g. eq-ifs inside an if/else), so resolve blocks
      // containing no nested {{if}} repeatedly until none remain.
      const condRe = /\{\{if (eq \.([A-Za-z0-9_]+) "([^"]*)"|(not )?\.([A-Za-z0-9_]+))\}\}((?:(?!\{\{if )[\s\S])*?)\{\{end\}\}/
      for (let guard = 0; guard < 25; guard++) {
        const m = out.match(condRe)
        if (!m || m.index === undefined) break
        const [, , eqKey, eqLit, notPrefix, key, inner] = m
        const parts = inner.split('{{else}}')
        const branch = parts.length > 1 ? parts.slice(0, -1).join('{{else}}') + '\x00' + parts[parts.length - 1] : inner
        const [a, b] = branch.split('\x00')
        let cond: boolean
        if (eqKey !== undefined) cond = String(args[eqKey] ?? '') === eqLit
        else cond = notPrefix ? !isTruthy(args[key]) : isTruthy(args[key])
        out = out.slice(0, m.index) + (cond ? (a ?? inner) : (b ?? '')) + out.slice(m.index + m[0].length)
      }
      out = out.replace(/\{\{\.([A-Za-z0-9_]+)\}\}/g, (_m, k) => esc(args[k] == null ? '' : String(args[k])))
      return out
    })
  }
  const repl: Array<[RegExp, string]> = [
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
    html = html.replace(/\{\{range[^}]+\}\}[\s\S]*?\{\{end\}\}/g, '')
    html = expandRangeBlocks(html, data)
  }
  return html
}

export function renderPage(page: string, data: PageData): string {
  return evalPageTemplate(page, data)
}

export function renderFragment(html: string): string {
  return html
}
