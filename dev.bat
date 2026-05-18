@echo off
start "Docker" cmd /k "docker-compose up db backend frontend"
timeout /t 5 /nobreak
cd frontend && cargo tauri dev