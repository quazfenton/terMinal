#!/bin/bash

# AI Terminal Deployment Script

set -e

echo "🚀 Starting AI Terminal deployment..."

# Configuration
APP_NAME="ai-terminal"
VERSION=${1:-latest}
REGISTRY=${REGISTRY:-"localhost:5000"}
ENVIRONMENT=${ENVIRONMENT:-"production"}

# Build Docker image
echo "📦 Building Docker image..."
docker build -t ${APP_NAME}:${VERSION} .
docker tag ${APP_NAME}:${VERSION} ${REGISTRY}/${APP_NAME}:${VERSION}

# Push to registry (if not local)
if [ "$REGISTRY" != "localhost:5000" ]; then
    echo "📤 Pushing to registry..."
    docker push ${REGISTRY}/${APP_NAME}:${VERSION}
fi

# Create deployment directory
DEPLOY_DIR="/opt/${APP_NAME}"
sudo mkdir -p ${DEPLOY_DIR}/{config,logs,data,backups}

# Copy configuration
echo "⚙️ Setting up configuration..."
sudo cp config/${ENVIRONMENT}.json ${DEPLOY_DIR}/config/
sudo cp .env.example ${DEPLOY_DIR}/.env

# Set permissions
sudo chown -R 1001:1001 ${DEPLOY_DIR}

# Create systemd service
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/${APP_NAME}.service > /dev/null <<EOF
[Unit]
Description=AI Terminal Application
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/docker run -d \\
    --name ${APP_NAME} \\
    --restart unless-stopped \\
    -p 3000:3000 \\
    -v ${DEPLOY_DIR}/config:/app/config:ro \\
    -v ${DEPLOY_DIR}/logs:/app/logs \\
    -v ${DEPLOY_DIR}/data:/app/data \\
    -v ${DEPLOY_DIR}/.env:/app/.env:ro \\
    ${REGISTRY}/${APP_NAME}:${VERSION}
ExecStop=/usr/bin/docker stop ${APP_NAME}
ExecStopPost=/usr/bin/docker rm ${APP_NAME}

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
echo "🎯 Starting service..."
sudo systemctl daemon-reload
sudo systemctl enable ${APP_NAME}
sudo systemctl start ${APP_NAME}

# Setup log rotation
echo "📋 Setting up log rotation..."
sudo tee /etc/logrotate.d/${APP_NAME} > /dev/null <<EOF
${DEPLOY_DIR}/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 1001 1001
}
EOF

# Setup backup cron
echo "💾 Setting up backups..."
sudo tee /etc/cron.d/${APP_NAME}-backup > /dev/null <<EOF
0 2 * * * root /opt/${APP_NAME}/scripts/backup.sh
EOF

echo "✅ Deployment complete!"
echo "📊 Service status:"
sudo systemctl status ${APP_NAME} --no-pager

echo "🔍 Health check:"
sleep 10
curl -f http://localhost:3000/health || echo "⚠️ Health check failed"

echo "📝 Logs location: ${DEPLOY_DIR}/logs"
echo "⚙️ Config location: ${DEPLOY_DIR}/config"
