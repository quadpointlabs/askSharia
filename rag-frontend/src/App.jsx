import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Register = lazy(() => import('./pages/Register'));
const OwnerLogin = lazy(() => import('./pages/OwnerLogin'));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/" />;
}

function OwnerPrivateRoute({ children }) {
  const token = localStorage.getItem('ownerToken');
  return token ? children : <Navigate to="/owner/login" />;
}

function AdminPrivateRoute({ children }) {
  const token = localStorage.getItem('adminToken');
  return token ? children : <Navigate to="/admin/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {/* User routes */}
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />

          {/* Owner routes */}
          <Route path="/owner/login" element={<OwnerLogin />} />
          <Route
            path="/owner"
            element={
              <OwnerPrivateRoute>
                <OwnerDashboard />
              </OwnerPrivateRoute>
            }
          />

          {/* Admin routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin"
            element={
              <AdminPrivateRoute>
                <AdminDashboard />
              </AdminPrivateRoute>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
