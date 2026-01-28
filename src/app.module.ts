import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { InterviewModule } from './interview/interview.module';
import { JobsModule } from './jobs/jobs.module';
import { CandidatesModule } from './candidates/candidates.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { StorageModule } from './storage/storage.module';
import { ClientsModule } from './clients/clients.module';
import { EnterpriseModule } from './enterprise/enterprise.module';
import { AdminModule } from './admin/admin.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { AutomationModule } from './automation/automation.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './enterprise/audit/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    InterviewModule,
    JobsModule,
    CandidatesModule,
    SourcingModule,
    StorageModule,
    ClientsModule,
    EnterpriseModule,
    AdminModule,
    CollaborationModule,
    AutomationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
