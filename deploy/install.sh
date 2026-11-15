#!/usr/bin/env bash
# One-time server setup for Overmind (Debian / Ubuntu, run as root).
# Expects the project archive at /tmp/overmind.tgz. Safe to re-run to update the app.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y nginx curl ca-certificates tar
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

id overmind >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/overmind --shell /usr/sbin/nologin overmind
systemctl stop overmind 2>/dev/null || true
rm -rf /opt/overmind/app && mkdir -p /opt/overmind/app
tar -xzf /tmp/overmind.tgz -C /opt/overmind/app
mkdir -p /var/www/overmind
chown -R overmind:overmind /opt/overmind /var/www/overmind
chmod +x /opt/overmind/app/deploy/start.sh

for d in contracts agent web; do
  sudo -u overmind -H bash -c "cd /opt/overmind/app/$d && npm ci --no-audit --no-fund"
done
sudo -u overmind -H bash -c "cd /opt/overmind/app/contracts && npx hardhat compile"

cp /opt/overmind/app/deploy/overmind.service /etc/systemd/system/overmind.service
cp /opt/overmind/app/deploy/nginx-overmind.conf /etc/nginx/sites-available/overmind
cp /opt/overmind/app/deploy/nginx-ratelimit.conf /etc/nginx/conf.d/overmind-ratelimit.conf
ln -sf /etc/nginx/sites-available/overmind /etc/nginx/sites-enabled/overmind
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx || systemctl restart nginx
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp; ufw allow 443/tcp; fi

systemctl daemon-reload
systemctl enable --now overmind
echo "Overmind installed. First start takes ~2-3 minutes (seeding + build). Logs: journalctl -u overmind -f"
