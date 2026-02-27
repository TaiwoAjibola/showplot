import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext.js'

export default function AppLayout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const auth = useAuth()
  const menuRef = useRef(null)

  const isBuilder = location.pathname.startsWith('/app')

  if (isBuilder) {
    return (
      <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 flex flex-col">
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    )
  }

  const goBack = () => {
    try {
      if (window.history.length > 1) navigate(-1)
      else navigate('/app')
    } catch {
      navigate('/app')
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <button
            type="button"
            onClick={goBack}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">arrow_back</span>
            Back
          </button>

          <div className="text-sm font-semibold tracking-tight">ShowPlot</div>

          <details className="relative z-30" ref={menuRef}>
            <summary className="list-none cursor-pointer h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 flex items-center">
              <span className="material-symbols-outlined text-[20px] leading-none">menu</span>
              <span className="sr-only">Menu</span>
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {auth.user ? (
                <>
                  <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Account</div>
                  <a
                    href="/profile"
                    onClick={() => {
                      if (menuRef.current) menuRef.current.open = false
                    }}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Profile
                  </a>
                  <a
                    href="/settings"
                    onClick={() => {
                      if (menuRef.current) menuRef.current.open = false
                    }}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Settings
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      if (menuRef.current) menuRef.current.open = false
                      auth.logout()
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Sign out
                  </button>
                  <div className="my-1 h-px bg-slate-200" />
                </>
              ) : null}

              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Support</div>
              <a
                href="/feedback"
                onClick={() => {
                  if (menuRef.current) menuRef.current.open = false
                }}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Feedback
              </a>

              <div className="my-1 h-px bg-slate-200" />
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Legal</div>
              <a
                href="/privacy"
                onClick={() => {
                  if (menuRef.current) menuRef.current.open = false
                }}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Privacy
              </a>
              <a
                href="/terms"
                onClick={() => {
                  if (menuRef.current) menuRef.current.open = false
                }}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Terms
              </a>
            </div>
          </details>
        </div>
      </header>

      <main className="w-full px-4 py-4 md:px-6 md:py-6">{children}</main>
    </div>
  )
}
