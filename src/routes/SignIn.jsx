import { GoogleLogin } from '@react-oauth/google'
import { useMemo, useState } from 'react'
import { useAuth } from '../auth/authContext.js'

export default function SignIn({
  title = 'Sign in',
  subtitle = 'Use Google to continue.',
  mode = 'google', // 'google' or 'local'
}) {
  const auth = useAuth()
  const [localError, setLocalError] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const clientIdMissing = useMemo(() => !import.meta.env.VITE_GOOGLE_CLIENT_ID, [])

  const handleLocalSubmit = async (e) => {
    e.preventDefault()
    setLocalError('')
    try {
      await auth.loginWithLocal(username, password)
    } catch (e) {
      setLocalError(String(e?.message || e))
    }
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{subtitle}</div>

      {mode === 'google' ? (
        <>
          {clientIdMissing ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Missing <span className="font-semibold">VITE_GOOGLE_CLIENT_ID</span> in the client environment.
            </div>
          ) : null}

          <div className="mt-5">
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                setLocalError('')
                try {
                  const credential = credentialResponse?.credential
                  if (!credential) throw new Error('Missing Google credential')
                  await auth.loginWithGoogleCredential(credential)
                } catch (e) {
                  setLocalError(String(e?.message || e))
                }
              }}
              onError={() => setLocalError('Google sign-in failed. Please try again.')}
            />
          </div>
        </>
      ) : (
        <form onSubmit={handleLocalSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-indigo-600 py-2 px-4 text-white hover:bg-indigo-700"
          >
            Sign in
          </button>
        </form>
      )}

      {(auth.error || localError) ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {auth.error || localError}
        </div>
      ) : null}

      <div className="mt-5 flex items-center gap-4 text-sm">
        <a className="font-medium text-slate-700 hover:text-slate-900" href="/privacy">
          Privacy
        </a>
        <a className="font-medium text-slate-700 hover:text-slate-900" href="/terms">
          Terms
        </a>
      </div>
    </div>
  )
}
