// 党建益友桌面客户端(瘦壳):窗口加载局域网 web 地址,常驻系统托盘,关闭=最小化到托盘。
// 后台轮询待办 + 原生通知由 web 端检测到运行于 Tauri 时触发(notification 插件 + capability 远程白名单)。
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

/// 唤起主窗口到前台(取消「沉入桌面」+ 显示 + 取消最小化 + 聚焦)。挂件锁到壁纸层后从托盘唤回用。
fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_always_on_bottom(false);
        let _ = w.set_skip_taskbar(false);
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// 把挂件沉入桌面层(永远在其他窗口下方 + 不显示在任务栏),融入壁纸。
fn sink_to_desktop(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_always_on_bottom(true);
        let _ = w.set_skip_taskbar(true);
    }
}

/// 退出登录:清掉挂件页里的登录 token 并刷新 → 回到登录界面;顺带唤回前台。
fn logout_web(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.eval("try{localStorage.removeItem('djyy_auth_token_v1')}catch(e){} location.reload()");
    }
    show_main(app);
}

/// 导航回本地「连接设置」页(?edit=1 让其显示表单并预填上次地址),用于随时改服务器地址。
fn open_config(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        // Windows 上本地页 origin 为 http://tauri.localhost;导航即可回到连接页。
        if let Ok(url) = "http://tauri.localhost/index.html?edit=1".parse::<tauri::Url>() {
            let _ = w.navigate(url);
        }
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// 原生通知(更新进度 / 结果)。
fn notify(app: &tauri::AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

/// 托盘「检查更新」:从**当前连接的服务器**取更新清单并一键更新(下载→安装→自动重启)。
/// 更新地址不写死(服务器 IP 会变)—— 读 webview 当前 URL 的主机(用户连的那台),
/// 指向其 `http://<host>:3001/api/desktop/latest.json`;连哪台、就从哪台更新。
fn check_for_update(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let host = app
            .get_webview_window("main")
            .and_then(|w| w.url().ok())
            .and_then(|u| u.host_str().map(|h| h.to_string()));
        let host = match host {
            Some(h) if h != "tauri.localhost" => h,
            _ => {
                notify(&app, "检查更新", "请先连接服务器,再检查更新");
                return;
            }
        };
        let endpoint = format!("http://{}:3001/api/desktop/latest.json", host);
        if let Err(e) = run_update(&app, &endpoint).await {
            notify(&app, "更新失败", &e);
        }
    });
}

async fn run_update(app: &tauri::AppHandle, endpoint: &str) -> Result<(), String> {
    let url = endpoint
        .parse::<url::Url>()
        .map_err(|_| "更新地址无效".to_string())?;
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => {
            notify(
                app,
                "正在更新",
                &format!("发现新版本 v{},正在下载安装,完成后自动重启…", update.version),
            );
            update
                .download_and_install(|_, _| {}, || {})
                .await
                .map_err(|e| e.to_string())?;
            app.restart();
        }
        Ok(None) => notify(app, "检查更新", "当前已是最新版本"),
        Err(e) => return Err(e.to_string()),
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // 系统托盘:菜单(打开 / 退出)+ 左键点击唤起窗口。
            let open_i = MenuItem::with_id(app, "open", "打开党建益友", true, None::<&str>)?;
            let sink_i = MenuItem::with_id(app, "sink", "沉入桌面(挂件)", true, None::<&str>)?;
            let config_i = MenuItem::with_id(app, "config", "设置服务器地址", true, None::<&str>)?;
            let update_i = MenuItem::with_id(app, "update", "检查更新", true, None::<&str>)?;
            let logout_i = MenuItem::with_id(app, "logout", "退出登录", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&open_i, &sink_i, &config_i, &update_i, &logout_i, &quit_i],
            )?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("党建益友")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "sink" => sink_to_desktop(app),
                    "config" => open_config(app),
                    "update" => check_for_update(app.clone()),
                    "logout" => logout_web(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        // 关闭窗口 = 隐藏到托盘(保持后台 webview 运行,继续轮询待办 + 推通知)。
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
