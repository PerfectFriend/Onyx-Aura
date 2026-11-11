import { describe, it, expect } from 'vitest';
import { parseAppointmentDateTime, formatToIcsUtc, generateIcsContent, generateGoogleCalendarUrl } from '../utils/calendarSync';
import { Appointment, Artist } from '../types';

describe('calendarSync utility', () => {
  it('parses standardized ISO date and 24h time slot correctly', () => {
    const { start, end } = parseAppointmentDateTime('2026-11-20', '15:30', 120);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(10); // 0-indexed November
    expect(start.getDate()).toBe(20);
    expect(start.getHours()).toBe(15);
    expect(start.getMinutes()).toBe(30);

    // End time should be exactly 120 minutes later (17:30)
    expect(end.getHours()).toBe(17);
    expect(end.getMinutes()).toBe(30);
  });

  it('formats Date to RFC 5545 UTC timestamp format (YYYYMMDDTHHMMSSZ)', () => {
    const date = new Date(Date.UTC(2026, 10, 15, 14, 0, 0));
    const icsUtc = formatToIcsUtc(date);
    expect(icsUtc).toBe('20261115T140000Z');
  });

  it('generates a valid RFC 5545 iCalendar content with alarms', () => {
    const mockApt: Appointment = {
      id: 'apt-test-101',
      clientName: 'Elena Rostova',
      clientPhone: '+34 612 345 678',
      clientEmail: 'elena@example.com',
      artistId: 'art-1',
      artistName: 'Elena Vasiliev',
      artistAvatar: '/assets/images/avatar_master_artist_1790123890131.jpg',
      serviceId: 'srv-1',
      serviceName: 'Sculptural 3D Chrome',
      price: 180,
      currency: 'USD',
      date: '2026-12-01',
      timeSlot: '14:00',
      status: 'confirmed',
      remindersEnabled: true,
      pushReminderScheduled: true,
      smsReminderScheduled: true,
      createdAt: '2026-11-10T12:00:00Z',
    };

    const mockArtist: Artist = {
      id: 'art-1',
      name: 'Elena Vasiliev',
      handle: 'elenanailcraft',
      avatar: '/assets/images/avatar_master_artist_1790123890131.jpg',
      location: 'Eixample & SoHo Atelier',
      bio: 'Pioneering organic Cyber-Gaudí nail architectures.',
      verifiedTier: 'Master Guild Gold',
      reputationScore: 99,
      totalReviews: 312,
      rating: 4.98,
      walletAddress: '0x8a72...39e1',
      stakedNAIL: 12500,
      igHandle: 'elena.hautecraft',
      igFollowers: 148000,
      igEngagementRate: '8.4%',
      isIgConnected: true,
      salonName: 'Atelier Gaudi Haute',
      salonAddress: 'Carrer de Mallorca 401, Barcelona',
      coordinates: { lat: 41.4036, lng: 2.1744 },
      services: [],
      portfolioCount: 42,
    };

    const ics = generateIcsContent(mockApt, mockArtist);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Nailix Haute Manicure: Sculptural 3D Chrome (Elena Vasiliev)');
    expect(ics).toContain('LOCATION:Atelier Gaudi Haute\\, Carrer de Mallorca 401\\, Barcelona');
    expect(ics).toContain('TRIGGER:-PT24H');
    expect(ics).toContain('TRIGGER:-PT2H');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('generates proper Google Calendar web URL with encoded parameters', () => {
    const mockApt: Appointment = {
      id: 'apt-test-102',
      clientName: 'Sophia Miller',
      clientPhone: '+34 699 888 777',
      clientEmail: 'sophia@example.com',
      artistId: 'art-2',
      artistName: 'Chloe Chen',
      artistAvatar: '/assets/images/artist_chloe_chen.jpg',
      serviceId: 'srv-2',
      serviceName: 'Aurora Glass Manicure',
      price: 140,
      currency: 'USD',
      date: '2026-12-05',
      timeSlot: '11:00',
      status: 'confirmed',
      remindersEnabled: true,
      pushReminderScheduled: true,
      smsReminderScheduled: false,
      createdAt: '2026-11-10T14:00:00Z',
    };

    const url = generateGoogleCalendarUrl(mockApt);
    expect(url).toContain('https://calendar.google.com/calendar/render?');
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('Nailix%3A+Aurora+Glass+Manicure');
  });
});
