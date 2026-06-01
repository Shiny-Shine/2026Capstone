@echo off
title EV Battery Intelligence Dashboard
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve_dashboard.ps1"
