@echo off
cd /d "%~dp0"
title Clan Hall setup

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed.
  echo Download the LTS installer from https://nodejs.org
  echo then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" copy /y ".env.example" ".env" >nul
  echo Created .env — paste DISCORD_TOKEN, CLIENT_ID, and GUILD_ID, then save.
  echo Read START-HERE.txt if you do not have those yet.
  echo.
  notepad ".env"
  echo.
  echo Save .env, close Notepad, then press any key to continue...
  pause >nul
)

echo Installing packages (first time can take a minute)...
call npm install
if errorlevel 1 (
  echo.
  echo Install failed. Screenshot this window and send it to your brother.
  pause
  exit /b 1
)

echo.
echo Registering slash commands with Discord...
node deploy-commands.js
if errorlevel 1 (
  echo.
  echo Deploy failed. Check .env values (token, Application ID, Server ID).
  echo Screenshot this window and send it to your brother.
  pause
  exit /b 1
)

echo.
echo Setup worked.
echo Next: double-click start.bat and leave that window open.
echo Then in Discord type  /setup
echo.
pause
