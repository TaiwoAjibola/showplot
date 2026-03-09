import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import { AuthProvider } from './auth/AuthProvider.jsx'
import AdminApp from './AdminApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
      <AuthProvider>
        <AdminApp />
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
