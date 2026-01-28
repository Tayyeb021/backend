import { Module, forwardRef } from '@nestjs/common';
import { EmailService } from './email.service';
import { CandidatesModule } from '../candidates/candidates.module';

@Module({
  imports: [forwardRef(() => CandidatesModule)],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
