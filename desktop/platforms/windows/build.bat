@echo off
setlocal

cd /d "%~dp0\..\.."

where cargo >nul 2>&1
if %errorlevel% neq 0 (
  echo Cargo/Rust is required. Install Rust and run this script again.
  exit /b 1
)
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo Node.js is required.
  exit /b 1
)
where npm >nul 2>&1
if %errorlevel% neq 0 (
  echo npm is required.
  exit /b 1
)

call npm ci
if %errorlevel% neq 0 exit /b %errorlevel%

for /f "usebackq delims=" %%V in (`node tools\release-metadata.mjs version`) do set "VITR_VERSION=%%V"
if not defined VITR_VERSION (
  echo Could not determine vitr version.
  exit /b 1
)

call npx --no-install tauri icon web\vitr-icon.png --output src-tauri\icons
if %errorlevel% neq 0 exit /b %errorlevel%

PowerShell -NoProfile -ExecutionPolicy Bypass -File platforms\windows\generate-installer-art.ps1 -Version "%VITR_VERSION%"
if %errorlevel% neq 0 exit /b %errorlevel%

call npm run check
if %errorlevel% neq 0 exit /b %errorlevel%

call npx --no-install tauri build --bundles msi,nsis
if %errorlevel% neq 0 exit /b %errorlevel%

set "MSI_SOURCE=src-tauri\target\release\bundle\msi\vitr_%VITR_VERSION%_x64_en-US.msi"
if not exist "%MSI_SOURCE%" (
  echo Built MSI not found: %MSI_SOURCE%
  exit /b 1
)

set "NSIS_SOURCE=src-tauri\target\release\bundle\nsis\vitr_%VITR_VERSION%_x64-setup.exe"
if not exist "%NSIS_SOURCE%" (
  echo Built Vitr setup EXE not found: %NSIS_SOURCE%
  exit /b 1
)

if not exist "release-upload" mkdir "release-upload"
set "MSI_OUTPUT=release-upload\vitr-%VITR_VERSION%-x64.msi"
set "SETUP_OUTPUT=release-upload\vitr-%VITR_VERSION%-setup.exe"
copy /Y "%MSI_SOURCE%" "%MSI_OUTPUT%" >nul
if %errorlevel% neq 0 exit /b %errorlevel%
copy /Y "%NSIS_SOURCE%" "%SETUP_OUTPUT%" >nul
if %errorlevel% neq 0 exit /b %errorlevel%

if exist "%NSIS_SOURCE%.sig" copy /Y "%NSIS_SOURCE%.sig" "%SETUP_OUTPUT%.sig" >nul
if exist "%MSI_SOURCE%.sig" copy /Y "%MSI_SOURCE%.sig" "%MSI_OUTPUT%.sig" >nul

PowerShell -NoProfile -ExecutionPolicy Bypass -File platforms\windows\smoke-test.ps1 "%MSI_OUTPUT%" "%SETUP_OUTPUT%"
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo Built %MSI_OUTPUT%
echo Built %SETUP_OUTPUT%
exit /b 0
