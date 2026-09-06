import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = (() => {
  try {
    return dirname(fileURLToPath(import.meta.url))
  } catch {
    return '/tmp'
  }
})()

export function findTemplatesDir(): string {
  const candidates = [
    join(__dirname, '../../templates'),
    join(__dirname, '../templates'),
    join(process.cwd(), 'templates'),
    join(process.cwd(), 'dist/templates'),
  ]
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch {}
  }
  return candidates[0]
}
