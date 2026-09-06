import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { findTemplatesDir } from './findDir.js'

const TEMPLATES_DIR = findTemplatesDir()
const cache = new Map<string, string>()

export function getTemplatesDir(): string {
  return TEMPLATES_DIR
}

export function raw(path: string): string {
  const full = join(TEMPLATES_DIR, path)
  // In dev, re-read every time so template edits appear without restart.
  // In production, cache for performance.
  // With `nodejs_compat` and `find_additional_modules` templates are bundled
  // and `fs` works in Workers as well.
  try {
    if (process.env.NODE_ENV === 'production') {
      if (cache.has(path)) return cache.get(path)!
      const s = existsSync(full) ? readFileSync(full, 'utf-8') : `<!-- missing ${path} -->`
      cache.set(path, s)
      return s
    }
    return existsSync(full) ? readFileSync(full, 'utf-8') : `<!-- missing ${path} -->`
  } catch {
    return `<!-- missing ${path} -->`
  }
}

export function clearCache(): void {
  cache.clear()
}
