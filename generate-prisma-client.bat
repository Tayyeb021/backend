@echo off
echo Formatting Prisma schema...
call npx prisma format

echo Validating Prisma schema...
call npx prisma validate

echo Generating Prisma client...
call npx prisma generate

echo.
echo Prisma client generation complete!
echo.
echo Next steps:
echo 1. Create and apply migration: npx prisma migrate dev --name add_feedback_system
echo    OR push directly: npx prisma db push
echo 2. Restart your TypeScript server/IDE
pause
