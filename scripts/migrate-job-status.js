const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function migrateJobStatus() {
  try {
    // Update all jobs with status 'active' to 'published'
    // Note: This uses raw SQL because Prisma might not recognize 'active' as valid anymore
    const result = await prisma.$executeRaw`
      UPDATE "jobs" 
      SET "status" = 'published'::"JobStatus"
      WHERE "status"::text = 'active'
    `;
    
    console.log(`Updated ${result} job(s) from 'active' to 'published' status.`);
  } catch (error) {
    // If the error is that 'active' doesn't exist, that's fine - it means no records need updating
    if (error.message.includes('active') || error.code === 'P2022') {
      console.log('No records with "active" status found, or enum already updated.');
    } else {
      console.error('Error migrating job status:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

migrateJobStatus();
