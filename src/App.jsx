import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout.jsx'
import StageBuilder from './routes/StageBuilder.jsx'

const Feedback = lazy(() => import('./routes/Feedback.jsx'))
const PrivacyPolicy = lazy(() => import('./routes/PrivacyPolicy.jsx'))
const Profile = lazy(() => import('./routes/Profile.jsx'))
const Terms = lazy(() => import('./routes/Terms.jsx'))
const Settings = lazy(() => import('./routes/Settings.jsx'))

function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      Loading…
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />

      <Route
        path="/privacy"
        element={
          <AppLayout>
            <Suspense fallback={<RouteFallback />}>
              <PrivacyPolicy />
            </Suspense>
          </AppLayout>
        }
      />
      <Route
        path="/terms"
        element={
          <AppLayout>
            <Suspense fallback={<RouteFallback />}>
              <Terms />
            </Suspense>
          </AppLayout>
        }
      />
      <Route
        path="/settings"
        element={
          <AppLayout>
            <Suspense fallback={<RouteFallback />}>
              <Settings />
            </Suspense>
          </AppLayout>
        }
      />
      <Route
        path="/profile"
        element={
          <AppLayout>
            <Suspense fallback={<RouteFallback />}>
              <Profile />
            </Suspense>
          </AppLayout>
        }
      />
      <Route
        path="/feedback"
        element={
          <AppLayout>
            <Suspense fallback={<RouteFallback />}>
              <Feedback />
            </Suspense>
          </AppLayout>
        }
      />

      <Route
        path="/admin/*"
        element={<Navigate to="/app" replace />}
      />
      <Route
        path="/app/*"
        element={
          <AppLayout>
            <StageBuilder />
          </AppLayout>
        }
      />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
