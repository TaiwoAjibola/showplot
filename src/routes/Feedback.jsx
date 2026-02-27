import { useState } from 'react'
import { useAuth } from '../auth/authContext.js'
import SignIn from './SignIn.jsx'

async function postFeedback({ message, page }) {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, page }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || 'Failed to send feedback')
  }
  return res.json().catch(() => null)
}

export default function Feedback() {
  const auth = useAuth()
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  if (auth.isLoading) {
    return <div className="text-sm text-slate-600">Loading…</div>
  }

  if (!auth.user) {
    return <SignIn title="Sign in" subtitle="Sign in to send feedback." />
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <div className="text-xl font-semibold text-slate-900">Feedback</div>
        <div className="mt-1 text-sm text-slate-600">Send remarks, bugs, or feature requests.</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <label className="block">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Message</div>
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
              setSent(false)
            }}
            rows={6}
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            placeholder="Tell us what you think…"
          />
        </label>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600">From: {auth.user.email}</div>
          <button
            type="button"
            disabled={isBusy || !message.trim()}
            onClick={async () => {
              setIsBusy(true)
              setError('')
              try {
                await postFeedback({ message: message.trim(), page: window.location.pathname })
                setMessage('')
                setSent(true)
              } catch (e) {
                setError(String(e?.message || e))
              } finally {
                setIsBusy(false)
              }
            }}
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
          >
            Send
          </button>
        </div>

        {sent ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Sent. Thank you!
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
