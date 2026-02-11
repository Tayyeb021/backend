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
import { InsightsModule } from './insights/insights.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { MarketIntelligenceModule } from './market-intelligence/market-intelligence.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AIAssistantModule } from './ai-assistant/ai-assistant.module';
import { WhiteLabelModule } from './white-label/white-label.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { RoleSpecsModule } from './role-specs/role-specs.module';
import { EvaluationPoliciesModule } from './evaluation-policies/evaluation-policies.module';
import { EvidenceModule } from './evidence/evidence.module';
import { CertifiedProfilesModule } from './certified-profiles/certified-profiles.module';
import { SkillTaxonomyModule } from './skill-taxonomy/skill-taxonomy.module';
import { EvaluationBlueprintsModule } from './evaluation-blueprints/evaluation-blueprints.module';
import { RankingModule } from './ranking/ranking.module';
import { HiringDecisionsModule } from './hiring-decisions/hiring-decisions.module';
import { FeedbackTemplatesModule } from './feedback-templates/feedback-templates.module';
import { CandidateFeedbackModule } from './candidate-feedback/candidate-feedback.module';
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
    InsightsModule,
    AnalyticsModule,
    MarketIntelligenceModule,
    IntegrationsModule,
    AIAssistantModule,
    WhiteLabelModule,
    AssessmentsModule,
    RoleSpecsModule,
    EvaluationPoliciesModule,
    EvidenceModule,
    CertifiedProfilesModule,
    SkillTaxonomyModule,
    EvaluationBlueprintsModule,
    RankingModule,
    HiringDecisionsModule,
    FeedbackTemplatesModule,
    CandidateFeedbackModule,
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
