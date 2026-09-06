// Mirrors Go frontend config — same env vars, no DB.
export interface Config {
  server: { host: string; port: number }
  backend: { url: string }
  auth: { secretKey: string; registrationEnabled: boolean }
  logging: { level: string }
  llm: { enabled: boolean; provider: string; apiKey: string; baseURL: string; model: string }
}

export function loadConfig(): Config {
  const secret =
    process.env.NOTALK_AUTH_SECRET_KEY ||
    process.env.FRONTEND_SECRET_KEY ||
    'changeme'

  const backend =
    (process.env.NOTALK_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '')

  return {
    server: {
      host: process.env.FRONTEND_HOST || '0.0.0.0',
      port: Number(process.env.FRONTEND_PORT || process.env.PORT || 3000),
    },
    backend: { url: backend },
    auth: {
      secretKey: secret,
      registrationEnabled:
        (process.env.NOTALK_AUTH_REGISTRATION_ENABLED || process.env.FRONTEND_REGISTRATION_ENABLED || 'true') === 'true',
    },
    logging: { level: process.env.NOTALK_LOG_LEVEL || 'info' },
    llm: {
      enabled: (process.env.NOTALK_LLM_ENABLED || '') === 'true' || (process.env.NOTALK_LLM_API_KEY || '') !== '' || (process.env.NOTALK_LLM_PROVIDER || '') === 'ollama',
      provider: process.env.NOTALK_LLM_PROVIDER || '',
      apiKey: process.env.NOTALK_LLM_API_KEY || '',
      baseURL: process.env.NOTALK_LLM_BASE_URL || '',
      model: process.env.NOTALK_LLM_MODEL || 'gpt-4o-mini',
    },
  }
}

export const config = loadConfig()
