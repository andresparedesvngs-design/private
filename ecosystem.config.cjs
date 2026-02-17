module.exports = {
  apps: [
    {
      name: "whs-beta-rc",
      cwd: "/var/www/paredes_devs/WHS",
      script: "dist/index.cjs",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      time: true,
      env_file: ".env",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        HOST: "127.0.0.1",
        TRUST_PROXY: "loopback",
      },
      out_file: "logs/pm2/out.log",
      error_file: "logs/pm2/error.log",
      merge_logs: true,
    },
  ],
};