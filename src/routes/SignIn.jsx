import { GoogleLogin } from '@react-oauth/google'
import { useMemo, useState } from 'react'
import { useAuth } from '../auth/authContext.js'

export default function SignIn({ title = 'Sign in', subtitle = 'Use Google to continue.' }) {
  const auth = useAuth()
  const [localError, setLocalError] = useState('')

  const clientIdMissing = useMemo(() => !import.meta.env.VITE_GOOGLE_CLIENT_ID, [])

  return (
    <div className="mx-auto mt-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{subtitle}</div>

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
          useOneTap
        />
      </div>

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
