/**
 * Standardized RFC 5545 iCalendar (.ics) and Web Calendar Sync Generator for Nailix
 * Supports Google Calendar, Apple Calendar, Microsoft Outlook, and standard mobile calendars.
 */

import { Appointment, Artist } from '../types';

interface ParsedDateTime {
  start: Date;
  end: Date;
}

/**
 * Robust date and time slot parser supporting 24h ("14:30") and 12h ("02:30 PM") formats,
 * as well as relative dates like "Today" / "Tomorrow".
 */
export function parseAppointmentDateTime(dateStr: string, timeStr: string, durationMinutes: number = 120): ParsedDateTime {
  const now = new Date();
  let targetDate = new Date();

  const cleanDate = (dateStr || '').trim();
  const cleanTime = (timeStr || '').trim();

  if (cleanDate.toLowerCase() === 'today') {
    targetDate = new Date(now);
  } else if (cleanDate.toLowerCase() === 'tomorrow') {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    const [year, month, day] = cleanDate.split('-').map(Number);
    targetDate = new Date(year, month - 1, day);
  } else {
    const parsed = new Date(cleanDate);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    }
  }

  // Parse time
  let hours = 14;
  let minutes = 0;

  // Check 12-hour AM/PM format (e.g. "02:30 PM", "2:30 pm")
  const ampmMatch = cleanTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (ampmMatch) {
    hours = parseInt(ampmMatch[1], 10);
    minutes = parseInt(ampmMatch[2], 10);
    const meridian = ampmMatch[3]?.toUpperCase();
    if (meridian === 'PM' && hours < 12) {
      hours += 12;
    } else if (meridian === 'AM' && hours === 12) {
      hours = 0;
    }
  } else if (/^\d{1,2}:\d{2}$/.test(cleanTime)) {
    const [h, m] = cleanTime.split(':').map(Number);
    hours = h;
    minutes = m;
  }

  const start = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    hours,
    minutes,
    0,
    0
  );

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  return { start, end };
}

/**
 * Format a Date object to RFC 5545 UTC timestamp: YYYYMMDDTHHMMSSZ
 */
export function formatToIcsUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Clean text for iCalendar RFC 5545 escaping
 */
function escapeIcsText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n');
}

/**
 * Generates an RFC 5545 compliant iCalendar string for a single appointment.
 */
export function generateIcsContent(appointment: Appointment, artist?: Artist | null): string {
  const { start, end } = parseAppointmentDateTime(appointment.date, appointment.timeSlot);
  const now = new Date();

  const dtstamp = formatToIcsUtc(now);
  const dtstart = formatToIcsUtc(start);
  const dtend = formatToIcsUtc(end);

  const uid = `nailix-apt-${appointment.id}-${start.getTime()}@nailix.art`;
  const summary = escapeIcsText(`Nailix Haute Manicure: ${appointment.serviceName} (${appointment.artistName})`);

  const salonLocation = artist?.salonAddress 
    ? `${artist.salonName ? `${artist.salonName}, ` : ''}${artist.salonAddress}`
    : 'Nailix Verified Master Atelier';

  const location = escapeIcsText(salonLocation);

  const descriptionLines = [
    `NAILIX HAUTE MANICURE APPOINTMENT`,
    `Service: ${appointment.serviceName}`,
    `Master Artisan: ${appointment.artistName}`,
    `Client: ${appointment.clientName || 'Confirmed Client'}`,
    `Date & Time: ${appointment.date} at ${appointment.timeSlot}`,
    `Price: $${appointment.price} USD (${appointment.cryptoEquivalent || appointment.currency})`,
    `Smart Contract Escrow: ${appointment.escrowTxHash || 'Secured On-Chain'}`,
    appointment.customNotes ? `Notes: ${appointment.customNotes}` : '',
    appointment.referenceLookTitle ? `Reference Look: ${appointment.referenceLookTitle}` : '',
    ``,
    `Need to reschedule? Contact your master via Nailix Private E2E Chat: https://nailix.art`,
  ].filter(line => line !== null && line !== undefined).join('\n');

  const description = escapeIcsText(descriptionLines);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nailix Haute Manicure Network//Nailix App 1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Nailix Appointments',
    'X-WR-TIMEZONE:UTC',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    // 24 Hour Reminder Alarm
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Reminder: Nailix appointment tomorrow with ${appointment.artistName}`)}`,
    'END:VALARM',
    // 2 Hour Reminder Alarm
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Reminder: Nailix appointment in 2 hours with ${appointment.artistName}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Downloads a standardized .ics file directly to the client device.
 * Universal format recognized by Apple Calendar, iOS Calendar, macOS Calendar, Microsoft Outlook, and Android.
 */
export function downloadIcsFile(appointment: Appointment, artist?: Artist | null): void {
  const icsString = generateIcsContent(appointment, artist);
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const sanitizedId = appointment.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `nailix-appointment-${sanitizedId}.ics`;

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates direct Google Calendar Web Intent URL.
 * Automatically opens user's Google Calendar with all fields, dates, locations pre-filled.
 */
export function generateGoogleCalendarUrl(appointment: Appointment, artist?: Artist | null): string {
  const { start, end } = parseAppointmentDateTime(appointment.date, appointment.timeSlot);
  const startStr = formatToIcsUtc(start);
  const endStr = formatToIcsUtc(end);

  const title = `Nailix: ${appointment.serviceName} (${appointment.artistName})`;
  const salonLocation = artist?.salonAddress 
    ? `${artist.salonName ? `${artist.salonName}, ` : ''}${artist.salonAddress}`
    : 'Nailix Verified Master Atelier';

  const details = [
    `Nailix Haute Manicure Confirmed Appointment`,
    `Service: ${appointment.serviceName}`,
    `Master Artisan: ${appointment.artistName}`,
    `Client: ${appointment.clientName}`,
    `Escrow TX: ${appointment.escrowTxHash || 'Secured'}`,
    `Price: $${appointment.price} USD (${appointment.currency})`,
    appointment.customNotes ? `Notes: ${appointment.customNotes}` : '',
    `Booking Link: https://nailix.art`,
  ].filter(Boolean).join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startStr}/${endStr}`,
    details,
    location: salonLocation,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generates direct Microsoft Outlook Web Calendar URL.
 */
export function generateOutlookCalendarUrl(appointment: Appointment, artist?: Artist | null): string {
  const { start, end } = parseAppointmentDateTime(appointment.date, appointment.timeSlot);

  const title = `Nailix: ${appointment.serviceName} (${appointment.artistName})`;
  const salonLocation = artist?.salonAddress 
    ? `${artist.salonName ? `${artist.salonName}, ` : ''}${artist.salonAddress}`
    : 'Nailix Verified Master Atelier';

  const body = `Nailix Appointment for ${appointment.serviceName} with ${appointment.artistName}. Price: $${appointment.price} USD. Escrow TX: ${appointment.escrowTxHash || 'Secured'}.`;

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body,
    location: salonLocation,
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Bulk exports all confirmed appointments into a single multi-event .ics file.
 */
export function downloadAllAppointmentsIcs(appointments: Appointment[], artists?: Artist[]): void {
  const confirmedAppointments = appointments.filter(a => a.status !== 'cancelled');
  if (confirmedAppointments.length === 0) return;

  const eventsIcs = confirmedAppointments.map(apt => {
    const artist = artists?.find(a => a.id === apt.artistId);
    const { start, end } = parseAppointmentDateTime(apt.date, apt.timeSlot);
    const dtstamp = formatToIcsUtc(new Date());
    const dtstart = formatToIcsUtc(start);
    const dtend = formatToIcsUtc(end);
    const uid = `nailix-apt-${apt.id}-${start.getTime()}@nailix.art`;
    const summary = escapeIcsText(`Nailix: ${apt.serviceName} (${apt.artistName})`);
    const salonLocation = artist?.salonAddress || 'Nailix Verified Master Atelier';
    const location = escapeIcsText(salonLocation);
    const desc = escapeIcsText(`Nailix Manicure with ${apt.artistName}. Fee: $${apt.price} USD. Escrow: ${apt.escrowTxHash || 'Secured'}`);

    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT24H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`Nailix appointment tomorrow with ${apt.artistName}`)}`,
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
  }).join('\r\n');

  const fullIcs = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nailix Haute Manicure Network//All Appointments 1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Nailix All Appointments',
    eventsIcs,
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([fullIcs], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `nailix-all-appointments.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
