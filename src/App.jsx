import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout.jsx'
import Feedback from './routes/Feedback.jsx'
import PrivacyPolicy from './routes/PrivacyPolicy.jsx'
import Profile from './routes/Profile.jsx'
import StageBuilder from './routes/StageBuilder.jsx'
import Terms from './routes/Terms.jsx'
import Settings from './routes/Settings.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />

      <Route
        path="/privacy"
        element={
          <AppLayout>
            <PrivacyPolicy />
          </AppLayout>
        }
      />
      <Route
        path="/terms"
        element={
          <AppLayout>
            <Terms />
          </AppLayout>
        }
      />
      <Route
        path="/settings"
        element={
          <AppLayout>
            <Settings />
          </AppLayout>
        }
      />
      <Route
        path="/profile"
        element={
          <AppLayout>
            <Profile />
          </AppLayout>
        }
      />
      <Route
        path="/feedback"
        element={
          <AppLayout>
            <Feedback />
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
