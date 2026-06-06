@echo off
echo ============================================
echo   djyy servers - INDEPENDENT windows
echo   (NOT tied to Claude chat session)
echo   keep BOTH windows open for LAN access
echo ============================================
echo This machine current IPv4 (LAN PCs connect to  thisIP:5173 ):
ipconfig | findstr /C:"IPv4"
echo ============================================
echo Starting backend(3001) + frontend(5173) ...
start "djyy-backend-3001" cmd /k "cd /d D:\web\djyy\backend && npm run start:dev"
start "djyy-frontend-5173" cmd /k "cd /d D:\web\djyy\react && npm run dev"
echo.
echo Done. Close a window to stop that server.
echo Tip: put a shortcut to this .bat into the Startup folder to auto-run on boot.
timeout /t 8 >nul
