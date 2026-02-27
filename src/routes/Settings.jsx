import SignIn from './SignIn.jsx'
import { useAuth } from '../auth/authContext.js'

export default function Settings() {
  const auth = useAuth()

  if (auth.isLoading) {
    return <div className="text-sm text-slate-600">Loading…</div>
  }

  if (!auth.user) {
    return <SignIn title="Sign in" subtitle="Sign in to change your settings." />
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <div className="text-xl font-semibold text-slate-900">Settings</div>
        <div className="mt-1 text-sm text-slate-600">Account and app preferences.</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        Settings are coming next. For now, use the builder tools and exports.
      </div>
    </div>
  )
}
