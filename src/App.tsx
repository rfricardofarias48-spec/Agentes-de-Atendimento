import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'

import Login from './pages/auth/Login'
import ResetPassword from './pages/auth/ResetPassword'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AdminLayout from './components/layout/AdminLayout'
import ClientLayout from './components/layout/ClientLayout'

import AdminDashboard from './pages/admin/AdminDashboard'
import AdminClients from './pages/admin/AdminClients'
import AdminClientDetail from './pages/admin/AdminClientDetail'
import AdminBilling from './pages/admin/AdminBilling'
import AdminSales from './pages/admin/AdminSales'

import ClientDashboard from './pages/client/ClientDashboard'
import ClientAppointments from './pages/client/ClientAppointments'
import ClientTraining from './pages/client/ClientTraining'
import ClientPayments from './pages/client/ClientPayments'
import ClientSettings from './pages/client/ClientSettings'

function RootRedirect() {
  const { session, role, loading } = useAuth()
  // Aguarda troca do código PKCE do OAuth antes de redirecionar
  const hasPendingOAuth = window.location.search.includes('code=')
  if (loading || hasPendingOAuth) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={role === 'admin' ? '/admin' : '/dashboard'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Admin */}
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="admin">
              <AdminLayout><AdminDashboard /></AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/clients" element={
            <ProtectedRoute requiredRole="admin">
              <AdminLayout><AdminClients /></AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/clients/new" element={<Navigate to="/admin/clients" replace />} />
          <Route path="/admin/clients/:id" element={
            <ProtectedRoute requiredRole="admin">
              <AdminLayout><AdminClientDetail /></AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/sales" element={
            <ProtectedRoute requiredRole="admin">
              <AdminLayout><AdminSales /></AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/billing" element={
            <ProtectedRoute requiredRole="admin">
              <AdminLayout><AdminBilling /></AdminLayout>
            </ProtectedRoute>
          } />

          {/* Client */}
          <Route path="/dashboard" element={
            <ProtectedRoute requiredRole="client">
              <ClientLayout><ClientDashboard /></ClientLayout>
            </ProtectedRoute>
          } />
          <Route path="/dashboard/appointments" element={
            <ProtectedRoute requiredRole="client">
              <ClientLayout><ClientAppointments /></ClientLayout>
            </ProtectedRoute>
          } />
          <Route path="/dashboard/training" element={
            <ProtectedRoute requiredRole="client">
              <ClientLayout><ClientTraining /></ClientLayout>
            </ProtectedRoute>
          } />
          <Route path="/dashboard/payments" element={
            <ProtectedRoute requiredRole="client" allowWhenSuspended>
              <ClientLayout><ClientPayments /></ClientLayout>
            </ProtectedRoute>
          } />
          <Route path="/dashboard/settings" element={
            <ProtectedRoute requiredRole="client">
              <ClientLayout><ClientSettings /></ClientLayout>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
