; 党建益友 NSIS 安装钩子:装/更新后在桌面建快捷方式,卸载时删除。
!macro NSIS_HOOK_POSTINSTALL
  CreateShortcut "$DESKTOP\党建益友.lnk" "$INSTDIR\desktop.exe"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\党建益友.lnk"
!macroend