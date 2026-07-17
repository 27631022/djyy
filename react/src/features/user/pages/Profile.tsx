import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpenIcon,
  ChevronLeft,
  ContactIcon,
  IdCardIcon,
  KeyRoundIcon,
  PencilIcon,
  SettingsIcon,
  ShieldCheckIcon,
  TypeIcon,
  UserRoundIcon,
} from "lucide-react";
import { useAuth } from "@/stores/auth";
import { authApi, type AuthMe, type AuthMembership } from "@/features/auth";
import { AvatarChanger, resolveAvatarUrl } from "@/features/avatar";
import { FONT_OPTIONS, initialFontPx, storeFontPx } from "@/features/knowledge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { usersApi, type UpdateMyProfileInput } from "../api";

/** axios 错误提取(class-validator 的 message 可能是数组,取第一条) */
function errMsg(e: unknown, fallback: string): string {
  const m = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  if (Array.isArray(m)) return m[0] ?? fallback;
  return m || fallback;
}

/** 外壳:等 auth 就绪 → key 重挂载内层(零 effect 同步范式;ProtectedRoute 已保证登录) */
export default function ProfilePage() {
  const { me } = useAuth();
  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">加载中…</div>
    );
  }
  return <ProfileView key={me.id} me={me} />;
}

function ProfileView({ me }: { me: AuthMe }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const qc = useQueryClient();

  // 登录模式(公开口):决定「账号安全」显示改密表单还是演示模式说明
  const modeQ = useQuery({ queryKey: ["auth", "mode"], queryFn: authApi.mode });
  const mode = modeQ.data?.mode;

  // 从「修改密码」菜单进来带 #security —— 定位到账号安全卡。
  // 等一帧再跳(布局就绪);用默认 instant 而非 smooth —— smooth 在无动画环境(headless/减少动画)不执行
  useEffect(() => {
    if (location.hash !== "#security") return;
    const raf = requestAnimationFrame(() => {
      document.getElementById("profile-security")?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(raf);
  }, [location.hash]);

  /* ── 头像 ── */
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarMut = useMutation({
    mutationFn: (url: string) => usersApi.updateMyProfile({ avatarUrl: url }),
    onSuccess: async () => {
      await refresh(); // 全站(门户/后台右上角)头像即时更新
      // 列表类缓存里还留着旧 avatarUrl:通讯录(卡片+收藏)/后台用户管理(keep-alive 常驻不会自己刷)
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["directory"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      setAvatarOpen(false);
      toast.success("头像已更新");
    },
    onError: (e) => toast.error(errMsg(e, "头像更新失败")),
  });

  /* ── 联系方式(双侧 trim 比较,防库里历史带空格值导致「打开即脏」)── */
  const [email, setEmail] = useState(me.email ?? "");
  const [phone, setPhone] = useState(me.phone ?? "");
  const emailDirty = email.trim() !== (me.email ?? "").trim();
  const phoneDirty = phone.trim() !== (me.phone ?? "").trim();
  const contactDirty = emailDirty || phoneDirty;
  const contactMut = useMutation({
    // 只提交改动过的字段 —— 整份回传会用本地陈旧值覆盖别处(管理员/另一标签页)的并发修改
    mutationFn: () => {
      const patch: UpdateMyProfileInput = {};
      if (emailDirty) patch.email = email.trim();
      if (phoneDirty) patch.phone = phone.trim();
      return usersApi.updateMyProfile(patch);
    },
    onSuccess: async () => {
      await refresh();
      toast.success("联系方式已保存");
    },
    onError: (e) => toast.error(errMsg(e, "保存失败")),
  });

  /* ── 阅读偏好(与知识文章阅读页共用同一 localStorage key,进文章即生效) ── */
  const [fontPx, setFontPx] = useState<number>(initialFontPx);
  function pickFont(px: number) {
    setFontPx(px);
    storeFontPx(px);
  }

  /* ── 修改密码 ── */
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const pwdMut = useMutation({
    mutationFn: () => authApi.changePassword(oldPwd, newPwd),
    onSuccess: () => {
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
      // 平台会话是无状态 JWT、暂无吊销机制(见 CLAUDE.md 待办「改密吊销会话」),
      // 如实告知其他设备仍保持登录,避免用户误以为改密即踢出全部会话
      toast.success("密码修改成功。下次登录请使用新密码;其他已登录设备仍保持登录,如担心泄露请尽快在各设备重新登录", {
        duration: 8000,
      });
    },
    onError: (e) => toast.error(errMsg(e, "修改密码失败")),
  });
  function submitPwd() {
    if (!oldPwd) return toast.error("请输入原密码");
    if (newPwd.length < 8) return toast.error("新密码至少 8 位");
    if (newPwd === oldPwd) return toast.error("新密码不能与原密码相同");
    if (newPwd !== confirmPwd) return toast.error("两次输入的新密码不一致");
    pwdMut.mutate();
  }

  const avatarSrc = resolveAvatarUrl(me.avatarUrl);
  const isParty = me.memberships.party.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeft className="h-4 w-4" /> 返回门户
          </button>
          <span className="text-gray-200">|</span>
          <span className="font-bold text-gray-900">个人设置</span>
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="ml-auto flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <SettingsIcon className="h-4 w-4" /> 管理后台
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        <div className="grid gap-5 lg:grid-cols-[360px_1fr] items-start">
          {/* ══ 左列:头像 + 基本信息 ══ */}
          <div className="space-y-5">
            <SectionCard icon={UserRoundIcon} title="我的头像" desc="全站(门户、后台、桌面客户端)统一显示">
              <div className="flex flex-col items-center gap-3">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={me.name}
                    className="h-24 w-24 rounded-full object-cover ring-2 ring-[var(--party-primary)]/20"
                  />
                ) : (
                  <div
                    className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white"
                    style={{
                      background:
                        "linear-gradient(to bottom right, var(--party-primary), color-mix(in srgb, var(--party-primary) 80%, black))",
                    }}
                  >
                    {(me.name || me.username || "?").trim().charAt(0)}
                  </div>
                )}
                <div className="text-center">
                  <div className="text-base font-bold text-gray-900">
                    {me.name}
                    {isParty && (
                      <span className="ml-1.5 align-middle rounded bg-party-soft px-1.5 py-0.5 text-[10px] font-normal text-[var(--party-primary)]">
                        党员
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">员工编号 {me.username}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAvatarOpen((v) => !v)}>
                  <PencilIcon className="mr-1 h-3.5 w-3.5" />
                  {avatarOpen ? "收起" : "更换头像"}
                </Button>
              </div>
              {avatarOpen && (
                <div
                  className={`mt-4 border-t border-gray-50 pt-4 ${
                    avatarMut.isPending ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  <AvatarChanger
                    targetName={me.name}
                    employeeNumber={me.username}
                    confirmLabel="设为我的头像"
                    onConfirm={(url) => avatarMut.mutate(url)}
                  />
                  {avatarMut.isPending && (
                    <div className="mt-2 text-center text-xs text-gray-400">正在保存头像…</div>
                  )}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={IdCardIcon} title="基本信息" desc="由管理员维护,如需变更请联系管理员">
              <div className="space-y-3">
                <InfoRow label="姓名" value={me.name} />
                <InfoRow label="员工编号" value={me.username} />
                <MembershipRow label="行政机构" items={me.memberships.admin} />
                <MembershipRow label="党组织" items={me.memberships.party} />
                <div>
                  <div className="text-xs text-gray-400">角色</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {me.roles.length === 0 ? (
                      <span className="text-sm text-gray-400">—</span>
                    ) : (
                      me.roles.map((r) => (
                        <span
                          key={r.code}
                          className="rounded bg-[#EEF4FF] px-1.5 py-0.5 text-xs text-[rgb(26,107,200)]"
                        >
                          {r.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* ══ 右列:联系方式 + 阅读偏好 + 账号安全 ══ */}
          <div className="space-y-5">
            <SectionCard icon={ContactIcon} title="联系方式" desc="用于任务派发咨询、证书联络等场景展示">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">邮箱</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com(留空保存 = 清除)"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">电话</label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="手机或座机(留空保存 = 清除)"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button size="sm" disabled={!contactDirty || contactMut.isPending} onClick={() => contactMut.mutate()}>
                  {contactMut.isPending ? "保存中…" : "保存联系方式"}
                </Button>
                {contactDirty && <span className="text-xs text-amber-600">有未保存的修改</span>}
              </div>
            </SectionCard>

            <SectionCard
              icon={TypeIcon}
              title="阅读偏好"
              desc="知识文章的默认正文字号;保存在本设备浏览器,阅读页顶栏也可随时调整"
            >
              <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden w-fit">
                <span className="flex items-center gap-1 pl-2 pr-1 text-gray-400" title="阅读字号">
                  <TypeIcon className="w-3.5 h-3.5" />
                </span>
                {FONT_OPTIONS.map((o) => (
                  <button
                    key={o.px}
                    type="button"
                    onClick={() => pickFont(o.px)}
                    className={`px-3 py-1.5 text-xs transition-colors ${
                      fontPx === o.px
                        ? "bg-party-soft text-[var(--party-primary)] font-medium"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {o.label}
                    <span className="ml-0.5 text-[10px] opacity-60">{o.px}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-gray-50/80 px-4 py-3 text-gray-700" style={{ fontSize: fontPx }}>
                <BookOpenIcon className="mr-1.5 inline h-[1em] w-[1em] align-[-0.12em] text-[var(--party-primary)]" />
                效果预览:选中的字号将应用于知识文章的正文、导读与热点问答。
              </div>
            </SectionCard>

            <SectionCard
              icon={ShieldCheckIcon}
              title="账号安全"
              desc="登录方式与密码管理"
              id="profile-security"
            >
              <div className="space-y-3">
                <InfoRow
                  label="登录方式"
                  value={
                    mode === undefined
                      ? "…"
                      : mode === "oidc"
                        ? "统一账号登录(单位统一身份认证)"
                        : "演示登录(开发模式,选择账号即登录)"
                  }
                />
                {mode === "oidc" && (
                  <InfoRow
                    label="统一账号"
                    value={me.externalBound ? "已绑定" : "未绑定(首次统一登录后自动绑定)"}
                  />
                )}

                <div className="border-t border-gray-50 pt-3">
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-800">
                    <KeyRoundIcon className="h-3.5 w-3.5 text-[var(--party-primary)]" />
                    修改密码
                  </div>
                  {mode === undefined ? (
                    // 模式未知(加载中/请求失败)不渲染表单 —— mock 环境闪现可交互的改密表单会误导
                    <p className="text-xs text-gray-400">
                      {modeQ.isError ? "无法获取登录方式,请刷新重试" : "正在获取登录方式…"}
                    </p>
                  ) : mode === "mock" ? (
                    <p className="rounded-lg bg-gray-50/80 px-4 py-3 text-xs leading-relaxed text-gray-500">
                      当前为演示登录模式,平台不保存密码,无需修改。
                      正式环境启用统一账号登录后,可在此修改统一账号的登录密码。
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-xs text-gray-500">原密码</label>
                          <Input
                            type="password"
                            autoComplete="current-password"
                            value={oldPwd}
                            onChange={(e) => setOldPwd(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-500">新密码(至少 8 位)</label>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            value={newPwd}
                            onChange={(e) => setNewPwd(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-500">确认新密码</label>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            value={confirmPwd}
                            onChange={(e) => setConfirmPwd(e.target.value)}
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={pwdMut.isPending || !oldPwd || !newPwd || !confirmPwd}
                        onClick={submitPwd}
                      >
                        {pwdMut.isPending ? "提交中…" : "修改密码"}
                      </Button>
                      <p className="text-xs text-gray-400">
                        密码由统一登录服务(单位统一身份)管理,原密码校验与复杂度要求以统一登录服务为准。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 版面小件 ── */

function SectionCard({
  icon: Icon,
  title,
  desc,
  id,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rounded-xl border border-gray-100 bg-white/90 shadow-sm scroll-mt-20">
      <div className="flex items-start gap-2 border-b border-gray-50 px-5 py-3.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--party-primary)]" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-gray-400">{desc}</p>}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-0.5 text-sm text-gray-800">{value}</div>
    </div>
  );
}

function MembershipRow({ label, items }: { label: string; items: AuthMembership[] }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      {items.length === 0 ? (
        <div className="mt-0.5 text-sm text-gray-400">—</div>
      ) : (
        <div className="mt-0.5 space-y-0.5">
          {items.map((m) => (
            <div key={m.orgId} className="text-sm text-gray-800">
              {m.org.name}
              {m.position && <span className="text-gray-500"> · {m.position}</span>}
              {m.isPrimary && items.length > 1 && (
                <span className="ml-1.5 rounded bg-party-soft px-1 py-px text-[10px] text-[var(--party-primary)]">
                  主
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
