@echo off
title CricketStats Pro Server
echo ===================================================
echo   CricketStats Pro - Server Startup Script
echo ===================================================
echo.
echo Starting the Python server...

:: Wait a moment and then open the browser
start "" http://localhost:5001/index.html

:loop
echo Running app.py...
python app.py
echo.
echo ===================================================
echo SERVER CRASHED OR STOPPED!
echo Restarting in 5 seconds...
echo ===================================================
timeout /t 5 >nul
goto loop
