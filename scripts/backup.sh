#!/bin/bash

# AI Terminal Backup Script

set -e

APP_NAME="ai-terminal"
BACKUP_DIR="/opt/${APP_NAME}/backups"
DATA_DIR="/opt/${APP_NAME}/data"
CONFIG_DIR="/opt/${APP_NAME}/config"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.tar.gz"

echo "🔄 Starting backup process..."

# Create backup directory
mkdir -p ${BACKUP_DIR}

# Create backup archive
echo "📦 Creating backup archive..."
tar -czf ${BACKUP_FILE} \
    -C /opt/${APP_NAME} \
    data \
    config \
    .env 2>/dev/null || true

# Verify backup
if [ -f "${BACKUP_FILE}" ]; then
    SIZE=$(du -h ${BACKUP_FILE} | cut -f1)
    echo "✅ Backup created: ${BACKUP_FILE} (${SIZE})"
else
    echo "❌ Backup failed!"
    exit 1
fi

# Cleanup old backups (keep last 7 days)
echo "🧹 Cleaning up old backups..."
find ${BACKUP_DIR} -name "backup_*.tar.gz" -mtime +7 -delete

# Upload to cloud storage (if configured)
if [ -n "$BACKUP_S3_BUCKET" ]; then
    echo "☁️ Uploading to S3..."
    aws s3 cp ${BACKUP_FILE} s3://${BACKUP_S3_BUCKET}/ai-terminal/ || echo "⚠️ S3 upload failed"
fi

echo "✅ Backup process completed"
