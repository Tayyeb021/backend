import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Client } from '@prisma/client';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async create(
    createClientDto: CreateClientDto,
    userId?: string,
  ): Promise<Client> {
    // Check if email already exists
    const existingClient = await this.prisma.client.findFirst({
      where: { email: createClientDto.email },
    });

    if (existingClient) {
      throw new ConflictException('Client with this email already exists');
    }

    return await this.prisma.client.create({
      data: {
        ...createClientDto,
        createdById: userId,
      },
    });
  }

  async findAll(userId?: string): Promise<Client[]> {
    return await this.prisma.client.findMany({
      where: userId ? { createdById: userId } : undefined,
      include: { createdBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId?: string): Promise<Client> {
    const client = await this.prisma.client.findFirst({
      where: {
        id,
        ...(userId ? { createdById: userId } : {}),
      },
      include: { createdBy: true },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    return client;
  }

  async update(
    id: string,
    updateClientDto: UpdateClientDto,
    userId?: string,
  ): Promise<Client> {
    // Verify client exists and user has access
    await this.findOne(id, userId);

    // Check if email is being updated and if it conflicts
    if ('email' in updateClientDto && updateClientDto.email) {
      const existingClient = await this.prisma.client.findFirst({
        where: { email: updateClientDto.email as string },
      });

      if (existingClient && existingClient.id !== id) {
        throw new ConflictException('Client with this email already exists');
      }
    }

    try {
      return await this.prisma.client.update({
        where: { id },
        data: updateClientDto,
      });
    } catch (error) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }
  }

  async remove(id: string, userId?: string): Promise<void> {
    await this.findOne(id, userId);
    try {
      await this.prisma.client.delete({
        where: { id },
      });
    } catch (error) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }
  }

  async findByType(type: string, userId?: string): Promise<Client[]> {
    return await this.prisma.client.findMany({
      where: {
        type: type as any,
        ...(userId ? { createdById: userId } : {}),
      },
      include: { createdBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
