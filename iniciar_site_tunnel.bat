@echo off
title NikkeyBox - Site & ngrok
chcp 65001 > nul
echo ========================================================
echo 🏮 NikkeyBox - Site & ngrok Tunnel
echo ========================================================
echo.

:: 1. Iniciar Servidor de Desenvolvimento Vite
echo [1/2] Iniciando o Servidor Vite...
start "Vite Dev Server" cmd /k "npm run dev"

:: 2. Iniciar Túnel ngrok para a porta 8080
echo [2/2] Iniciando o Túnel ngrok na porta 8080...
start "ngrok Tunnel" cmd /k "C:\Users\VAIO\AppData\Local\ngrok\ngrok.exe http 8080"

:: 3. Aguardar inicialização e buscar URL
echo Aguardando o ngrok carregar a URL (5 segundos)...
timeout /t 5 > nul

echo.
echo ========================================================
echo 📡 BUSCANDO URL DO NGROK...
echo ========================================================

powershell -Command ^
    "$tunnels = Invoke-RestMethod -Uri http://localhost:4040/api/tunnels; " ^
    "if ($tunnels -and $tunnels.tunnels) { " ^
    "  $url = $tunnels.tunnels[0].public_url; " ^
    "  $url | clip; " ^
    "  Write-Host '✅ URL DO NGROK ENCONTRADA!' -ForegroundColor Green; " ^
    "  Write-Host $url -ForegroundColor Yellow; " ^
    "  Write-Host '------------------------------------------------'; " ^
    "  Write-Host '📋 A URL DO SITE FOI COPIADA PARA A ÁREA DE TRANSFERÊNCIA!'; " ^
    "  Write-Host '👉 Cole-a no navegador para acessar seu site de qualquer dispositivo.'; " ^
    "} else { " ^
    "  Write-Host '❌ Não foi possível obter a URL do ngrok. Verifique se o ngrok está rodando.' -ForegroundColor Red; " ^
    "}"

echo ========================================================
echo.
pause
