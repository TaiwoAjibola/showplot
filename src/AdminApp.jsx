import AdminLayout from './layouts/AdminLayout.jsx'
import AdminDashboard from './routes/AdminDashboard.jsx'
import SignIn from './routes/SignIn.jsx'
import { useAuth } from './auth/authContext.js'

export default function AdminApp() {
  const auth = useAuth()

  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-slate-600">Loading…</div>
      </div>
    )
  }

  if (!auth.user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <SignIn
          mode="local"
          title="Admin Sign In"
          subtitle="Enter the admin username and password."
        />
      </div>
    )
  }

  return (
    <AdminLayout>
      <AdminDashboard />
    </AdminLayout>
  )
}
