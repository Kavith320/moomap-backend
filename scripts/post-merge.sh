#!/bin/bash

# Exit on error
set -e

echo -e "\n\x1b[36m[Git Hook]\x1b[0m Merge completed. Running post-merge hooks..."

# Get changed files between the previous HEAD and new HEAD
CHANGED_FILES=$(git diff-tree -r --no-commit-id --name-only HEAD@{1} HEAD || echo "")

if [ -z "$CHANGED_FILES" ]; then
  echo -e "\x1b[36m[Git Hook]\x1b[0m No file changes detected."
  exit 0
fi

# Flag to check if we need to restart/install
RESTART_BACKEND=false
RESTART_FRONTEND=false
INSTALL_BACKEND=false
INSTALL_FRONTEND=false

# Check backend files changed (any files NOT starting with frontend/)
if echo "$CHANGED_FILES" | grep -qv "^frontend/"; then
  RESTART_BACKEND=true
fi

# Check frontend files changed (any files starting with frontend/)
if echo "$CHANGED_FILES" | grep -q "^frontend/"; then
  RESTART_FRONTEND=true
fi

# Check if package.json dependencies changed
if echo "$CHANGED_FILES" | grep -q "^package.json"; then
  INSTALL_BACKEND=true
fi

if echo "$CHANGED_FILES" | grep -q "^frontend/package.json"; then
  INSTALL_FRONTEND=true
fi

# Run installs if needed
if [ "$INSTALL_BACKEND" = true ]; then
  echo -e "\x1b[36m[Git Hook]\x1b[0m Root package.json changed. Installing backend dependencies..."
  npm install
fi

if [ "$INSTALL_FRONTEND" = true ]; then
  echo -e "\x1b[36m[Git Hook]\x1b[0m Frontend package.json changed. Installing frontend dependencies..."
  (cd frontend && npm install)
fi

# Restart backend if needed
if [ "$RESTART_BACKEND" = true ]; then
  echo -e "\x1b[36m[Git Hook]\x1b[0m Backend changes detected. Restarting backend PM2 process..."
  pm2 restart moomap-backend || pm2 restart moomap-iot-backend || pm2 restart backend || echo "⚠️ Failed to restart backend PM2 process"
fi

# Restart frontend if needed
if [ "$RESTART_FRONTEND" = true ]; then
  echo -e "\x1b[36m[Git Hook]\x1b[0m Frontend changes detected. Restarting frontend PM2 process..."
  pm2 restart moomap-frontend || pm2 restart frontend || echo "⚠️ Failed to restart frontend PM2 process"
fi

echo -e "\x1b[36m[Git Hook]\x1b[0m Post-merge hook completed successfully.\n"
