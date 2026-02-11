# Prisma Client Generation Script
# Run this script to regenerate the Prisma client after schema changes

Write-Host "Formatting Prisma schema..." -ForegroundColor Cyan
npx prisma format

Write-Host "Validating Prisma schema..." -ForegroundColor Cyan
npx prisma validate

Write-Host "Generating Prisma client..." -ForegroundColor Cyan
npx prisma generate

Write-Host "Prisma client generation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Create and apply migration: npx prisma migrate dev --name add_feedback_system" -ForegroundColor White
Write-Host "   OR push directly: npx prisma db push" -ForegroundColor White
Write-Host "2. Restart your TypeScript server/IDE" -ForegroundColor White
