export default function AdminLayout({ children }) {
  const userAppOrigin = import.meta.env?.VITE_USER_APP_ORIGIN || 'http://localhost:5173'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <div className="text-sm font-semibold tracking-tight">ShowPlot Admin</div>
          <a
            href={`${userAppOrigin}/app`}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Open Builder
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">{children}</main>
    </div>
  )
}
