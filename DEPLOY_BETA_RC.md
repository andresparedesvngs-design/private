# Deploy beta-RC (Linux + Nginx + PM2)

Ruta del proyecto objetivo: `/var/www/paredes_devs/WHS`

## 0) Quickstart post-clone (recomendado)

```bash
cd /var/www/paredes_devs/WHS
bash script/deploy-beta-rc.sh
```

El script:
- crea `.env` desde `.env.beta-rc.example` (o `.env.example`) si falta
- genera `SESSION_SECRET` si está en placeholder y existe `openssl`
- crea `WWEBJS_AUTH_DIR` y `logs/pm2`
- ejecuta `npm ci`, `npm run build`, `pm2 start/reload` y health check

## 1) Requisitos del servidor

```bash
# Node 20+ recomendado
node -v
npm -v

# PM2 global
npm i -g pm2

# Dependencias Linux para Chromium/Puppeteer (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y \
  ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0 libatk1.0-0 \
  libc6 libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 \
  libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
  xdg-utils wget
```

Si el binario Chrome/Chromium no se detecta automáticamente, define `PUPPETEER_EXECUTABLE_PATH` en `.env`.

## 2) Directorios y permisos persistentes

```bash
sudo mkdir -p /var/www/paredes_devs/whs-auth
sudo chown -R www-data:www-data /var/www/paredes_devs/whs-auth

cd /var/www/paredes_devs/WHS
mkdir -p logs/pm2
```

`WWEBJS_AUTH_DIR` recomendado en producción: `/var/www/paredes_devs/whs-auth`

## 3) Variables de entorno

```bash
cd /var/www/paredes_devs/WHS
cp .env.beta-rc.example .env
nano .env
```

Valores mínimos para beta-RC:

- `NODE_ENV=production`
- `PORT=5000`
- `HOST=127.0.0.1`
- `TRUST_PROXY=loopback`
- `MONGO_URI=<mongodb://...>`
- `SESSION_STORE=mongo`
- `SESSION_SECRET=<secreto-largo>`
- `SESSION_COOKIE_SECURE=true`
- `BASE_URL=https://beta-rc.tu-dominio.com`
- `SOCKET_ORIGIN=https://beta-rc.tu-dominio.com`
- `SOCKET_PATH=/socket.io`
- `WWEBJS_AUTH_DIR=/var/www/paredes_devs/whs-auth`
- `PUPPETEER_DISABLE_SANDBOX=true` (solo si tu host lo requiere)

## 4) Build y arranque inicial

```bash
cd /var/www/paredes_devs/WHS
npm ci
npm run build
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

Verificar:

```bash
pm2 status
curl -s http://127.0.0.1:5000/api/health
```

## 5) Nginx (dominio beta-RC)

Archivo ejemplo: `/etc/nginx/sites-available/beta-rc.conf`

```nginx
server {
    listen 80;
    server_name beta-rc.tu-dominio.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

Habilitar y recargar:

```bash
sudo ln -s /etc/nginx/sites-available/beta-rc.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Para HTTPS, agrega Certbot y repite con `listen 443 ssl`.

## 6) Flujo de despliegue (actualizaciones)

```bash
cd /var/www/paredes_devs/WHS
git pull --ff-only
npm ci
npm run build
pm2 reload ecosystem.config.cjs --env production
pm2 status
```

## 7) Troubleshooting rápido

- `502 Bad Gateway` en Nginx:
  - Verifica `pm2 status` y `curl http://127.0.0.1:5000/api/health`.
- WebSocket no conecta:
  - Confirma bloque `/socket.io/` en Nginx, `SOCKET_PATH=/socket.io`, y `SOCKET_ORIGIN` correcto.
- Error MongoDB al iniciar:
  - Revisa `MONGO_URI`, red/firewall y credenciales.
- Error Puppeteer (`executable not found`):
  - Instala paquetes del sistema y define `PUPPETEER_EXECUTABLE_PATH`.
- Sesiones WhatsApp no persisten:
  - Verifica `WWEBJS_AUTH_DIR` y permisos de escritura del usuario que ejecuta PM2.

Logs:

```bash
pm2 logs whs-beta-rc
pm2 logs whs-beta-rc --lines 200
tail -f /var/www/paredes_devs/WHS/logs/pm2/error.log
```
