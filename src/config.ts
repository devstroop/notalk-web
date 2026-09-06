// Mirrors Go frontend config — same env vars, no DB.
// In Workers, env comes from `env` passed to fetch handler (wrangler vars), not process.env.
// This loader reads process.env (Node) and falls back to globalThis for Workers.
export interface Config {
  server: { host: string; port: number }
  backend: { url: string }
  auth: { secretKey: string; registrationEnabled: boolean }
  logging: { level: string }
  llm: { enabled: boolean; provider: string; apiKey: string; baseURL: string; model: string }
}

function envGet(key: string): string | undefined {
  // Node
  if (typeof process !== 'undefined' && (process as any).env?.[key] != null) return (process as any).env[key]
  // Workers: env is set on globalThis by worker.ts fetch wrapper
  const g: any = globalThis as any
  if (g.__WRANGLER_ENV__?.[key] != null) return g.__WRANGLER_ENV__[key]
  if (g.NOTANK_ENV?.[key] != null) return g.NOTANK_ENV[key]
  return undefined
}

export function loadConfig(): Config {
  const secret =
    envGet('NOTALK_AUTH_SECRET_KEY') ||
    envGet('FRONTEND_SECRET_KEY') ||
    'changeme'

  const backend =
    (envGet('NOTALK_BACKEND_URL') || envGet('BACKEND_URL') || 'http://localhost:5000').replace(/\/$/, '')

  return {
    server: {
      host: envGet('FRONTEND_HOST') || '0.0.0.0',
      port: Number(envGet('FRONTEND_PORT') || envGet('PORT') || '3000'),
    },
    backend: { url: backend },
    auth: {
      secretKey: secret,
      registrationEnabled:
        (envGet('NOTALK_AUTH_REGISTRATION_ENABLED') || envGet('FRONTEND_REGISTRATION_ENABLED') || 'true') === 'true',
    },
    logging: { level: envGet('NOTALK_LOG_LEVEL') || 'info' },
    llm: {
      enabled: (envGet('NOTALK_LLM_ENABLED') || '') === 'true' || (envGet('NOTALK_LLM_API_KEY') || '') !== '' || (envGet('NOTALK_LLM_PROVIDER') || '') === 'ollama',
      provider: envGet('NOTALK_LLM_PROVIDER') || '',
      apiKey: envGet('NOTALK_LLM_API_KEY') || '',
      baseURL: envGet('NOTALK_LLM_BASE_URL') || '',
      model: envGet('NOTALK_LLM_MODEL') || 'gpt-4o-mini',
    },
  }
}

export const config = loadConfig()
