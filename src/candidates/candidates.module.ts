import { Module, forwardRef } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { AutomationModule } from '../automation/automation.module';
import { StorageModule } from '../storage/storage.module';
import { ResumeParserService } from './services/resume-parser.service';

@Module({
  imports: [forwardRef(() => AutomationModule), StorageModule],
  controllers: [CandidatesController],
  providers: [CandidatesService, ResumeParserService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
