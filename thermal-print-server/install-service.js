/**
 * Instala o servidor de impressão como serviço systemd (Linux/Ubuntu).
 * Execute com sudo: sudo node install-service.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

if (os.platform() === 'win32') {
  console.log('Windows detectado. Use PM2 no Windows:');
  console.log('  npm install -g pm2');
  console.log('  pm2 start server.js --name japan-print');
  console.log('  pm2 save');
  process.exit(0);
}

const serverPath = path.resolve(__dirname, 'server.js');
const nodePath = process.execPath;
const workDir = __dirname;
const user = execSync('whoami').toString().trim();

const unitFile = `/etc/systemd/system/nikkey-box-print.service`;

const unit = `[Unit]
Description=NikkeyBox — Servidor de Impressao Termica
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${workDir}
ExecStart=${nodePath} ${serverPath}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;

try {
  fs.writeFileSync(unitFile, unit);
  execSync('systemctl daemon-reload');
  execSync('systemctl enable nikkey-box-print');
  execSync('systemctl start nikkey-box-print');

  console.log('✅ Serviço instalado e iniciado!');
  console.log('');
  console.log('Comandos úteis:');
  console.log('  sudo systemctl status nikkey-box-print   # ver status');
  console.log('  sudo systemctl stop nikkey-box-print     # parar');
  console.log('  sudo systemctl restart nikkey-box-print  # reiniciar');
  console.log('  sudo journalctl -u nikkey-box-print -f   # ver logs ao vivo');
} catch (e) {
  console.error('❌ Erro:', e.message);
  console.log('Execute com sudo: sudo node install-service.js');
}
