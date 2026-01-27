# Migration Instructions for Enterprise Features

## Issue
The shadow database doesn't have the base tables, causing migration failures.

## Solution Options

### Option 1: Use `prisma db push` (Recommended for Development)
This directly applies schema changes without using a shadow database:

```bash
cd backend
npx prisma db push
npx prisma generate
```

### Option 2: Apply Migration Manually
The migration SQL file has been created at:
`backend/prisma/migrations/20250120000000_add_enterprise_features/migration.sql`

You can apply it directly to your database using your database client or:

```bash
# Using psql (if you have PostgreSQL client)
psql $DATABASE_URL -f prisma/migrations/20250120000000_add_enterprise_features/migration.sql

# Or using Prisma Studio
npx prisma studio
# Then run the SQL manually
```

### Option 3: Mark Migration as Applied
If you've already applied the migration manually:

```bash
npx prisma migrate resolve --applied 20250120000000_add_enterprise_features
npx prisma generate
```

### Option 4: Disable Shadow Database (For Neon/Managed Databases)
Add to your `.env` file:

```env
# Disable shadow database for Neon
PRISMA_MIGRATE_SKIP_GENERATE=1
```

Then use `prisma db push` instead of `prisma migrate dev`.

## After Migration

1. Generate Prisma Client:
   ```bash
   npx prisma generate
   ```

2. Verify the tables were created:
   ```bash
   npx prisma studio
   ```

3. Check the new tables:
   - `audit_logs`
   - `permissions`
   - `roles`
   - `role_permissions`
   - `user_roles`
   - `webhooks`
   - `webhook_deliveries`

## Troubleshooting

If you still encounter issues:

1. **Check database connection**: Ensure `DATABASE_URL` in `.env` is correct
2. **Check permissions**: Ensure your database user has CREATE TABLE permissions
3. **Use db push**: For development, `db push` is often simpler than migrations
4. **Check existing tables**: Ensure base tables (users, jobs, etc.) exist first
