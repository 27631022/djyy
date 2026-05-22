import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import NavPage from "./pages/NavPage";
import AdminLayout from "./layouts/AdminLayout";
import OrganizationsPage from "./pages/admin/Organizations";
import UsersPage from "./pages/admin/Users";
import RolesPage from "./pages/admin/Roles";
import DictionariesPage from "./pages/admin/Dictionaries";
import UserCustomFieldsPage from "./pages/admin/UserCustomFields";
import SiteSettingsPage from "./pages/admin/SiteSettings";
import NavigationPage from "./pages/admin/Navigation";
import LoginPage from "./pages/Login";
import { AuthProvider, useAuth } from "./stores/auth";
import { Toaster } from "./components/ui/sonner";
import { siteSettingApi } from "./api/site-setting";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

/** 把后端站点配置中的主题色注入到 documentElement,前后台全局共享 var */
function ThemeBootstrap(): null {
  const { data } = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => siteSettingApi.get(),
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    if (!data) return;
    const root = document.documentElement;
    root.style.setProperty("--party-primary", data.theme.primary);
    root.style.setProperty("--party-accent", data.theme.accent);
  }, [data]);
  return null;
}

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
        <ThemeBootstrap />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* 门户首页:公开访问。需登录的功能在 NavPage 内部按 common 标记灰显 */}
          <Route path="/" element={<NavPage />} />
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
            <Route path="site-settings" element={<SiteSettingsPage />} />
            <Route path="navigation" element={<NavigationPage />} />
          </Route>
        </Routes>
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
