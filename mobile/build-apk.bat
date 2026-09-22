@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "VITR_VERSION=0.1.0"
set "GRADLE_VERSION=9.6.0"
set "TOOLS=.vitr-tools"
set "GRADLE_HOME=%TOOLS%\gradle-%GRADLE_VERSION%"
set "GRADLE_ZIP=%TOOLS%\gradle-%GRADLE_VERSION%-bin.zip"
set "OUT_DIR=%CD%\dist"

where java >nul 2>&1 || (
  echo JDK 21 is required.
  exit /b 1
)

if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_HOME (
  echo ANDROID_HOME is not set and the default Android SDK was not found.
  exit /b 1
)

if not exist "%GRADLE_HOME%\bin\gradle.bat" (
  if not exist "%TOOLS%" mkdir "%TOOLS%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip' -OutFile '%GRADLE_ZIP%'"
  if errorlevel 1 exit /b %errorlevel%
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%GRADLE_ZIP%' -DestinationPath '%TOOLS%' -Force"
  if errorlevel 1 exit /b %errorlevel%
)

if not defined BLOOD_KEYSTORE set "VITR_CI_RELEASE_DEBUG_SIGNING=1"

call "%GRADLE_HOME%\bin\gradle.bat" --no-daemon clean :app:testDebugUnitTest :app:assembleRelease
if errorlevel 1 exit /b %errorlevel%

set "APK=%CD%\app\build\outputs\apk\release\app-release.apk"
if not exist "%APK%" (
  echo APK not found: %APK%
  exit /b 1
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"
copy /Y "%APK%" "%OUT_DIR%\Vitr-%VITR_VERSION%-android.apk" >nul
echo Built %OUT_DIR%\Vitr-%VITR_VERSION%-android.apk
exit /b 0
