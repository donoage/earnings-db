#!/bin/sh
set -e

echo "========================================="
echo "ENTRYPOINT SCRIPT STARTED"
echo "========================================="
echo "Current directory: $(pwd)"
echo "DATABASE_URL is set: $(if [ -n "$DATABASE_URL" ]; then echo "YES"; else echo "NO"; fi)"
echo "Listing prisma directory:"
ls -la prisma/ || echo "prisma directory not found"
echo "========================================="

echo "Running database migrations..."
npx prisma migrate deploy

echo "========================================="
echo "MIGRATIONS COMPLETE - Starting application..."
echo "========================================="
exec npm start

