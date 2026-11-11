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

class ReminderService {
  private listeners: ReminderListener[] = [];
  private notificationPermission: NotificationPermission = 'default';

  constructor() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.notificationPermission = Notification.permission;
    }
  }

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
        console.error('Error in reminder listener', err);
      }
    });

    // Also dispatch native browser push notification if granted
    if (event.type === 'push' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          new Notification(event.title, {
            body: event.message,
            icon: '/assets/images/avatar_master_artist_1790123890131.jpg',
          });
        } catch {
          // Ignore
        }
      }
    }
  }

  public async requestPushPermission(): Promise<boolean> {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const res = await Notification.requestPermission();
        this.notificationPermission = res;
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

  // Trigger simulated 24h appointment reminder
  public dispatch24HourReminder(apt: Appointment) {
    const smsMessage = `[ONYX & AURA] 24H Reminder: Your nail appointment with ${apt.artistName} for "${apt.serviceName}" is set for ${apt.date} at ${apt.timeSlot}. Escrow deposit locked. Reply RESCHEDULE if needed.`;
    
    this.notify({
      id: `rem-24h-${Date.now()}`,
      type: 'sms',
      title: 'SMS Sent via Carrier Network',
      message: smsMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      phoneOrTarget: apt.clientPhone || '+1 (555) 019-2831',
    });

    if (apt.pushReminderScheduled) {
      this.notify({
        id: `push-24h-${Date.now()}`,
        type: 'push',
        title: `Appointment Tomorrow: ${apt.serviceName}`,
        message: `Your session with master artist ${apt.artistName} is scheduled for tomorrow at ${apt.timeSlot}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        phoneOrTarget: 'Client Device Push Notification',
      });
    }
  }

  // Trigger simulated 2h appointment reminder
  public dispatch2HourReminder(apt: Appointment) {
    const smsMessage = `[ONYX & AURA] 2-Hour Alert: ${apt.artistName} is prepping the studio for your "${apt.serviceName}". See you at ${apt.timeSlot}. Directions & studio code sent to your chat.`;

    this.notify({
      id: `rem-2h-${Date.now()}`,
      type: 'sms',
      title: 'SMS Sent (Priority Gateway)',
      message: smsMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      phoneOrTarget: apt.clientPhone || '+1 (555) 019-2831',
    });

    this.notify({
      id: `push-2h-${Date.now()}`,
      type: 'push',
      title: `Starting in 2 Hours: ${apt.artistName}`,
      message: `Your appointment starts at ${apt.timeSlot}. Studio entry passcode is #4088.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      phoneOrTarget: 'Client Device Push Notification',
    });
  }
}

export const reminderService = new ReminderService();
