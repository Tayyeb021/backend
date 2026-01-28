# Migration Fix Guide

## Problem
Prisma migration fails because shadow database doesn't have base schema.

## Solution Options

### Option 1: Use `prisma db push` (Recommended for Development)
This syncs schema directly without migrations:

```bash
cd backend
npx prisma db push
npx prisma generate
```

**Pros**: Quick, no migration history needed
**Cons**: Doesn't create migration files (fine for dev)

### Option 2: Create Migration Without Shadow Database
```bash
cd backend
npx prisma migrate dev --name add_advanced_features --create-only
# Then manually edit migration if needed
npx prisma migrate deploy
```

### Option 3: Reset Shadow Database (If Option 1 doesn't work)
```bash
cd backend
# Set shadow database URL (if using separate DB)
# Or use:
npx prisma migrate dev --skip-seed --skip-generate
```

## Recommended: Use Option 1 (`prisma db push`)

This will:
1. Sync all schema changes to database
2. Generate Prisma client
3. Skip migration validation (perfect for dev)
