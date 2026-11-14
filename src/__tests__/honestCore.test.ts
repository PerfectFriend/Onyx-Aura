import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeUpdatedArtistRating } from '../App';
import { computeSHA256Detailed } from '../simulation/cryptocloud';
import { blockchainLedger } from '../simulation/cryptoLedger';
import { reminderService } from '../services/reminderService';
import { DEMO_CLIENT_PROFILE, getRelativeDateISO } from '../data/initialData';
import {
  parseAppointmentDateTime,
  generateIcsContent,
  generateOutlookCalendarUrl,
} from '../utils/calendarSync';
import { Appointment } from '../types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('computeUpdatedArtistRating (K-09)', () => {
  it('computes accurate incremental weighted average across existing totalReviews', () => {
    // 248 reviews averaging 4.98 -> weighted sum = 1235.04; adding a 1-star review -> 1236.04 / 249 = 4.96
    const next = computeUpdatedArtistRating(4.98, 248, 1);
    expect(next).toBe(4.96);

    // Works cleanly from zero reviews
    expect(computeUpdatedArtistRating(0, 0, 5)).toBe(5);
  });
});

describe('Honest Simulation Modules (K-03, K-05)', () => {
  it('computeSHA256Detailed surfaces whether real Web Crypto or pseudohash fallback was used', async () => {
    const res = await computeSHA256Detailed('nailix-demo-payload');
    expect(typeof res.isRealSha256).toBe('boolean');
    expect(res.hash.startsWith('0x')).toBe(true);
    if (!res.isRealSha256) {
      expect(res.hash.startsWith('0xSIM_PSEUDO_')).toBe(true);
    }
  });

  it('cryptoLedger marks newly submitted user reviews with verifiedInPerson=false', async () => {
    const review = await blockchainLedger.createVerifiedReviewBlock({
      artistId: 'artist-1',
      artistName: 'Elena Vasiliev',
      clientName: DEMO_CLIENT_PROFILE.name,
      clientAddress: '0x0000...DEMO',
      rating: 5,
      breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
      text: 'Clean cyber chrome finish!',
      bookingTxId: '0xSIM_DEMO_REF',
    });
    expect(review.verifiedInPerson).toBe(false);
    expect(review.verifiedBookingTx).toBe('0xSIM_DEMO_REF');
  });

  it('reminderService labels dispatches with [SIM] and does not leak hardcoded passcodes (#4088)', () => {
    const events: string[] = [];
    const unsubscribe = reminderService.subscribe((evt) => {
      events.push(`${evt.title} | ${evt.message}`);
    });

    const apt: Appointment = {
      id: 'apt-sim-1',
      clientName: DEMO_CLIENT_PROFILE.name,
      clientPhone: DEMO_CLIENT_PROFILE.phone,
      clientEmail: DEMO_CLIENT_PROFILE.email,
      artistId: 'artist-1',
      artistName: 'Elena Vasiliev',
      artistAvatar: '',
      serviceId: 'srv-1',
      serviceName: 'Chrome Sculpt',
      price: 150,
      currency: 'USD',
      date: getRelativeDateISO(1),
      timeSlot: '14:30',
      status: 'confirmed',
      remindersEnabled: true,
      pushReminderScheduled: true,
      smsReminderScheduled: true,
      createdAt: new Date().toISOString(),
    };

    reminderService.dispatch24HourReminder(apt);
    reminderService.dispatch2HourReminder(apt);
    unsubscribe();

    expect(events.length).toBeGreaterThanOrEqual(3);
    for (const line of events) {
      expect(line).toContain('[SIM]');
      expect(line).not.toContain('#4088');
    }
  });
});

describe('Expanded calendarSync & date helpers (K-08, K-16)', () => {
  it('parses 12-hour AM/PM and Tomorrow relative dates accurately', () => {
    const pm = parseAppointmentDateTime('2026-12-01', '02:30 PM', 90);
    expect(pm.start.getHours()).toBe(14);
    expect(pm.start.getMinutes()).toBe(30);
    expect(pm.end.getHours()).toBe(16);

    const midnight = parseAppointmentDateTime('Tomorrow', '12:15 AM', 60);
    expect(midnight.start.getHours()).toBe(0);
    expect(midnight.start.getMinutes()).toBe(15);
  });

  it('escapes commas, semicolons, and newlines per RFC 5545 and avoids on-chain claims in .ics & Outlook URL', () => {
    const apt: Appointment = {
      id: 'apt-esc-1',
      clientName: 'Guest; Client',
      clientPhone: '+34 600 000 000',
      clientEmail: 'guest.demo@nailix.example',
      artistId: 'artist-1',
      artistName: 'Elena; Vasiliev',
      artistAvatar: '',
      serviceId: 'srv-1',
      serviceName: 'Chrome, Gold\\Bronze',
      price: 165,
      currency: 'USD',
      date: getRelativeDateISO(2),
      timeSlot: '11:00',
      status: 'confirmed',
      remindersEnabled: true,
      pushReminderScheduled: true,
      smsReminderScheduled: true,
      customNotes: 'Line 1\nLine 2; Extra, Care',
      createdAt: new Date().toISOString(),
    };

    const ics = generateIcsContent(apt);
    expect(ics).toContain('Chrome\\, Gold\\\\Bronze');
    expect(ics).toContain('Elena\\; Vasiliev');
    expect(ics).toContain('Line 1\\nLine 2\\; Extra\\, Care');
    expect(ics).toContain('Booking Reference [SIM]');
    expect(ics).not.toContain('On-Chain');

    const outlook = generateOutlookCalendarUrl(apt);
    expect(outlook).toContain('https://outlook.live.com/calendar/0/deeplink/compose?');
    expect(outlook).not.toContain('On-Chain');
  });
});
