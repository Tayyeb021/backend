import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { databaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { InterviewModule } from './interview/interview.module';
import { JobsModule } from './jobs/jobs.module';
import { CandidatesModule } from './candidates/candidates.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot(databaseConfig()),
    AuthModule,
    InterviewModule,
    JobsModule,
    CandidatesModule,
    SourcingModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
