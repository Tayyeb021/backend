/**
 * Calendar Helper - Generates iCal (.ics) files for calendar invites
 */

export interface CalendarEvent {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  organizer?: {
    name: string;
    email: string;
  };
  attendee: {
    name: string;
    email: string;
  };
  url?: string;
}

/**
 * Generate iCal (.ics) file content
 */
export function generateICalFile(event: CalendarEvent): string {
  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const escapeText = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Falcon AI Recruiter//Interview Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).substr(2, 9)}@falconrecruiter.com`,
    `DTSTAMP:${formatDate(new Date())}`,
    `DTSTART:${formatDate(event.startDate)}`,
    `DTEND:${formatDate(event.endDate)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
  ];

  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }

  if (event.url) {
    lines.push(`URL:${event.url}`);
  }

  if (event.organizer) {
    lines.push(`ORGANIZER;CN="${escapeText(event.organizer.name)}":mailto:${event.organizer.email}`);
  }

  lines.push(`ATTENDEE;CN="${escapeText(event.attendee.name)}";RSVP=TRUE:mailto:${event.attendee.email}`);

  lines.push('STATUS:CONFIRMED');
  lines.push('SEQUENCE:0');
  lines.push('BEGIN:VALARM');
  lines.push('TRIGGER:-PT15M');
  lines.push('ACTION:DISPLAY');
  lines.push('DESCRIPTION:Reminder: Interview in 15 minutes');
  lines.push('END:VALARM');
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

/**
 * Generate "Add to Calendar" URLs for different calendar providers
 */
export function generateAddToCalendarLinks(event: CalendarEvent): {
  google: string;
  outlook: string;
  yahoo: string;
  ics: string;
} {
  const formatDateForURL = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const title = encodeURIComponent(event.title);
  const description = encodeURIComponent(event.description);
  const location = encodeURIComponent(event.location || 'Online Interview');
  const startDate = formatDateForURL(event.startDate);
  const endDate = formatDateForURL(event.endDate);

  // Google Calendar
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&details=${description}&location=${location}`;

  // Outlook Calendar
  const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${event.startDate.toISOString()}&enddt=${event.endDate.toISOString()}&body=${description}&location=${location}`;

  // Yahoo Calendar
  const yahooUrl = `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${title}&st=${startDate}&dur=${Math.round((event.endDate.getTime() - event.startDate.getTime()) / 60000)}&desc=${description}&in_loc=${location}`;

  // ICS download (will be generated on the fly)
  const icsUrl = `data:text/calendar;charset=utf8,${encodeURIComponent(generateICalFile(event))}`;

  return {
    google: googleUrl,
    outlook: outlookUrl,
    yahoo: yahooUrl,
    ics: icsUrl,
  };
}
