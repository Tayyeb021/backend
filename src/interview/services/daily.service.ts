import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class DailyService {
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor() {
    this.apiKey = process.env.DAILY_API_KEY || '';
    this.apiUrl = process.env.DAILY_API_URL || 'https://api.daily.co/v1';
  }

  async createRoom(properties?: {
    name?: string;
    privacy?: 'private' | 'public';
    properties?: Record<string, any>;
  }): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/rooms`,
        {
          name: properties?.name,
          privacy: properties?.privacy || 'private',
          properties: {
            enable_recording: 'cloud',
            ...properties?.properties,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to create Daily.co room: ${error.message}`);
    }
  }

  async getRoomToken(roomName: string, userId: string, properties?: {
    isOwner?: boolean;
    exp?: number;
  }): Promise<string> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/meeting-tokens`,
        {
          properties: {
            room_name: roomName,
            is_owner: properties?.isOwner || false,
            exp: properties?.exp || Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
            user_id: userId,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.token;
    } catch (error: any) {
      throw new Error(`Failed to get Daily.co token: ${error.message}`);
    }
  }

  async getRoom(roomName: string): Promise<any> {
    try {
      const response = await axios.get(`${this.apiUrl}/rooms/${roomName}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to get Daily.co room: ${error.message}`);
    }
  }

  async deleteRoom(roomName: string): Promise<void> {
    try {
      await axios.delete(`${this.apiUrl}/rooms/${roomName}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
    } catch (error: any) {
      throw new Error(`Failed to delete Daily.co room: ${error.message}`);
    }
  }
}
