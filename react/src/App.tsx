import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { type ReactNode } from "react";
import NavPage from "./pages/NavPage";
import AdminLayout from "./layouts/AdminLayout";
import OrganizationsPage from "./pages/admin/Organizations";
import UsersPage from "./pages/admin/Users";
import RolesPage from "./pages/admin/Roles";
import DictionariesPage from "./pages/admin/Dictionaries";
import UserCustomFieldsPage from "./pages/admin/UserCustomFields";
import LoginPage from "./pages/Login";
import { AuthProvider, useAuth } from "./stores/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

/** 仅登录后可访问;未登录跳 /login?redirect=... */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const location = useLocation();

  if (me === undefined) {
    // 首次加载 /auth/me 中,显示极简骨架避免闪烁
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[#9CA3AF]">
        加载中…
      </div>
    );
  }
  if (me === null) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <NavPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="organizations" replace />} />
            <Route path="organizations" element={<OrganizationsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="dictionaries" element={<DictionariesPage />} />
            <Route path="custom-fields" element={<UserCustomFieldsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
