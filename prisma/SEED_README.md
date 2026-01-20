# Database Seed Script - Complete Test Data

This comprehensive seed script creates all required test data for the Falcon AI Recruiter application.

## 🚀 Quick Start

### Run the Seed Script

```bash
cd backend
npm run prisma:seed
```

**Or using Prisma CLI:**
```bash
cd backend
npx prisma db seed
```

**Or directly with ts-node:**
```bash
cd backend
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
```

## 📦 What Gets Created

### 1. Test Client User
- **Email**: `testclient@example.com`
- **Password**: `password123`
- **Role**: `client`
- **Name**: Test Client

### 2. Test Jobs (5 Published Jobs)
1. **Senior Full Stack Developer** - Remote, Full-time, AED 15k-25k
2. **Frontend Developer** - Hybrid, Full-time, AED 8k-12k
3. **Backend Developer** - Remote, Full-time, AED 10k-15k
4. **DevOps Engineer** - Remote, Full-time, AED 12k-18k
5. **UI/UX Designer** - Hybrid, Full-time, AED 7k-11k

### 3. Test Candidates (15 Candidates)
Distributed across jobs with:
- **Varied experience levels**: 2-8 years
- **Different skills**: Matching job requirements
- **Various statuses**: sourced, contacted, interviewed
- **Multiple locations**: Dubai, Abu Dhabi, Sharjah
- **Source platforms**: LinkedIn, Indeed, Company Website

### 4. Interview Templates (3 Templates)
1. **Standard Technical Interview** (Default)
   - 5 questions covering behavioral, technical, system design, coding, and situational
   
2. **Frontend Developer Interview**
   - 5 questions focused on React, state management, CSS, and accessibility
   
3. **Backend Developer Interview**
   - 5 questions covering APIs, databases, microservices, and coding

### 5. Test Interviews (6 Interviews)
- **2 Scheduled Interviews**: Ready to be conducted
- **2 Completed Interviews**: With AI scores and summaries
- **1 Pending Response**: On-demand interview waiting for candidate to select date
- **1 Scheduled Backend Interview**: For testing backend interview flow

## 📋 Complete Command Reference

### Setup Commands (First Time Only)

```bash
# Navigate to backend directory
cd backend

# Install dependencies (if not already done)
npm install

# Generate Prisma Client
npm run prisma:generate

# Run migrations (if needed)
npm run prisma:migrate
```

### Seed Commands

```bash
# Run seed script (Recommended)
npm run prisma:seed

# Alternative: Using Prisma CLI
npx prisma db seed

# Alternative: Direct execution
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
```

### Database Management Commands

```bash
# View database in Prisma Studio
npm run prisma:studio

# Reset database and reseed (WARNING: Deletes all data!)
npx prisma migrate reset

# Create new migration
npm run prisma:migrate

# Deploy migrations to production
npm run prisma:migrate:deploy
```

## 🔄 Idempotent Behavior

The seed script is **idempotent** - you can run it multiple times safely:
- ✅ Existing records are detected and skipped
- ✅ No duplicate data will be created
- ✅ Only new records are added

## 🧪 Testing Scenarios

With this seed data, you can test:

### Job Management
- ✅ View published jobs
- ✅ See candidates per job
- ✅ Auto-invite functionality
- ✅ Job details page with candidate lists

### Candidate Management
- ✅ View candidates by status
- ✅ Filter candidates by job
- ✅ Update candidate status
- ✅ View candidate details

### Interview Management
- ✅ Create interviews from templates
- ✅ Schedule live interviews
- ✅ Create on-demand interviews with date options
- ✅ View scheduled interviews
- ✅ View completed interviews with AI scores
- ✅ Candidate self-scheduling flow

### Interview Templates
- ✅ View all templates
- ✅ Create new templates
- ✅ Edit existing templates
- ✅ Use templates for interviews

## 🔍 Verification

After running the seed, verify the data:

```bash
# Open Prisma Studio to view all data
npm run prisma:studio
```

Or check via API:
- Login with: `testclient@example.com` / `password123`
- View jobs: `GET /jobs`
- View candidates: `GET /candidates`
- View interviews: `GET /interviews`
- View templates: `GET /interview-templates`

## 🐛 Troubleshooting

### Error: Cannot find module '@prisma/client'
```bash
npm run prisma:generate
```

### Error: Database connection failed
- Check your `.env` file has correct `DATABASE_URL`
- Ensure PostgreSQL is running
- Verify database credentials

### Error: ts-node not found
```bash
npm install -D ts-node
```

### Error: Module resolution issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 📝 Notes

- All jobs are created with `published` status
- Candidates are automatically linked to appropriate jobs
- Interview templates include realistic questions with time limits
- Completed interviews include sample AI scores and summaries
- The script handles existing data gracefully

## 🎯 Next Steps

After seeding:
1. Login with test client credentials
2. Explore the dashboard
3. Test job creation and auto-invite
4. Test interview scheduling
5. Test candidate self-scheduling
6. Review AI interview scores

---

**Happy Testing! 🚀**
