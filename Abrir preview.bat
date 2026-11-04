@echo off
title JH RedeFlow - preview local
cd /d "%~dp0"
start "" http://localhost:8000
npm run preview
