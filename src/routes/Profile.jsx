import SignIn from './SignIn.jsx'
import { useAuth } from '../auth/authContext.js'

export default function Profile() {
  const auth = useAuth()

  if (auth.isLoading) {
    return <div className="text-sm text-slate-600">Loading…</div>
  }

  if (!auth.user) {
    return <SignIn title="Sign in" subtitle="Sign in to view your profile." />
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xl font-semibold text-slate-900">Profile</div>
          <div className="mt-1 text-sm text-slate-600">Your account details.</div>
        </div>
        <button
          type="button"
          onClick={() => auth.logout()}
          className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-4">
          {auth.user.picture ? (
            <img src={auth.user.picture} alt="" className="h-14 w-14 rounded-full border border-slate-200" />
          ) : (
            <div className="h-14 w-14 rounded-full border border-slate-200 bg-slate-50" />
          )}
          <div>
            <div className="text-sm font-semibold text-slate-900">{auth.user.name || 'Unnamed user'}</div>
            <div className="mt-1 text-sm text-slate-600">{auth.user.email || ''}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
