@echo off
setlocal
cd /d "%~dp0\..\.."
call npm ci
if %errorlevel% neq 0 exit /b %errorlevel%
call npm run tauri:dev
exit /b %errorlevel%
