# 🚀 Quick Seed Commands Reference

## Main Command (Run This!)

```bash
cd backend
npm run prisma:seed
```

That's it! This will create all test data.

---

## Alternative Commands

### Using Prisma CLI
```bash
cd backend
npx prisma db seed
```

### Direct Execution
```bash
cd backend
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
```

---

## What Gets Created

✅ **1 Test Client** (testclient@example.com / password123)  
✅ **5 Published Jobs**  
✅ **15 Test Candidates**  
✅ **3 Interview Templates** (with questions)  
✅ **6 Test Interviews** (scheduled, completed, pending)

---

## First Time Setup

If you haven't set up Prisma yet:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

---

## View Data

```bash
# Open Prisma Studio (visual database browser)
npm run prisma:studio
```

---

## Reset Everything

⚠️ **WARNING: This deletes ALL data!**

```bash
cd backend
npx prisma migrate reset
# This will also automatically run the seed script
```

---

## Test Credentials

- **Email**: `testclient@example.com`
- **Password**: `password123`

---

For detailed information, see `prisma/SEED_README.md`
