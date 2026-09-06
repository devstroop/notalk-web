import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function findTemplatesDir(): string {
  const candidates = [
    join(__dirname, '../../templates'),
    join(__dirname, '../templates'),
    join(process.cwd(), 'templates'),
    join(process.cwd(), 'dist/templates'),
  ]
  for (const p of candidates) if (existsSync(p)) return p
  return candidates[0]
}
