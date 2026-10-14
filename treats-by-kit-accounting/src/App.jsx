import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider'
import { canSeePath, homeForRole } from './auth/permissions'
import { useAuth } from './auth/useAuth'
import AppLayout from './components/layout/AppLayout'
import ErrorToast from './components/ErrorToast'
import { flattenNavigation } from './config/navigation'
import { pageComponents } from './pages'
import LocalExportPage from './pages/LocalExportPage'
import LoginPage from './pages/LoginPage'
import PendingPage from './pages/PendingPage'

const routes = flattenNavigation()

function RequireAuth() {
  const { configured, session, profile, ready, error } = useAuth()
  const location = useLocation()
  if (!configured) return <LoginPage />
  if (!ready) return <p className="p-8 text-sm text-muted">Loading the books…</p>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile?.active) return <PendingPage />
  if (error) return <p className="p-8 text-sm text-danger">{error}</p>
  if (!canSeePath(profile.role, location.pathname)) {
    return <Navigate to={homeForRole(profile.role)} replace />
  }
  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorToast />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/local-export" element={<LocalExportPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<AppLayout />}>
              {routes.map((item) => {
                const Page = pageComponents[item.id]
                if (item.path === '/') return <Route key={item.id} index element={<Page />} />
                return <Route key={item.id} path={item.path.slice(1)} element={<Page />} />
              })}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
