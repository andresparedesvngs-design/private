# Deploy beta-RC (RHEL/AlmaLinux/Rocky + Nginx + PM2)

Ruta del proyecto objetivo: `/var/www/paredes_devs/WHS`

## 0) Quickstart post-clone (recomendado)

```bash
cd /var/www/paredes_devs/WHS
bash script/deploy-beta-rc.sh
```

El script:
- crea `.env` desde `.env.beta-rc.example` (o `.env.example`) si falta
- genera `SESSION_SECRET` si esta en placeholder y existe `openssl`
- crea `WWEBJS_AUTH_DIR` y `logs/pm2`
- ejecuta `npm ci`, `npm run build`, `pm2 start/reload` y health check

## 1) Requisitos del servidor (RHEL)

```bash
# Node 20+ recomendado
node -v
npm -v

# PM2 global
npm i -g pm2
```

Paquetes base:

```bash
sudo dnf install -y \
  git curl wget ca-certificates openssl \
  nginx firewalld policycoreutils-python-utils
```

Paquetes para Chromium/Puppeteer (si usas Chromium del sistema):

```bash
sudo dnf install -y \
  chromium nss atk at-spi2-atk gtk3 pango alsa-lib \
  libX11 libXcomposite libXdamage libXext libXfixes \
  libXrandr libdrm mesa-libgbm xdg-utils
```

Si no tienes `chromium` en tus repositorios, instala Google Chrome y define en `.env`:

- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome`

## 2) Directorios y permisos persistentes

```bash
sudo mkdir -p /var/www/paredes_devs/whs-auth
sudo chown -R aparedes:aparedes /var/www/paredes_devs/whs-auth

cd /var/www/paredes_devs/WHS
mkdir -p logs/pm2
```

`WWEBJS_AUTH_DIR` recomendado en produccion:
`/var/www/paredes_devs/whs-auth`

## 3) Variables de entorno

```bash
cd /var/www/paredes_devs/WHS
cp .env.beta-rc.example .env
nano .env
```

Valores minimos para beta-RC:

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
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome` (si aplica)
- `PUPPETEER_DISABLE_SANDBOX=true` (solo si tu host lo requiere)

## 4) Build y arranque inicial

```bash
cd /var/www/paredes_devs/WHS
npm ci
npm run build
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd -u aparedes --hp /home/aparedes
```

Verificar:

```bash
pm2 status
curl -s http://127.0.0.1:5000/api/health
```

## 5) Nginx (RHEL)

Archivo recomendado: `/etc/nginx/conf.d/beta-rc.conf`

```nginx
server {
    listen 80;
    server_name beta-rc.tu-dominio.com;

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
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

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Habilitar y recargar:

```bash
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

HTTPS con Certbot (opcional):

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d beta-rc.tu-dominio.com
```

## 6) SELinux y firewall (RHEL)

Permitir que Nginx haga proxy hacia Node:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

Abrir puertos web:

```bash
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 7) Flujo de despliegue (actualizaciones)

```bash
cd /var/www/paredes_devs/WHS
git pull --ff-only
npm ci
npm run build
pm2 reload ecosystem.config.cjs --env production
pm2 status
```

## 8) Verificaciones utiles (proxy/API)

```bash
# Backend directo (debe responder JSON)
curl -i http://127.0.0.1:5000/api/auth/me

# Dominio publico
curl -i https://beta-rc.tu-dominio.com/api/auth/me
```

Si backend local responde JSON pero por dominio llega HTML, revisa Nginx
y confirma que `location /api/` este correcto.

## 9) Troubleshooting rapido

- `502` o `504` en Nginx:
  - `pm2 status`
  - `curl http://127.0.0.1:5000/api/health`
  - revisa timeouts en `location /api/`
- WebSocket no conecta:
  - confirma bloque `/socket.io/` y `SOCKET_PATH=/socket.io`
- Error Puppeteer (`executable not found`):
  - instala Chromium/Chrome y define `PUPPETEER_EXECUTABLE_PATH`
- Sesiones WhatsApp no persisten:
  - revisa `WWEBJS_AUTH_DIR` y permisos de escritura

Logs:

```bash
pm2 logs whs-beta-rc
pm2 logs whs-beta-rc --lines 200
tail -f /var/www/paredes_devs/WHS/logs/pm2/error.log
```
