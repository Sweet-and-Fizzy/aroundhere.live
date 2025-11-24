#!/bin/bash
# Initial server setup script
# Run this once on a fresh Ubuntu 24.04 VPS
# Usage: curl -sSL <raw-url> | bash

set -e

echo "=== Local Music Server Setup ==="

# Update system
echo "Updating system packages..."
apt-get update && apt-get upgrade -y

# Install Docker
echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker $USER
fi

# Install Docker Compose plugin
echo "Installing Docker Compose..."
apt-get install -y docker-compose-plugin

# Create app directory
echo "Creating application directory..."
mkdir -p /opt/local-music/backups
cd /opt/local-music

# Create .env file template
if [ ! -f .env ]; then
  echo "Creating .env file..."
  cat > .env << 'EOF'
# Production environment variables
POSTGRES_PASSWORD=CHANGE_ME_TO_SECURE_PASSWORD
DOMAIN=your-domain.com
GITHUB_REPOSITORY=your-username/local-music
IMAGE_TAG=latest

# Optional: For Anthropic API (agents)
# ANTHROPIC_API_KEY=sk-ant-...
EOF
  echo "IMPORTANT: Edit /opt/local-music/.env with your actual values!"
fi

# Set up backup cron job
echo "Setting up daily backup cron job..."
(crontab -l 2>/dev/null | grep -v "backup.sh"; echo "0 2 * * * /opt/local-music/scripts/backup.sh >> /var/log/local-music-backup.log 2>&1") | crontab -

# Create systemd service for auto-start
echo "Creating systemd service..."
cat > /etc/systemd/system/local-music.service << 'EOF'
[Unit]
Description=Local Music Listings
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/local-music
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable local-music

# Configure firewall
echo "Configuring firewall..."
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit /opt/local-music/.env with your values"
echo "2. Copy docker-compose.prod.yml and Caddyfile to /opt/local-music/"
echo "3. Update Caddyfile with your domain"
echo "4. Run: cd /opt/local-music && docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "For GitHub Actions deployment, add these secrets to your repo:"
echo "  - SERVER_HOST: $(curl -s ifconfig.me)"
echo "  - SERVER_USER: root (or your deploy user)"
echo "  - SERVER_SSH_KEY: (generate with: ssh-keygen -t ed25519)"
