#!/bin/bash
set -e

echo "Building frontend..."
cd frontend
npm ci
npm run build
echo "Build complete!"
