#!/bin/bash
# DigitalOcean Droplet Setup Script for local-music
# Run as root on a fresh Ubuntu 24.04 droplet
# Usage: curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/scripts/setup-droplet.sh | bash

set -e

echo "==> Updating system packages..."
apt-get update && apt-get upgrade -y

echo "==> Installing dependencies..."
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    ufw \
    fail2ban \
    git

echo "==> Installing Docker..."
# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Starting Docker..."
systemctl enable docker
systemctl start docker

echo "==> Creating deploy user..."
if ! id "deploy" &>/dev/null; then
    useradd -m -s /bin/bash -G docker deploy
    mkdir -p /home/deploy/.ssh
    cp /root/.ssh/authorized_keys /home/deploy/.ssh/
    chown -R deploy:deploy /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    chmod 600 /home/deploy/.ssh/authorized_keys
    echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
fi

echo "==> Setting up application directory..."
mkdir -p /opt/local-music/backups
chown -R deploy:deploy /opt/local-music

echo "==> Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

echo "==> Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

echo "==> Setting up swap (2GB)..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # Optimize swap settings
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf
    sysctl -p
fi

echo "==> Cleaning up..."
apt-get autoremove -y
apt-get clean

echo ""
echo "============================================"
echo "Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. SSH as deploy user: ssh deploy@YOUR_DROPLET_IP"
echo "2. cd /opt/local-music"
echo "3. Create .env file with production values"
echo "4. Clone your repo or copy docker-compose.prod.yml"
echo "5. Run: docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "Your droplet is ready for deployment!"
