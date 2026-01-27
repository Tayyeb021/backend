import { Injectable } from '@nestjs/common';

@Injectable()
export class SchedulingService {
  /**
   * Generate date options for interview scheduling
   */
  generateDateOptions(
    options?: {
      daysAhead?: number[];
      timezone?: string;
      startDate?: Date;
      slotsPerDay?: number;
    },
  ): Array<{ date: string; selected: boolean }> {
    const daysAhead = options?.daysAhead || [3, 5, 7];
    const startDate = options?.startDate || new Date();
    const slotsPerDay = options?.slotsPerDay || 1;
    const dateOptions: Array<{ date: string; selected: boolean }> = [];

    for (const days of daysAhead) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + days);
      date.setHours(10, 0, 0, 0); // Default to 10 AM

      // Skip past dates
      if (date < new Date()) continue;

      // Skip weekends (Saturday = 6, Sunday = 0)
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      dateOptions.push({
        date: date.toISOString(),
        selected: false,
      });
    }

    return dateOptions;
  }

  /**
   * Check if a date/time has conflicts
   */
  hasConflict(scheduledTime: Date, existingInterviews: Array<{ scheduledAt: Date }>): boolean {
    const timeWindow = 60 * 60 * 1000; // 1 hour window
    return existingInterviews.some((interview) => {
      const timeDiff = Math.abs(interview.scheduledAt.getTime() - scheduledTime.getTime());
      return timeDiff < timeWindow;
    });
  }

  /**
   * Convert timezone
   */
  convertTimezone(date: Date, targetTimezone: string): Date {
    // Simplified timezone conversion
    // In production, use a library like date-fns-tz
    return new Date(date.toLocaleString('en-US', { timeZone: targetTimezone }));
  }
}
