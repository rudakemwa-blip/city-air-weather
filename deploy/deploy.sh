#!/usr/bin/env bash
# Run on Web01 and Web02 (Ubuntu/Debian) as root or with sudo:
#   sudo bash deploy.sh https://github.com/YOUR_USER/city-air-weather.git
# Put your key in /var/www/app/.env first (see step in README), or the script creates a stub to edit.
set -euo pipefail

REPO_URL="${1:?Usage: sudo bash deploy.sh <repo-url>}"
APP_DIR=/var/www/app

echo "==> Installing Node 20 and nginx"
apt-get update -y
apt-get install -y curl git nginx ca-certificates
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Fetching code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull
else
  # keep an existing .env if the folder was pre-created
  [ -f "$APP_DIR/.env" ] && cp "$APP_DIR/.env" /tmp/app.env.bak
  rm -rf "$APP_DIR"; mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO_URL" "$APP_DIR"
  [ -f /tmp/app.env.bak ] && mv /tmp/app.env.bak "$APP_DIR/.env"
fi

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "!! Created $APP_DIR/.env from example. Edit OWM_KEY, then run: systemctl restart app"
fi
chown -R www-data:www-data "$APP_DIR"
chmod 640 "$APP_DIR/.env"

echo "==> Installing configs"
cp "$APP_DIR/deploy/app.service" /etc/systemd/system/app.service
cp "$APP_DIR/deploy/nginx-app.conf" /etc/nginx/sites-available/app
ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
rm -f /etc/nginx/sites-enabled/default

echo "==> Starting services"
systemctl daemon-reload
systemctl enable --now app
systemctl restart app
nginx -t
systemctl enable nginx
systemctl reload nginx || systemctl restart nginx

sleep 2
curl -fsS http://127.0.0.1/api/health && echo && echo "==> Deployed OK"
