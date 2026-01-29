import { Module } from '@nestjs/common';
import { EvaluationPoliciesController } from './evaluation-policies.controller';
import { EvaluationPoliciesService } from './evaluation-policies.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EvaluationPoliciesController],
  providers: [EvaluationPoliciesService],
  exports: [EvaluationPoliciesService],
})
export class EvaluationPoliciesModule {}
