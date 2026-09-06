import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { findTemplatesDir } from './findDir.js'
import { bundledTemplates } from './templates.bundled.js'

const TEMPLATES_DIR = findTemplatesDir()
const cache = new Map<string, string>()

export function getTemplatesDir(): string {
  return TEMPLATES_DIR
}

export function bundled(path: string): string | undefined {
  return bundledTemplates[path]
}

export function listBundled(dir: string): string[] {
  const prefix = dir.endsWith('/') ? dir : dir + '/'
  const out: string[] = []
  for (const k of Object.keys(bundledTemplates)) {
    if (k.startsWith(prefix)) {
      const rest = k.slice(prefix.length)
      if (rest && !rest.includes('/') && rest.endsWith('.html')) out.push(rest.replace('.html', ''))
    }
  }
  return out.sort()
}

export function raw(path: string): string {
  // Prefer bundled in Workers / when fs is unavailable; fs first in dev for live reload.
  const b = bundledTemplates[path]
  const full = join(TEMPLATES_DIR, path)
  try {
    if (process.env.NODE_ENV === 'production') {
      if (cache.has(path)) return cache.get(path)!
      // Try fs first (Node production), fallback to bundled (Workers)
      let s: string | undefined
      try {
        if (existsSync(full)) s = readFileSync(full, 'utf-8')
      } catch {}
      if (s === undefined) s = b
      if (s === undefined) s = `<!-- missing ${path} -->`
      cache.set(path, s)
      return s
    }
    // dev: prefer fs so edits appear without rebuild, fallback to bundled
    try {
      if (existsSync(full)) return readFileSync(full, 'utf-8')
    } catch {}
    if (b !== undefined) return b
    return `<!-- missing ${path} -->`
  } catch {
    if (b !== undefined) return b
    return `<!-- missing ${path} -->`
  }
}

export function clearCache(): void {
  cache.clear()
}
