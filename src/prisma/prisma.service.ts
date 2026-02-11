import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (e: any) {
      const msg = e?.message || '';
      if (e?.code === 'P1001' || msg.includes("Can't reach database server")) {
        console.error(
          '\n[Prisma] Database unreachable. If using Neon, ensure DATABASE_URL includes ?sslmode=require (e.g. postgresql://...?sslmode=require).',
        );
        console.error('[Prisma] Also check: database is running, host/port are correct, and network/firewall allow the connection.\n');
      }
      throw e;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
