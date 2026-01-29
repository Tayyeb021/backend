import { Module } from '@nestjs/common';
import { SkillTaxonomyController } from './skill-taxonomy.controller';
import { SkillTaxonomyService } from './skill-taxonomy.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SkillTaxonomyController],
  providers: [SkillTaxonomyService],
  exports: [SkillTaxonomyService],
})
export class SkillTaxonomyModule {}
