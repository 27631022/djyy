import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, type RouteObject } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import NavPage from "@/pages/NavPage";
import WorkbenchHomePage from "@/pages/WorkbenchHome";
import AdminLayout, { AdminIndexRedirect } from "@/layouts/AdminLayout";
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
import { HallsPage, HallDesignerPage, ModelLibraryPage, ExhibitionAssetsPage } from "@/features/exhibition";
import { PromptsPage } from "@/features/prompt";
import {
  VenueRoomsPage,
  VenueLayoutDesignerPage,
  VenueSeatingListPage,
  VenueSeatingPlanPage,
  VenueSeatingArrangePage,
  VenueSeatingWizardPage,
} from "@/features/venue";
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
import { SchemeListPage, SchemeEditorPage, RoundListPage, RoundDetailPage, AssessmentResultsPage, MyAssessmentsPage, MyManagedSchemesPage, NodeMaintainPage, UnitCheckupPage } from "@/features/assessment";
import { ReportTasksPage, ReportCatalogPage, ReportCreatePage, PublishChooserPage, ReportFillPage, ReportDetailPage } from "@/features/report";
import { DataImportPage } from "@/features/import";
import {
  KnowledgePortalPage,
  KnowledgeArticlePage,
  KnowledgeMinePage,
  KnowledgeEditorPage,
  KnowledgeCategoriesPage,
  KnowledgeManagePage,
  KnowledgeImportPage,
} from "@/features/knowledge";
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

/** 后台 /admin 下的全部叶子路由(相对路径)。AdminLayout 用它做多标签 keep-alive 渲染。 */
const ADMIN_ROUTES: RouteObject[] = [
  { index: true, element: <AdminIndexRedirect /> },
  { path: "home", element: <WorkbenchHomePage /> },
  { path: "organizations", element: <OrganizationsPage /> },
  { path: "users", element: <UsersPage /> },
  { path: "roles", element: <RolesPage /> },
  { path: "data-import", element: <DataImportPage /> },
  { path: "dictionaries", element: <DictionariesPage /> },
  { path: "custom-fields", element: <UserCustomFieldsPage /> },
  { path: "site-settings", element: <SiteSettingsPage /> },
  { path: "navigation", element: <NavigationPage /> },
  { path: "external-apis", element: <ExternalApisPage /> },
  { path: "prompts", element: <PromptsPage /> },
  { path: "icon-library", element: <IconLibraryPage /> },
  { path: "certificate-templates", element: <CertificateTemplatesPage /> },
  { path: "certificate-templates/new", element: <CertificateDesignerPage /> },
  { path: "certificate-templates/:id/edit", element: <CertificateDesignerPage /> },
  { path: "certificates", element: <CertificateListPage /> },
  { path: "certificates/issue", element: <CertificateIssuePage /> },
  { path: "certificates/external", element: <CertificateExternalPage /> },
  { path: "tasks", element: <TaskListPage /> },
  { path: "tasks/inbox", element: <TaskInboxPage /> },
  { path: "tasks/fill/:targetId", element: <TaskFillPage /> },
  { path: "tasks/new", element: <TaskCreatePage /> },
  { path: "tasks/:id/summary", element: <TaskSummaryPage /> },
  { path: "tasks/:id", element: <TaskDetailPage /> },
  { path: "model3d", element: <Model3dStudioPage /> },
  // 3D 展厅(exhibition)
  { path: "halls", element: <HallsPage /> },
  { path: "halls/:hallId/design", element: <HallDesignerPage /> },
  { path: "model-library", element: <ModelLibraryPage /> },
  { path: "exhibition-assets", element: <ExhibitionAssetsPage /> },
  // 会场管理(venue)
  { path: "venue/rooms", element: <VenueRoomsPage /> },
  { path: "venue/layouts/:layoutId", element: <VenueLayoutDesignerPage /> },
  { path: "venue/seating", element: <VenueSeatingListPage /> },
  { path: "venue/seating/:planId", element: <VenueSeatingPlanPage /> },
  { path: "venue/seating/:planId/arrange", element: <VenueSeatingArrangePage /> },
  { path: "venue/seating/:planId/wizard", element: <VenueSeatingWizardPage /> },
  // 考核系统(assessment)
  { path: "assessment/schemes", element: <SchemeListPage /> },
  { path: "assessment/schemes/:id", element: <SchemeEditorPage /> },
  { path: "assessment/schemes/:id/results", element: <AssessmentResultsPage /> },
  { path: "assessment/schemes/:id/checkup", element: <UnitCheckupPage /> },
  { path: "assessment/schemes/:id/node/:code", element: <NodeMaintainPage /> },
  { path: "assessment/rounds", element: <RoundListPage /> },
  { path: "assessment/rounds/:id", element: <RoundDetailPage /> },
  { path: "assessment/mine", element: <MyAssessmentsPage /> },
  { path: "assessment/managed", element: <MyManagedSchemesPage /> },
  // 知识分享(knowledge)后台管理
  { path: "knowledge", element: <KnowledgeManagePage /> },
  { path: "knowledge/categories", element: <KnowledgeCategoriesPage /> },
  { path: "knowledge/import", element: <KnowledgeImportPage /> },
  // 通用报送平台(report)
  { path: "reports", element: <ReportTasksPage /> },
  { path: "reports/publish", element: <PublishChooserPage /> },
  { path: "reports/new", element: <ReportCreatePage /> },
  { path: "reports/fill/:targetId", element: <ReportFillPage /> },
  { path: "reports/catalog", element: <ReportCatalogPage /> },
  { path: "reports/:id", element: <ReportDetailPage /> },
];

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
          {/* 知识分享前台门户(独立于 AdminLayout;内部条例制度 → 登录可见) */}
          <Route path="/knowledge" element={<ProtectedRoute><KnowledgePortalPage /></ProtectedRoute>} />
          <Route path="/knowledge/articles/:id" element={<ProtectedRoute><KnowledgeArticlePage /></ProtectedRoute>} />
          <Route path="/knowledge/mine" element={<ProtectedRoute><KnowledgeMinePage /></ProtectedRoute>} />
          <Route path="/knowledge/edit" element={<ProtectedRoute><KnowledgeEditorPage /></ProtectedRoute>} />
          <Route path="/knowledge/edit/:id" element={<ProtectedRoute><KnowledgeEditorPage /></ProtectedRoute>} />
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
          {/* /admin/* 由 AdminLayout 自己用 ADMIN_ROUTES + useRoutes 渲染(多标签 keep-alive)。
              不再用嵌套 <Route> 子路由 —— AdminLayout 把每个打开过的标签各渲染一份并显隐切换。 */}
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute>
                <AdminLayout routes={ADMIN_ROUTES} />
              </ProtectedRoute>
            }
          />
        </Routes>
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
