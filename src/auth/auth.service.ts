import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserRole, Prisma } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { LoginDto } from './dto/login.dto';

type UserWithCompany = Prisma.UserGetPayload<{
  include: { company: true };
}>;

type UserWithCompleteInfo = Prisma.UserGetPayload<{
  include: {
    company: true;
    jobs: {
      include: {
        candidates: true;
      };
    };
    interviews: {
      include: {
        candidate: true;
        job: true;
      };
    };
    clients: true;
  };
}>;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<{
    user: Omit<UserWithCompany, 'password'>;
    token: {
      accessToken: string;
      refreshToken: string;
    };
  }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Validate role - only allow client or interviewee
    const role = registerDto.role || UserRole.client;
    if (role !== UserRole.client && role !== UserRole.interviewee) {
      throw new BadRequestException(
        'Role must be either client or interviewee',
      );
    }

    // Validate that company is only provided for client role
    if (registerDto.company && role !== UserRole.client) {
      throw new BadRequestException(
        'Company information can only be provided for client role',
      );
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Extract company data if provided
    const { company, role: _, ...userData } = registerDto;
    let companyId: string | undefined;

    // Create company if company information is provided (only for client role)
    if (company && role === UserRole.client) {
      // Check if company with same email or trade license already exists
      if (company.tradeLicenseNumber) {
        const existingCompany = await this.prisma.company.findUnique({
          where: { tradeLicenseNumber: company.tradeLicenseNumber },
        });
        if (existingCompany) {
          throw new ConflictException(
            'Company with this trade license number already exists',
          );
        }
      }

      const createdCompany = await this.prisma.company.create({
        data: {
          ...company,
          country: company.country || 'UAE',
          emirate: company.emirate || undefined,
        },
      });
      companyId = createdCompany.id;
    }

    const user = await this.prisma.user.create({
      data: {
        ...userData,
        password: hashedPassword,
        role,
        companyId,
      },
      include: {
        company: true,
      },
    });

    const tokens = this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      token: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  async registerAdmin(registerAdminDto: RegisterAdminDto): Promise<{
    user: Omit<User, 'password'>;
    token: {
      accessToken: string;
      refreshToken: string;
    };
  }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerAdminDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(registerAdminDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        ...registerAdminDto,
        password: hashedPassword,
        role: UserRole.admin,
      },
      include: {
        company: true,
      },
    });

    const tokens = this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      token: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  async login(loginDto: LoginDto): Promise<{
    user: Omit<UserWithCompany, 'password'>;
    token: {
      accessToken: string;
      refreshToken: string;
    };
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        company: true,
      },
    });

    if (!user || !(await bcrypt.compare(loginDto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const tokens = this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      token: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  async validateUser(
    userId: string,
  ): Promise<Omit<UserWithCompany, 'password'>> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      include: {
        company: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return this.sanitizeUser(user);
  }

  async getUserProfile(userId: string): Promise<Omit<UserWithCompleteInfo, 'password'>> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      include: {
        company: true,
        jobs: {
          include: {
            candidates: true,
          },
        },
        interviews: {
          include: {
            candidate: true,
            job: true,
          },
        },
        clients: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const { password, ...sanitized } = user;
    return sanitized;
  }

  async getUserById(userId: string): Promise<Omit<UserWithCompleteInfo, 'password'>> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      include: {
        company: true,
        jobs: {
          include: {
            candidates: true,
          },
        },
        interviews: {
          include: {
            candidate: true,
            job: true,
          },
        },
        clients: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, ...sanitized } = user;
    return sanitized;
  }

  async getUserByEmail(email: string): Promise<Omit<UserWithCompleteInfo, 'password'>> {
    const user = await this.prisma.user.findFirst({
      where: { email },
      include: {
        company: true,
        jobs: {
          include: {
            candidates: true,
          },
        },
        interviews: {
          include: {
            candidate: true,
            job: true,
          },
        },
        clients: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, ...sanitized } = user;
    return sanitized;
  }

  private generateTokens(user: User | UserWithCompany): {
    accessToken: string;
    refreshToken: string;
  } {
    const payload = { sub: user.id, email: user.email, role: user.role };

    // Access token expiration from environment variable (default: 8 hours)
    const accessTokenExpiration = process.env.JWT_ACCESS_TOKEN_EXPIRATION || '8h';
    const accessToken = this.jwtService.sign(payload, { expiresIn: accessTokenExpiration as any });

    // Refresh token expires in 7 days
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return { accessToken, refreshToken };
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, isActive: true },
        include: {
          company: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('User not found or inactive');
      }

      const newPayload = { sub: user.id, email: user.email, role: user.role };
      // Access token expiration from environment variable (default: 8 hours)
      const accessTokenExpiration = process.env.JWT_ACCESS_TOKEN_EXPIRATION || '8h';
      const accessToken = this.jwtService.sign(newPayload, {
        expiresIn: accessTokenExpiration as any,
      });

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private sanitizeUser(
    user: UserWithCompany | UserWithCompleteInfo,
  ): Omit<UserWithCompany | UserWithCompleteInfo, 'password'> {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}
