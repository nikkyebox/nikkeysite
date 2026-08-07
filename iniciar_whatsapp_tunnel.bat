@echo off
title NikkeyBox - WhatsApp & ngrok
chcp 65001 > nul
echo ========================================================
echo 🏮 NikkeyBox - WhatsApp & ngrok Tunnel
echo ========================================================
echo.

:: 1. Verificar se a pasta erp\whatsapp-service existe
if not exist "erp\whatsapp-service" (
    echo [ERRO] Pasta erp\whatsapp-service não encontrada!
    echo Certifique-se de que está executando este arquivo na raiz do projeto.
    pause
    exit /b
)

:: 2. Iniciar Serviço de WhatsApp
echo [1/3] Iniciando o Serviço do WhatsApp...
start "WhatsApp Service" cmd /k "cd erp\whatsapp-service && npm run start"

:: 3. Iniciar Túnel ngrok
echo [2/3] Iniciando o Túnel ngrok na porta 3001...
start "ngrok Tunnel" cmd /k "C:\Users\VAIO\AppData\Local\ngrok\ngrok.exe http 3001"

:: 4. Aguardar inicialização e buscar URL
echo [3/3] Aguardando o ngrok carregar a URL (5 segundos)...
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
    "  Write-Host '📋 A URL FOI COPIADA PARA A ÁREA DE TRANSFERÊNCIA!'; " ^
    "  Write-Host '👉 Cole ela no painel de configurações do seu ERP na nuvem.'; " ^
    "} else { " ^
    "  Write-Host '❌ Não foi possível obter a URL do ngrok. Verifique se o ngrok está rodando.' -ForegroundColor Red; " ^
    "}"

echo ========================================================
echo.
pause
