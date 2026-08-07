#!/usr/bin/env bash
# NikkeyBox — Instala o WhatsApp Server como serviço via pm2
# Roda no PC do operador (Linux ou macOS).
# sudo não é necessário — o pm2 startup pedirá o comando certo.

set -e
cd "$(dirname "$0")"

echo ""
echo "=== NikkeyBox WhatsApp Server — Instalação com pm2 ==="
echo ""

# Instala dependências npm do servidor
echo "[1/4] Instalando dependências npm..."
npm install

# Instala pm2 globalmente, se não tiver
if ! command -v pm2 &>/dev/null; then
  echo "[2/4] Instalando pm2 globalmente..."
  npm install -g pm2
else
  echo "[2/4] pm2 já instalado: $(pm2 --version)"
fi

# Inicia o servidor com pm2
echo "[3/4] Iniciando servidor com pm2..."
pm2 start ecosystem.config.js

# Salva a lista de processos para o startup
pm2 save

# Gera o comando de startup (initd / systemd / launchd)
echo ""
echo "[4/4] Configurando inicialização automática no boot..."
echo ""
echo "────────────────────────────────────────────────────────"
echo " Execute o comando abaixo como root/sudo para finalizar:"
echo ""
pm2 startup | tail -1
echo ""
echo "────────────────────────────────────────────────────────"
echo ""
echo "✅ Pronto! O servidor WhatsApp vai:"
echo "   • Iniciar sozinho no boot do PC"
echo "   • Reiniciar automaticamente se cair"
echo "   • Manter a sessão do WhatsApp salva (sem pedir QR de novo)"
echo ""
echo "Comandos úteis:"
echo "  pm2 status               — ver se está rodando"
echo "  pm2 logs japan-whatsapp  — ver logs em tempo real"
echo "  pm2 restart japan-whatsapp — reiniciar"
echo "  pm2 stop japan-whatsapp  — parar"
echo ""
echo "QR code (primeira vez): abra http://localhost:3220/qr no navegador"
echo ""
