import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { PermissionModule } from './permissions/permission.module';
import { WebhookModule } from './webhooks/webhook.module';

@Module({
  imports: [AuditModule, PermissionModule, WebhookModule],
  exports: [AuditModule, PermissionModule, WebhookModule],
})
export class EnterpriseModule {}
