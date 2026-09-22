@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "APP_NAME=Frxe"
set "VERSION=0.6.7"
set "SIGNER=void"
set "GRADLE_VERSION=9.6.0"
set "TOOLS=.frxe-tools"
set "GRADLE_HOME=%TOOLS%\gradle-%GRADLE_VERSION%"
set "ZIP=%TOOLS%\gradle-%GRADLE_VERSION%-bin.zip"
set "SIGN_DIR=.frxe-signing"
set "KEYSTORE=%CD%\%SIGN_DIR%\void-release.jks"
set "SIGN_PROPS=%SIGN_DIR%\signing.properties"
set "LOG_DIR=%CD%\build-logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss-fff"') do set "BUILD_STAMP=%%T"
if not defined BUILD_STAMP set "BUILD_STAMP=unknown-time"
set "BUILD_LOG=%LOG_DIR%\Frxe-%VERSION%-%BUILD_STAMP%.log"
set "LATEST_FAIL=%LOG_DIR%\latest-failure.log"

>"%BUILD_LOG%" echo ============================================================
>>"%BUILD_LOG%" echo FRXE RELEASE BUILD LOG
>>"%BUILD_LOG%" echo Version: %VERSION%
>>"%BUILD_LOG%" echo Started: %DATE% %TIME%
>>"%BUILD_LOG%" echo Working directory: %CD%
>>"%BUILD_LOG%" echo ============================================================

call :say "============================================================"
call :say "                FRXE RELEASE BUILD - VOID"
call :say "============================================================"
call :say "[INFO] Build log: %BUILD_LOG%"

where java >nul 2>&1
if errorlevel 1 (
  call :fail "Java was not found. Install JDK 21 and retry." 1
  goto :eof
)

where keytool >nul 2>&1
if errorlevel 1 (
  call :fail "keytool was not found. Install a full JDK 21 and retry." 1
  goto :eof
)

for /f "tokens=3" %%V in ('java -version 2^>^&1 ^| findstr /i "version"') do set JAVA_VER=%%~V
call :say "[OK] Java !JAVA_VER!"

if not defined ANDROID_HOME (
  if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
)
if not defined ANDROID_HOME (
  call :fail "ANDROID_HOME is not set and %%LOCALAPPDATA%%\Android\Sdk was not found. Install Android Studio / SDK 37 first." 1
  goto :eof
)

>local.properties echo sdk.dir=%ANDROID_HOME:\=\\%
call :say "[OK] Android SDK: %ANDROID_HOME%"

if not exist "%SIGN_DIR%" mkdir "%SIGN_DIR%"
if not exist "%SIGN_PROPS%" (
  for /f %%P in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')"') do set "VOID_PASSWORD=%%P"
  if not defined VOID_PASSWORD (
    call :fail "Could not generate the local signing password." 1
    goto :eof
  )
  >"%SIGN_PROPS%" echo STORE_PASSWORD=!VOID_PASSWORD!
  >>"%SIGN_PROPS%" echo KEY_PASSWORD=!VOID_PASSWORD!
  >>"%SIGN_PROPS%" echo KEY_ALIAS=void
)

for /f "usebackq tokens=1,* delims==" %%A in ("%SIGN_PROPS%") do (
  if /i "%%A"=="STORE_PASSWORD" set "VOID_STORE_PASSWORD=%%B"
  if /i "%%A"=="KEY_PASSWORD" set "VOID_KEY_PASSWORD=%%B"
  if /i "%%A"=="KEY_ALIAS" set "VOID_KEY_ALIAS=%%B"
)
set "VOID_KEYSTORE=%KEYSTORE%"

if not defined VOID_STORE_PASSWORD (
  call :fail "Signing password is missing from %SIGN_PROPS%." 1
  goto :eof
)
if not defined VOID_KEY_PASSWORD set "VOID_KEY_PASSWORD=%VOID_STORE_PASSWORD%"
if not defined VOID_KEY_ALIAS set "VOID_KEY_ALIAS=void"

if not exist "%KEYSTORE%" (
  call :say "[INFO] Creating persistent release signing key: void"
  keytool -genkeypair -v -keystore "%KEYSTORE%" -storetype PKCS12 -storepass "%VOID_STORE_PASSWORD%" -keypass "%VOID_KEY_PASSWORD%" -alias "%VOID_KEY_ALIAS%" -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=void, OU=void, O=void, L=void, ST=void, C=CH" >>"%BUILD_LOG%" 2>&1
  if errorlevel 1 (
    call :fail "Could not create the void release signing key." 1
    goto :eof
  )
)

call :say "[OK] Signing identity: void"
call :say "[OK] Download priority: InnerTube -> NewPipe -> yt-dlp -> Zexl -> Cobalt"
if defined FRXE_ZEXL_BASE_URL (
  call :say "[OK] Zexl fallback endpoint: configured by FRXE_ZEXL_BASE_URL"
) else (
  call :say "[INFO] Zexl fallback endpoint: https://zexl.onrender.com"
)
if defined FRXE_ZEXL_API_KEY call :say "[OK] Zexl API key: configured"
if defined FRXE_COBALT_BASE_URL (
  call :say "[OK] Cobalt fallback endpoint: configured by FRXE_COBALT_BASE_URL"
) else (
  call :say "[INFO] Cobalt fallback endpoint: not configured"
)
if defined FRXE_COBALT_API_KEY call :say "[OK] Cobalt API key: configured"

if not exist "%GRADLE_HOME%\bin\gradle.bat" (
  if not exist "%TOOLS%" mkdir "%TOOLS%"
  call :say "[INFO] Preparing Gradle %GRADLE_VERSION%..."
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip' -OutFile '%ZIP%'" >>"%BUILD_LOG%" 2>&1
  if errorlevel 1 (
    call :fail "Could not download Gradle." 1
    goto :eof
  )
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%ZIP%' -DestinationPath '%TOOLS%' -Force" >>"%BUILD_LOG%" 2>&1
  if errorlevel 1 (
    call :fail "Could not unpack Gradle." 1
    goto :eof
  )
)

call :say "[INFO] Building signed release APK..."
>>"%BUILD_LOG%" echo.
>>"%BUILD_LOG%" echo [GRADLE] clean assembleRelease --stacktrace
call "%GRADLE_HOME%\bin\gradle.bat" --no-daemon --stacktrace clean assembleRelease >>"%BUILD_LOG%" 2>&1
set "BUILD_EXIT=!ERRORLEVEL!"

if not "!BUILD_EXIT!"=="0" (
  copy /y "%BUILD_LOG%" "%LATEST_FAIL%" >nul
  echo.
  echo [ERROR] Frxe release build failed with exit code !BUILD_EXIT!.
  echo [ERROR] Full log: "%BUILD_LOG%"
  echo [ERROR] Latest failure copy: "%LATEST_FAIL%"
  echo.
  echo ---------------- LAST 80 LOG LINES ----------------
  powershell -NoProfile -Command "Get-Content -Path '%BUILD_LOG%' -Tail 80"
  echo ---------------------------------------------------
  exit /b !BUILD_EXIT!
)

set "APK=%CD%\app\build\outputs\apk\release\app-release.apk"
if not exist "%APK%" (
  call :fail "Build finished but the signed APK was not found." 1
  goto :eof
)

copy /y "%APK%" "%CD%\Frxe-%VERSION%-void-release.apk" >nul
call :say "[SUCCESS] Signed release APK: %CD%\Frxe-%VERSION%-void-release.apk"
call :say "[SUCCESS] Build log: %BUILD_LOG%"
call :say "[IMPORTANT] Keep %SIGN_DIR% backed up. Android updates must use the same signing key."
exit /b 0

:say
set "LINE=%~1"
echo !LINE!
>>"%BUILD_LOG%" echo !LINE!
exit /b 0

:fail
set "FAIL_MESSAGE=%~1"
set "FAIL_CODE=%~2"
echo [ERROR] !FAIL_MESSAGE!
>>"%BUILD_LOG%" echo [ERROR] !FAIL_MESSAGE!
copy /y "%BUILD_LOG%" "%LATEST_FAIL%" >nul
 echo [ERROR] Full log: "%BUILD_LOG%"
 echo [ERROR] Latest failure copy: "%LATEST_FAIL%"
exit /b !FAIL_CODE!