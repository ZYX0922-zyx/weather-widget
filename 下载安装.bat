@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" "%SystemRoot%\System32\mshta.exe" "%~dp0installer\setup.hta"
exit /b 0
