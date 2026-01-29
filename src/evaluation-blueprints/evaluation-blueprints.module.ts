import { Module } from '@nestjs/common';
import { EvaluationBlueprintsController } from './evaluation-blueprints.controller';
import { EvaluationBlueprintsService } from './evaluation-blueprints.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EvaluationBlueprintsController],
  providers: [EvaluationBlueprintsService],
  exports: [EvaluationBlueprintsService],
})
export class EvaluationBlueprintsModule {}
