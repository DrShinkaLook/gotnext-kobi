import { getAuthToken } from 'deepspace'

export type ActionResponse<T = unknown> = { success: true; data: T } | { success: false; error: string }

/** Calls a server action in src/actions/index.ts with the signed-in user's token. */
export async function callAction<T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<ActionResponse<T>> {
  try {
    const token = await getAuthToken()
    if (!token) return { success: false, error: 'Please sign in first' }
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    const body = (await res.json().catch(() => null)) as ActionResponse<T> | { error?: string } | null
    if (body && 'success' in body) return body
    return { success: false, error: body?.error ?? `Request failed (${res.status})` }
  } catch {
    return { success: false, error: 'Network error. Check your connection and try again.' }
  }
}
