import { useEffect, useRef } from 'react'
import { useAuth, useDisplayName } from 'deepspace'
import { callAction } from '../api'

/** After sign-in, makes sure the user has a players row (once per user per page load). */
export function EnsurePlayer() {
  const { isSignedIn, userId } = useAuth()
  const name = useDisplayName()
  const doneFor = useRef<string | null>(null)

  useEffect(() => {
    if (!isSignedIn || !userId || doneFor.current === userId) return
    doneFor.current = userId
    void callAction('ensurePlayer', { name: name ?? '' })
  }, [isSignedIn, userId, name])

  return null
}
