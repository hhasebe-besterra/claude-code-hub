@echo off
REM claude-code-hub watcher 起動用バッチ
REM 先に setx CCHUB_TOKEN "ghp_xxx" で PAT を設定しておくこと
cd /d "%~dp0"
python watch.py
pause
