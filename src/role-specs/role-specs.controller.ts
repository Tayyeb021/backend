import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { RoleSpecsService } from './role-specs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateRoleSpecDto, UpdateRoleSpecDto } from './dto/role-spec.dto';

@Controller('role-specs')
@UseGuards(JwtAuthGuard)
export class RoleSpecsController {
  constructor(private roleSpecsService: RoleSpecsService) {}

  @Post()
  async createRoleSpec(@Request() req: any, @Body() dto: CreateRoleSpecDto) {
    if (!req.user || !req.user.id) {
      throw new BadRequestException('User not authenticated');
    }
    return this.roleSpecsService.createRoleSpec({
      ...dto,
      clientId: req.user.id,
    });
  }

  @Get()
  async getRoleSpecs(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    if (!req.user || !req.user.id) {
      throw new BadRequestException('User not authenticated');
    }
    return this.roleSpecsService.getRoleSpecs(req.user.id, { status, search });
  }

  @Get(':id')
  async getRoleSpecById(@Param('id') id: string) {
    return this.roleSpecsService.getRoleSpecById(id);
  }

  @Put(':id')
  async updateRoleSpec(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateRoleSpecDto,
  ) {
    return this.roleSpecsService.updateRoleSpec(id, dto, req.user.id);
  }

  @Patch(':id/lock')
  async lockRoleSpec(@Param('id') id: string, @Request() req: any) {
    return this.roleSpecsService.lockRoleSpec(id, req.user.id);
  }

  @Post(':id/clone')
  async cloneRoleSpec(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updates?: any,
  ) {
    return this.roleSpecsService.cloneRoleSpec(id, req.user.id, updates);
  }

  @Post(':id/validate')
  async validateRoleSpec(@Param('id') id: string) {
    return this.roleSpecsService.validateRoleSpec(id);
  }
}
