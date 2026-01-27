import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('enterprise/permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PermissionController {
  constructor(private permissionService: PermissionService) {}

  @Get()
  @Roles(UserRole.admin)
  async getPermissions() {
    return this.permissionService.getPermissions();
  }

  @Get('roles')
  async getRoles(@Request() req: any) {
    return this.permissionService.getRoles(req.user?.companyId);
  }

  @Post('roles')
  @Roles(UserRole.admin)
  async createRole(@Body() data: any, @Request() req: any) {
    return this.permissionService.createRole({
      ...data,
      organizationId: req.user?.companyId,
    });
  }

  @Post('users/:userId/roles/:roleId')
  @Roles(UserRole.admin)
  async assignRole(
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @Request() req: any,
  ) {
    return this.permissionService.assignRoleToUser(
      userId,
      roleId,
      req.user?.companyId,
      req.user?.id,
    );
  }

  @Get('users/:userId/permissions')
  async getUserPermissions(@Param('userId') userId: string, @Request() req: any) {
    return this.permissionService.getUserPermissions(userId, req.user?.companyId);
  }
}
