import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionService {
  constructor(private prisma: PrismaService) {}

  async createPermission(data: {
    name: string;
    resource: string;
    action: string;
    description?: string;
    conditions?: any;
  }) {
    return this.prisma.permission.create({ data });
  }

  async getPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async createRole(data: {
    name: string;
    description?: string;
    organizationId?: string;
    permissionIds: string[];
  }) {
    const { permissionIds, ...roleData } = data;
    
    return this.prisma.role.create({
      data: {
        ...roleData,
        permissions: {
          create: permissionIds.map((permissionId) => ({
            permissionId,
          })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async assignRoleToUser(userId: string, roleId: string, organizationId?: string, assignedBy?: string) {
    return this.prisma.userRoleAssignment.create({
      data: {
        userId,
        roleId,
        organizationId,
        assignedBy,
      },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
  }

  async getUserPermissions(userId: string, organizationId?: string): Promise<string[]> {
    const userRoles = await this.prisma.userRoleAssignment.findMany({
      where: {
        userId,
        organizationId: organizationId || undefined,
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    const permissions = new Set<string>();
    
    userRoles.forEach((userRole) => {
      userRole.role.permissions.forEach((rolePerm) => {
        permissions.add(rolePerm.permission.name);
      });
    });

    return Array.from(permissions);
  }

  async checkPermission(userId: string, permissionName: string, organizationId?: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, organizationId);
    return userPermissions.includes(permissionName);
  }

  async getRoles(organizationId?: string) {
    return this.prisma.role.findMany({
      where: {
        OR: [
          { organizationId: organizationId || null },
          { isSystem: true },
        ],
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }
}
