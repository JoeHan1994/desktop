/// <reference types="vite/client" />

export type DocsQaRole = 'user' | 'assistant'

export interface DocsQaMessage {
  role: DocsQaRole
  content: string
}

export interface DocsQaContext {
  title: string
  path: string
  heading?: string
  content: string
}

export interface DocsQaRequest {
  question: string
  contexts: DocsQaContext[]
  history: DocsQaMessage[]
}

interface ApiErrorResponse {
  message?: string
}

interface SseEvent {
  event: string
  data: string
}

export class DocsQaRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'DocsQaRequestError'
    this.status = status
  }
}

export async function askDocsQuestion(request: DocsQaRequest, onDelta: (text: string) => void, signal: AbortSignal) {
  const token = localStorage.getItem('auth_token')
  if (!token) {
    throw new DocsQaRequestError('Sign in to use Ask AI.', 401)
  }

  const apiBaseUrl = import.meta.env.VITE_TERRAFORGE_API_URL?.replace(/\/$/, '')
  if (!apiBaseUrl) {
    throw new DocsQaRequestError('AI Q&A is not configured.', 503)
  }

  const response = await fetch(`${apiBaseUrl}/v1/DocsQa/ask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('auth_token')
    }

    let message = 'AI Q&A could not complete the request.'
    try {
      const errorResponse = (await response.json()) as ApiErrorResponse
      message = errorResponse.message || message
    } catch {
      // Keep the user-safe fallback when the response is not JSON.
    }

    throw new DocsQaRequestError(message, response.status)
  }

  if (!response.body) {
    throw new DocsQaRequestError('AI Q&A returned an empty response.', 502)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false

  while (!completed) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      completed = handleEvent(parseEvent(frame), onDelta)
      if (completed) break
      boundary = buffer.indexOf('\n\n')
    }

    if (done) break
  }

  if (!completed && buffer.trim()) {
    completed = handleEvent(parseEvent(buffer), onDelta)
  }

  if (!completed) {
    throw new DocsQaRequestError('The AI response ended unexpectedly.', 502)
  }
}

function parseEvent(frame: string): SseEvent {
  let event = 'message'
  const data: string[] = []

  for (const rawLine of frame.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart())
    }
  }

  return { event, data: data.join('\n') }
}

function handleEvent(event: SseEvent, onDelta: (text: string) => void) {
  if (event.event === 'done') return true
  if (!event.data) return false

  const payload = JSON.parse(event.data) as { text?: string; message?: string }
  if (event.event === 'delta' && payload.text) {
    onDelta(payload.text)
  } else if (event.event === 'error') {
    throw new DocsQaRequestError(payload.message || 'AI Q&A could not complete the request.', 502)
  }

  return false
}
