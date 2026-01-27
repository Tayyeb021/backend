import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, body, params, query } = request;
    const ipAddress = request.ip || request.headers['x-forwarded-for'] || request.connection?.remoteAddress || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';

    // Extract resource and action from route
    const resource = this.extractResource(url);
    const action = this.extractAction(method);

    return next.handle().pipe(
      tap((response) => {
        // Log the action asynchronously
        this.auditService.log({
          userId: user?.id,
          userEmail: user?.email,
          action: `${action}_${resource}`,
          resource,
          resourceId: params?.id || body?.id || query?.id,
          changes: this.extractChanges(body, response),
          ipAddress,
          userAgent,
          organizationId: user?.companyId,
        }).catch((err) => {
          console.error('Audit logging failed:', err);
        });
      }),
    );
  }

  private extractResource(url: string): string {
    const parts = url.split('/').filter(Boolean);
    return parts[0] || 'unknown';
  }

  private extractAction(method: string): string {
    const methodMap: Record<string, string> = {
      GET: 'view',
      POST: 'create',
      PATCH: 'update',
      PUT: 'update',
      DELETE: 'delete',
    };
    return methodMap[method] || method.toLowerCase();
  }

  private extractChanges(body: any, response: any): any {
    if (!body || typeof body !== 'object') return null;
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];
    const changes = { ...body };
    
    sensitiveFields.forEach((field) => {
      if (changes[field]) {
        changes[field] = '[REDACTED]';
      }
    });

    return changes;
  }
}
