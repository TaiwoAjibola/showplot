import { useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authContext.js'

async function fetchJson(url, options) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Request failed (${res.status})`)
  }
  return res.json().catch(() => null)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = async () => {
    const data = await fetchJson('/api/me', { method: 'GET', headers: {} })
    setUser(data?.user || null)
  }

  useEffect(() => {
    let alive = true
    const t = window.setTimeout(() => {
      refresh()
        .catch((e) => {
          if (!alive) return
          setUser(null)
          setError(String(e?.message || e))
        })
        .finally(() => {
          if (!alive) return
          setIsLoading(false)
        })
    }, 0)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [])

  const loginWithGoogleCredential = async (credential) => {
    setError('')
    const data = await fetchJson('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    })
    setUser(data?.user || null)
    return data?.user || null
  }

  const logout = async () => {
    setError('')
    await fetchJson('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) })
    setUser(null)
  }

  const value = useMemo(
    () => ({ user, isLoading, error, refresh, loginWithGoogleCredential, logout }),
    [user, isLoading, error]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
