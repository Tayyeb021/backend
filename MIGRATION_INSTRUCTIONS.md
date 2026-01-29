# Migration Instructions for Coding Assessments

## Issue
The shadow database migration check is failing. This is a common issue with Prisma when the shadow database is out of sync.

## Solution: Manual Migration

A migration file has been created at:
`backend/prisma/migrations/20250130000000_add_coding_assessments/migration.sql`

### Option 1: Apply Migration Directly (Recommended)

Run this command in your terminal:

```bash
cd backend
npx prisma migrate resolve --applied 20250130000000_add_coding_assessments
npx prisma generate
```

### Option 2: Use migrate deploy (Production-like)

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

### Option 3: Skip Shadow Database Check

If the above doesn't work, you can temporarily disable shadow database:

1. Add to `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL") // Optional: set to same as DATABASE_URL
}
```

2. Or use:
```bash
npx prisma migrate dev --name add_coding_assessments --skip-seed --create-only
# Then manually apply the SQL
```

### Option 4: Direct SQL Execution

If you have database access, you can run the SQL directly:

```bash
cd backend
# The migration SQL is in: prisma/migrations/20250130000000_add_coding_assessments/migration.sql
# Execute it directly on your database
```

Then mark it as applied:
```bash
npx prisma migrate resolve --applied 20250130000000_add_coding_assessments
npx prisma generate
```

## Verify Migration

After migration, verify the table was created:

```bash
npx prisma studio
# Or check in your database client
```

You should see the `coding_assessments` table with all fields.

## Next Steps

After successful migration:
1. ✅ Run `npx prisma generate` to update Prisma Client
2. ✅ Restart your backend server
3. ✅ Test creating an assessment
