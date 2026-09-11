@echo off
cd /d "%~dp0"
title Clan Hall bot

if not exist ".env" (
  echo Missing .env. Double-click setup.bat first.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. See START-HERE.txt
  pause
  exit /b 1
)

echo Clan Hall is starting.
echo Leave this window open. Close it to stop the bot.
echo Sleeping the PC also takes the bot offline.
echo.
node index.js
echo.
echo Bot stopped.
pause
