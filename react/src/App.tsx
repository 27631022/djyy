import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, type RouteObject } from "react-router-dom";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { api } from "@/shared/api/client";
import { AuthProvider, useAuth } from "@/stores/auth";
import { Toaster } from "@/shared/components/ui/sonner";

/*
 * ─── 路由级代码分割 ───
 * 全部页面经 React.lazy + 动态 import(指向 feature barrel,与 boundaries 约束一致)加载:
 * 入口包只含框架壳(react/router/query/auth),每个 feature 是独立异步 chunk。
 * 动机:现场互动 40 台手机同时扫码开 /play,原先要下载整个平台 bundle(后台管理/图表/设计器
 * 全在一个包里)导致长时间白屏 —— 拆分后 /play 只拉互动功能块,入口从 ~4MB 降到 ~200KB 级。
 */
const NavPage = lazy(() => import("@/pages/NavPage"));
const WorkbenchHomePage = lazy(() => import("@/pages/WorkbenchHome"));
const LoginPage = lazy(() => import("@/pages/Login"));
const AdminLayout = lazy(() => import("@/layouts/AdminLayout"));
const AdminIndexRedirect = lazy(() =>
  import("@/layouts/AdminLayout").then((m) => ({ default: m.AdminIndexRedirect })),
);

const OrganizationsPage = lazy(() => import("@/features/organization").then((m) => ({ default: m.OrganizationsPage })));
const UsersPage = lazy(() => import("@/features/user").then((m) => ({ default: m.UsersPage })));
const ProfilePage = lazy(() => import("@/features/user").then((m) => ({ default: m.ProfilePage })));
const DirectoryPage = lazy(() => import("@/features/user").then((m) => ({ default: m.DirectoryPage })));
const DirectoryAdminPage = lazy(() => import("@/features/user").then((m) => ({ default: m.DirectoryAdminPage })));
const RolesPage = lazy(() => import("@/features/role").then((m) => ({ default: m.RolesPage })));
const DictionariesPage = lazy(() => import("@/features/dictionary").then((m) => ({ default: m.DictionariesPage })));
const UserCustomFieldsPage = lazy(() => import("@/features/user-custom-field").then((m) => ({ default: m.UserCustomFieldsPage })));
const SiteSettingsPage = lazy(() => import("@/features/site-setting").then((m) => ({ default: m.SiteSettingsPage })));
const NavigationPage = lazy(() => import("@/features/nav-category").then((m) => ({ default: m.NavigationPage })));
const ExternalApisPage = lazy(() => import("@/features/external-api").then((m) => ({ default: m.ExternalApisPage })));
const IconLibraryPage = lazy(() => import("@/features/icon-library").then((m) => ({ default: m.IconLibraryPage })));
const Model3dStudioPage = lazy(() => import("@/features/model3d").then((m) => ({ default: m.Model3dStudioPage })));
const AvatarLibraryPage = lazy(() => import("@/features/avatar").then((m) => ({ default: m.AvatarLibraryPage })));
const AvatarStudioPage = lazy(() => import("@/features/avatar").then((m) => ({ default: m.AvatarStudioPage })));
const HallsPage = lazy(() => import("@/features/exhibition").then((m) => ({ default: m.HallsPage })));
const HallDesignerPage = lazy(() => import("@/features/exhibition").then((m) => ({ default: m.HallDesignerPage })));
const ModelLibraryPage = lazy(() => import("@/features/exhibition").then((m) => ({ default: m.ModelLibraryPage })));
const ExhibitionAssetsPage = lazy(() => import("@/features/exhibition").then((m) => ({ default: m.ExhibitionAssetsPage })));
const PromptsPage = lazy(() => import("@/features/prompt").then((m) => ({ default: m.PromptsPage })));
const VenueRoomsPage = lazy(() => import("@/features/venue").then((m) => ({ default: m.VenueRoomsPage })));
const VenueLayoutDesignerPage = lazy(() => import("@/features/venue").then((m) => ({ default: m.VenueLayoutDesignerPage })));
const VenueSeatingListPage = lazy(() => import("@/features/venue").then((m) => ({ default: m.VenueSeatingListPage })));
const VenueSeatingPlanPage = lazy(() => import("@/features/venue").then((m) => ({ default: m.VenueSeatingPlanPage })));
const VenueSeatingArrangePage = lazy(() => import("@/features/venue").then((m) => ({ default: m.VenueSeatingArrangePage })));
const VenueSeatingWizardPage = lazy(() => import("@/features/venue").then((m) => ({ default: m.VenueSeatingWizardPage })));
const TaskCreatePage = lazy(() => import("@/features/task").then((m) => ({ default: m.TaskCreatePage })));
const TaskListPage = lazy(() => import("@/features/task").then((m) => ({ default: m.TaskListPage })));
const TaskDetailPage = lazy(() => import("@/features/task").then((m) => ({ default: m.TaskDetailPage })));
const TaskInboxPage = lazy(() => import("@/features/task").then((m) => ({ default: m.TaskInboxPage })));
const TaskFillPage = lazy(() => import("@/features/task").then((m) => ({ default: m.TaskFillPage })));
const TaskSummaryPage = lazy(() => import("@/features/task").then((m) => ({ default: m.TaskSummaryPage })));
const TaskWidgetPage = lazy(() => import("@/features/task").then((m) => ({ default: m.TaskWidgetPage })));
const CertificateTemplatesPage = lazy(() => import("@/features/certificate").then((m) => ({ default: m.CertificateTemplatesPage })));
const CertificateDesignerPage = lazy(() => import("@/features/certificate").then((m) => ({ default: m.CertificateDesignerPage })));
const CertificateIssuePage = lazy(() => import("@/features/certificate").then((m) => ({ default: m.CertificateIssuePage })));
const CertificateListPage = lazy(() => import("@/features/certificate").then((m) => ({ default: m.CertificateListPage })));
const CertificateExternalPage = lazy(() => import("@/features/certificate").then((m) => ({ default: m.CertificateExternalPage })));
const CertificateVerifyPage = lazy(() => import("@/features/certificate").then((m) => ({ default: m.CertificateVerifyPage })));
const SchemeListPage = lazy(() => import("@/features/assessment").then((m) => ({ default: m.SchemeListPage })));
const SchemeEditorPage = lazy(() => import("@/features/assessment").then((m) => ({ default: m.SchemeEditorPage })));
const RoundListPage = lazy(() => import("@/features/assessment").then((m) => ({ default: m.RoundListPage })));
const RoundDetailPage = lazy(() => import("@/features/assessment").then((m) => ({ default: m.RoundDetailPage })));
const AssessmentResultsPage = lazy(() => import("@/features/assessment").then((m) => ({ default: m.AssessmentResultsPage })));
const MyAssessmentsPage = lazy(() => import("@/features/assessment").then((m) => ({ default: m.MyAssessmentsPage })));
const MyManagedSchemesPage = lazy(() => import("@/features/assessment").then((m) => ({ default: m.MyManagedSchemesPage })));
const NodeMaintainPage = lazy(() => import("@/features/assessment").then((m) => ({ default: m.NodeMaintainPage })));
const UnitCheckupPage = lazy(() => import("@/features/assessment").then((m) => ({ default: m.UnitCheckupPage })));
const ReportTasksPage = lazy(() => import("@/features/report").then((m) => ({ default: m.ReportTasksPage })));
const ReportCatalogPage = lazy(() => import("@/features/report").then((m) => ({ default: m.ReportCatalogPage })));
const ReportCreatePage = lazy(() => import("@/features/report").then((m) => ({ default: m.ReportCreatePage })));
const PublishChooserPage = lazy(() => import("@/features/report").then((m) => ({ default: m.PublishChooserPage })));
const ReportFillPage = lazy(() => import("@/features/report").then((m) => ({ default: m.ReportFillPage })));
const ReportDetailPage = lazy(() => import("@/features/report").then((m) => ({ default: m.ReportDetailPage })));
const DataImportPage = lazy(() => import("@/features/import").then((m) => ({ default: m.DataImportPage })));
const KnowledgePortalPage = lazy(() => import("@/features/knowledge").then((m) => ({ default: m.KnowledgePortalPage })));
const KnowledgeArticlePage = lazy(() => import("@/features/knowledge").then((m) => ({ default: m.KnowledgeArticlePage })));
const KnowledgeMinePage = lazy(() => import("@/features/knowledge").then((m) => ({ default: m.KnowledgeMinePage })));
const KnowledgeEditorPage = lazy(() => import("@/features/knowledge").then((m) => ({ default: m.KnowledgeEditorPage })));
const KnowledgeArchivePage = lazy(() => import("@/features/knowledge").then((m) => ({ default: m.KnowledgeArchivePage })));
const KnowledgeCategoriesPage = lazy(() => import("@/features/knowledge").then((m) => ({ default: m.KnowledgeCategoriesPage })));
const KnowledgeManagePage = lazy(() => import("@/features/knowledge").then((m) => ({ default: m.KnowledgeManagePage })));
const KnowledgeImportPage = lazy(() => import("@/features/knowledge").then((m) => ({ default: m.KnowledgeImportPage })));
const KnowledgeStatsViewsPage = lazy(() => import("@/features/knowledge").then((m) => ({ default: m.KnowledgeStatsViewsPage })));
const KnowledgeStatsLikesPage = lazy(() => import("@/features/knowledge").then((m) => ({ default: m.KnowledgeStatsLikesPage })));
const KnowledgeFeedbackPage = lazy(() => import("@/features/knowledge").then((m) => ({ default: m.KnowledgeFeedbackPage })));
const ShowcasePortalPage = lazy(() => import("@/features/showcase").then((m) => ({ default: m.ShowcasePortalPage })));
const ShowcaseStagePage = lazy(() => import("@/features/showcase").then((m) => ({ default: m.ShowcaseStagePage })));
const ShowcaseEntryPage = lazy(() => import("@/features/showcase").then((m) => ({ default: m.ShowcaseEntryPage })));
const ShowcaseMinePage = lazy(() => import("@/features/showcase").then((m) => ({ default: m.ShowcaseMinePage })));
const StageEditorPage = lazy(() => import("@/features/showcase").then((m) => ({ default: m.StageEditorPage })));
const EntryEditorPage = lazy(() => import("@/features/showcase").then((m) => ({ default: m.EntryEditorPage })));
const ShowcaseStageReviewPage = lazy(() => import("@/features/showcase").then((m) => ({ default: m.ShowcaseStageReviewPage })));
const ShowcaseEntryReviewPage = lazy(() => import("@/features/showcase").then((m) => ({ default: m.ShowcaseEntryReviewPage })));
const ShowcaseCategoriesPage = lazy(() => import("@/features/showcase").then((m) => ({ default: m.ShowcaseCategoriesPage })));
const ShowcaseFeedbackPage = lazy(() => import("@/features/showcase").then((m) => ({ default: m.ShowcaseFeedbackPage })));
const SearchPage = lazy(() => import("@/features/search").then((m) => ({ default: m.SearchPage })));
const DocFormatPage = lazy(() => import("@/features/doc-format").then((m) => ({ default: m.DocFormatPage })));
const DocFormatTemplatesPage = lazy(() => import("@/features/doc-format").then((m) => ({ default: m.DocFormatTemplatesPage })));
const InteractiveConsolePage = lazy(() => import("@/features/interactive").then((m) => ({ default: m.InteractiveConsolePage })));
const InteractiveScreenPage = lazy(() => import("@/features/interactive").then((m) => ({ default: m.InteractiveScreenPage })));
const InteractivePlayPage = lazy(() => import("@/features/interactive").then((m) => ({ default: m.InteractivePlayPage })));
const InteractiveDesignListPage = lazy(() => import("@/features/interactive").then((m) => ({ default: m.InteractiveDesignListPage })));
const InteractiveGameDesignerPage = lazy(() => import("@/features/interactive").then((m) => ({ default: m.InteractiveGameDesignerPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

/** 把后端站点配置中的主题色注入到 documentElement,前后台全局共享 var。
 *  直接走 shared api client(不 import site-setting barrel,避免把该 feature 拖进入口包)。 */
function ThemeBootstrap(): null {
  const { data } = useQuery({
    queryKey: ["site-settings"],
    queryFn: async () =>
      (await api.get<{ theme: { primary: string; accent: string } }>("/site-settings")).data,
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

/** 路由块加载兜底(Suspense fallback):居中品牌 spinner,与 index.html 首屏内联加载动画同款 */
function PageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-[#9CA3AF]">
      <div
        className="w-9 h-9 rounded-full border-[3px] border-[#E5E7EB] animate-spin"
        style={{ borderTopColor: "var(--party-primary)" }}
      />
      页面加载中…
    </div>
  );
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
    // 带上 hash —— /profile#security 这类锚点路由过期重登后才能回到原位
    const redirect = encodeURIComponent(location.pathname + location.search + location.hash);
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
  { path: "directory", element: <DirectoryAdminPage /> },
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
  // 头像工坊(avatar)
  { path: "avatar-library", element: <AvatarLibraryPage /> },
  { path: "avatar-studio", element: <AvatarStudioPage /> },
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
  { path: "stats/views", element: <KnowledgeStatsViewsPage /> },
  { path: "stats/likes", element: <KnowledgeStatsLikesPage /> },
  { path: "feedback", element: <KnowledgeFeedbackPage /> },
  // 先锋晒场(showcase)后台管理
  // 公文排版模板(排版规则参数)
  { path: "doc-format/templates", element: <DocFormatTemplatesPage /> },
  { path: "showcase/stages", element: <ShowcaseStageReviewPage /> },
  { path: "showcase/entries", element: <ShowcaseEntryReviewPage /> },
  { path: "showcase/categories", element: <ShowcaseCategoriesPage /> },
  { path: "showcase/feedback", element: <ShowcaseFeedbackPage /> },
  // 现场互动(interactive)后台配置台 + 互动游戏编辑器(自制游戏库/三栏设计器)
  { path: "interactive", element: <InteractiveConsolePage /> },
  { path: "interactive/designs", element: <InteractiveDesignListPage /> },
  { path: "interactive/designer/:designId", element: <InteractiveGameDesignerPage /> },
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
        <Suspense fallback={<PageLoader />}>
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* 门户首页:公开访问。需登录的功能在 NavPage 内部按 common 标记灰显 */}
          <Route path="/" element={<NavPage />} />
          {/* 证书公开验证:完全公开,不走 AdminLayout/ProtectedRoute */}
          <Route path="/verify" element={<CertificateVerifyPage />} />
          <Route path="/verify/:token" element={<CertificateVerifyPage />} />
          {/* 个人设置(门户风独立页;门户/后台右上角用户菜单进入) */}
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          {/* 通讯录(门户风独立页;所有登录员工可查同事联系方式) */}
          <Route path="/directory" element={<ProtectedRoute><DirectoryPage /></ProtectedRoute>} />
          {/* 全站搜索结果页(首页/知识门户搜索框回车落地;内容都要登录,访客自动跳登录并回跳) */}
          <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
          {/* 知识分享前台门户(独立于 AdminLayout;内部条例制度 → 登录可见) */}
          <Route path="/knowledge" element={<ProtectedRoute><KnowledgePortalPage /></ProtectedRoute>} />
          <Route path="/knowledge/articles/:id" element={<ProtectedRoute><KnowledgeArticlePage /></ProtectedRoute>} />
          <Route path="/knowledge/mine" element={<ProtectedRoute><KnowledgeMinePage /></ProtectedRoute>} />
          <Route path="/knowledge/edit" element={<ProtectedRoute><KnowledgeEditorPage /></ProtectedRoute>} />
          <Route path="/knowledge/edit/:id" element={<ProtectedRoute><KnowledgeEditorPage /></ProtectedRoute>} />
          <Route path="/knowledge/archive" element={<ProtectedRoute><KnowledgeArchivePage /></ProtectedRoute>} />
          {/* 先锋晒场前台(擂台型晒实绩;new 路由须排在 :id 前) */}
          {/* 公文排版:前台工具,登录即可用(配模板才要 doc-format:manage) */}
          <Route path="/doc-format" element={<ProtectedRoute><DocFormatPage /></ProtectedRoute>} />
          <Route path="/showcase" element={<ProtectedRoute><ShowcasePortalPage /></ProtectedRoute>} />
          <Route path="/showcase/mine" element={<ProtectedRoute><ShowcaseMinePage /></ProtectedRoute>} />
          <Route path="/showcase/stages/new" element={<ProtectedRoute><StageEditorPage /></ProtectedRoute>} />
          <Route path="/showcase/stages/:id" element={<ProtectedRoute><ShowcaseStagePage /></ProtectedRoute>} />
          <Route path="/showcase/stages/:id/edit" element={<ProtectedRoute><StageEditorPage /></ProtectedRoute>} />
          <Route path="/showcase/entries/new" element={<ProtectedRoute><EntryEditorPage /></ProtectedRoute>} />
          <Route path="/showcase/entries/:id" element={<ProtectedRoute><ShowcaseEntryPage /></ProtectedRoute>} />
          <Route path="/showcase/entries/:id/edit" element={<ProtectedRoute><EntryEditorPage /></ProtectedRoute>} />
          {/* 现场互动:大屏(全屏)+ 手机遥控(扫码免登录)。公开顶层路由,不套 ProtectedRoute。
              两条路只走 WebSocket + 公开接口;client.ts 的 401 拦截器已豁免 /screen /play 前缀。 */}
          <Route path="/screen/:room" element={<InteractiveScreenPage />} />
          <Route path="/play/:room" element={<InteractivePlayPage />} />
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
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
