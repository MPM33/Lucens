// ─────────────────────────────────────────────────────────────────────────────
// Wrappers client des routes API sessions
// Toutes les requêtes passent par les routes Next.js (auth via cookies).
// ─────────────────────────────────────────────────────────────────────────────

export async function createSession(): Promise<{ session_id: string }> {
  const res = await fetch('/api/sessions', { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Impossible de démarrer une session.')
  }
  return res.json()
}

export async function saveStep(
  sessionId: string,
  body: {
    step_id: string
    scale_value?: number
    choice_id?: string
    composite_values?: Record<string, { scale_value?: number; choice_id?: string }>
    free_text?: string
  },
): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/steps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Impossible de sauvegarder la réponse.')
  }
}

export async function completeSession(sessionId: string): Promise<unknown> {
  const res = await fetch(`/api/sessions/${sessionId}/complete`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Impossible de terminer la session.')
  }
  return res.json()
}
