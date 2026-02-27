import AdminLayout from './layouts/AdminLayout.jsx'
import AdminDashboard from './routes/AdminDashboard.jsx'

export default function AdminApp() {
  return (
    <AdminLayout>
      <AdminDashboard />
    </AdminLayout>
  )
}
