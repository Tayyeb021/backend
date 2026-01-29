import { Module } from '@nestjs/common';
import { HiringDecisionsController } from './hiring-decisions.controller';
import { HiringDecisionsService } from './hiring-decisions.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HiringDecisionsController],
  providers: [HiringDecisionsService],
  exports: [HiringDecisionsService],
})
export class HiringDecisionsModule {}
