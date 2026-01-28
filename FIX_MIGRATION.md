# Fix Migration Error

## Problem
```
Error: Migration failed to apply cleanly to the shadow database.
The underlying table for model `users` does not exist.
```

## Solution: Use `prisma db push` Instead

For development, use `db push` which syncs schema directly:

```bash
cd backend
npx prisma db push
npx prisma generate
```

This will:
- ✅ Sync all schema changes to your database
- ✅ Generate Prisma client with new models
- ✅ Skip shadow database validation (not needed for dev)

## Alternative: If you need migrations

If you specifically need migration files:

```bash
cd backend
# First, ensure all existing migrations are applied
npx prisma migrate deploy

# Then create new migration
npx prisma migrate dev --name add_advanced_features
```

## Recommended Approach

**For Development**: Use `prisma db push` (faster, simpler)
**For Production**: Use `prisma migrate deploy` (after fixing shadow DB)
