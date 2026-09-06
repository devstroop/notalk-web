// BFF backend client — TypeScript port of Go BackendClient (internal/web/api_client.go)
// Keeps same behavior: forwards cookie -> Bearer, preserves status, supports proxy for QR PNG & file uploads

import { config } from '../config.js'

export class BackendClient {
  baseURL: string
  constructor(baseURL = config.backend.url) {
    this.baseURL = baseURL.replace(/\/$/, '')
  }

  async json<T = any>(
    method: string,
    path: string,
    token: string | null,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<{ status: number; data: T; raw: string; headers: Headers }> {
    let url = `${this.baseURL}${path}`
    if (query && Object.keys(query).length) {
      const qs = new URLSearchParams(query).toString()
      url += (url.includes('?') ? '&' : '?') + qs
    }
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    let payload: BodyInit | undefined
    if (body !== undefined && body !== null) {
      if (body instanceof FormData || typeof body === 'string') payload = body as BodyInit
      else {
        headers['Content-Type'] = 'application/json'
        payload = JSON.stringify(body)
      }
    }
    const res = await fetch(url, { method, headers, body: payload })
    const raw = await res.text()
    let data: any = null
    try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
    return { status: res.status, data, raw, headers: res.headers }
  }

  async proxy(
    method: string,
    backendPath: string,
    token: string | null,
    init: { headers?: Record<string,string>; body?: BodyInit; query?: string } = {},
  ): Promise<Response> {
    let url = `${this.baseURL}${backendPath}`
    if (init.query) url += (url.includes('?') ? '&' : '?') + init.query
    const headers: Record<string,string> = { ...(init.headers||{}) }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (!headers['Accept']) headers['Accept'] = 'application/json'
    return fetch(url, { method, headers, body: init.body })
  }
}

export const backend = new BackendClient()
