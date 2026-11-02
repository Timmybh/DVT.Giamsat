@echo off
rem Chay nen cho Task Scheduler (tai khoan SYSTEM): ghi log vao logs\app.log, node thoat thi tu chay lai sau 10 giay.
rem Chay tay de xem truc tiep thi dung start.bat.
cd /d "%~dp0"
if not exist logs mkdir logs
if not exist .env copy .env.example .env >nul
set "NODE_EXE=node"
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
:lap
echo [%date% %time%] Khoi dong server >> logs\app.log
"%NODE_EXE%" server.js >> logs\app.log 2>&1
echo [%date% %time%] Server dung (ma %errorlevel%), chay lai sau 10 giay >> logs\app.log
timeout /t 10 /nobreak >nul
goto lap
