module.exports = {
  apps: [
    {
      name: 'japan-whatsapp',
      script: 'server.js',
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: 'production' },
    },
  ],
};
