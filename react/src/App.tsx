import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import NavPage from "@/pages/NavPage";
import WorkbenchPage from "@/pages/Workbench";
import AdminLayout from "@/layouts/AdminLayout";
import { OrganizationsPage } from "@/features/organization";
import { UsersPage } from "@/features/user";
import { RolesPage } from "@/features/role";
import { DictionariesPage } from "@/features/dictionary";
import { UserCustomFieldsPage } from "@/features/user-custom-field";
import { SiteSettingsPage, siteSettingApi } from "@/features/site-setting";
import { NavigationPage } from "@/features/nav-category";
import { ExternalApisPage } from "@/features/external-api";
import { IconLibraryPage } from "@/features/icon-library";
import { Model3dStudioPage } from "@/features/model3d";
import { PromptsPage } from "@/features/prompt";
import {
  TaskCreatePage,
  TaskListPage,
  TaskDetailPage,
  TaskInboxPage,
  TaskFillPage,
  TaskSummaryPage,
  TaskWidgetPage,
} from "@/features/task";
import {
  CertificateTemplatesPage,
  CertificateDesignerPage,
  CertificateIssuePage,
  CertificateListPage,
  CertificateExternalPage,
  CertificateVerifyPage,
} from "@/features/certificate";
import LoginPage from "@/pages/Login";
import { AuthProvider, useAuth } from "@/stores/auth";
import { Toaster } from "@/shared/components/ui/sonner";

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
          {/* 证书公开验证:完全公开,不走 AdminLayout/ProtectedRoute */}
          <Route path="/verify" element={<CertificateVerifyPage />} />
          <Route path="/verify/:token" element={<CertificateVerifyPage />} />
          {/* 工作台:登录后业务应用启动台(原型,假数据)。定稿后接真实待办/权限过滤 + 改登录落地 */}
          <Route
            path="/workbench"
            element={
              <ProtectedRoute>
                <WorkbenchPage />
              </ProtectedRoute>
            }
          />
          {/* 桌面任务小组件(Tauri 挂件加载的透明页;浏览器也可直接开 /widget 调试)。
              挂件自行处理登录(未登录显示紧凑登录),不套 ProtectedRoute,保持透明圆角壳 */}
          <Route path="/widget" element={<TaskWidgetPage />} />
          {/* 桌面客户端「展开成工作台」填报页:挂件点任务 → 窗口放大 → 此路由直接领/填,
              不套 AdminLayout(无后台侧边栏),提交/返回收起回挂件。浏览器里也可直接开调试。 */}
          <Route
            path="/w/fill/:targetId"
            element={
              <ProtectedRoute>
                <div className="relative h-screen">
                  <TaskFillPage />
                </div>
              </ProtectedRoute>
            }
          />
          {/* 桌面客户端「展开成工作台」新建任务向导:挂件「任务管理」点新建 → 窗口放大 →
              此路由整页跑发证式向导,提交/返回收起回挂件。浏览器里也可直接开调试。 */}
          <Route
            path="/w/tasks/new"
            element={
              <ProtectedRoute>
                <div className="relative h-screen">
                  <TaskCreatePage />
                </div>
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
            <Route path="site-settings" element={<SiteSettingsPage />} />
            <Route path="navigation" element={<NavigationPage />} />
            <Route path="external-apis" element={<ExternalApisPage />} />
            <Route path="prompts" element={<PromptsPage />} />
            <Route path="icon-library" element={<IconLibraryPage />} />
            <Route path="certificate-templates" element={<CertificateTemplatesPage />} />
            <Route path="certificate-templates/new" element={<CertificateDesignerPage />} />
            <Route path="certificate-templates/:id/edit" element={<CertificateDesignerPage />} />
            <Route path="certificates" element={<CertificateListPage />} />
            <Route path="certificates/issue" element={<CertificateIssuePage />} />
            <Route path="certificates/external" element={<CertificateExternalPage />} />
            <Route path="tasks" element={<TaskListPage />} />
            <Route path="tasks/inbox" element={<TaskInboxPage />} />
            <Route path="tasks/fill/:targetId" element={<TaskFillPage />} />
            <Route path="tasks/new" element={<TaskCreatePage />} />
            <Route path="tasks/:id/summary" element={<TaskSummaryPage />} />
            <Route path="tasks/:id" element={<TaskDetailPage />} />
            <Route path="model3d" element={<Model3dStudioPage />} />
          </Route>
        </Routes>
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
