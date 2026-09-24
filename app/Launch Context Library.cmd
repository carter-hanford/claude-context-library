@echo off
cd /d "%~dp0"

echo Working directory: %CD%

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo npm was not found on PATH. Install Node 22 or newer, then run this again.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo Electron is missing. Installing dependencies...
  call npm install
)

echo.
echo Starting Context Library...
echo.

call npm start
set status=%errorlevel%

echo.
if not "%status%"=="0" (
  echo npm start exited with an error ^(code %status%^). See output above.
) else (
  echo App closed.
)

echo.
pause
