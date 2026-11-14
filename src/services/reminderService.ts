// =============================================================================
// [SIM] — SIMULATED REMINDER DISPATCHER (in-app toast + optional Browser Notification)
// No real SMS carrier gateway is connected in Stage 1.5; alerts fire locally.
// See docs/REALITY_MAP.md & MANIFEST_CANONICAL_AI_DEVELOPER.md Law 1, 7, 10.
// =============================================================================

import { Appointment } from '../types';

export interface ReminderNotificationEvent {
  id: string;
  type: 'sms' | 'push';
  title: string;
  message: string;
  timestamp: string;
  phoneOrTarget: string;
}

type ReminderListener = (event: ReminderNotificationEvent) => void;

function nextId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

class ReminderService {
  private listeners: ReminderListener[] = [];

  public subscribe(cb: ReminderListener) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  private notify(event: ReminderNotificationEvent) {
    this.listeners.forEach(cb => {
      try {
        cb(event);
      } catch (err) {
        console.error('[SIM] Error in reminder listener', err);
      }
    });

    // Dispatch native browser Notification API if user already granted permission
    if (event.type === 'push' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          new Notification(event.title, {
            body: event.message,
            icon: '/assets/images/avatar_master_artist_1790123890131.jpg',
          });
        } catch {
          // Ignore browser Notification constructor errors in headless/sandbox environments
        }
      }
    }
  }

  public async requestPushPermission(): Promise<boolean> {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const res = await Notification.requestPermission();
        return res === 'granted';
      } catch {
        return false;
      }
    }
    return false;
  }

  public getPushPermissionStatus(): NotificationPermission {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'denied';
  }

  // [SIM] Trigger simulated 24h appointment reminder preview (fires immediately for demo)
  public dispatch24HourReminder(apt: Appointment) {
    const smsMessage = `[SIM Preview] 24h reminder: Appointment with ${apt.artistName} for "${apt.serviceName}" on ${apt.date} at ${apt.timeSlot}. No live SMS is sent.`;

    this.notify({
      id: nextId('sim-24h'),
      type: 'sms',
      title: '[SIM] Simulated 24h SMS Preview',
      message: smsMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      phoneOrTarget: `${apt.clientPhone || '+34 600 000 000'} (Demo)`,
    });

    if (apt.pushReminderScheduled) {
      this.notify({
        id: nextId('sim-push-24h'),
        type: 'push',
        title: `[SIM] 24h Push Preview: ${apt.serviceName}`,
        message: `Local preview for session with ${apt.artistName} at ${apt.timeSlot}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        phoneOrTarget: 'Local Browser Toast [SIM]',
      });
    }
  }

  // [SIM] Trigger simulated 2h appointment reminder preview (fires immediately for demo)
  public dispatch2HourReminder(apt: Appointment) {
    const smsMessage = `[SIM Preview] 2h alert: ${apt.artistName} for "${apt.serviceName}" at ${apt.timeSlot}. Demo notification only.`;

    this.notify({
      id: nextId('sim-2h'),
      type: 'sms',
      title: '[SIM] Simulated 2h SMS Preview',
      message: smsMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      phoneOrTarget: `${apt.clientPhone || '+34 600 000 000'} (Demo)`,
    });

    this.notify({
      id: nextId('sim-push-2h'),
      type: 'push',
      title: `[SIM] 2h Push Preview: ${apt.artistName}`,
      message: `Session scheduled for ${apt.timeSlot} (instant demo alert).`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      phoneOrTarget: 'Local Browser Toast [SIM]',
    });
  }
}

export const reminderService = new ReminderService();
