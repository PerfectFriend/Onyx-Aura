import React from 'react';
import { Bell, MessageSquare, X } from 'lucide-react';
import { ReminderNotificationEvent } from '../services/reminderService';

interface ToastNotificationProps {
  notifications: ReminderNotificationEvent[];
  onDismiss: (id: string) => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({
  notifications,
  onDismiss,
}) => {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {notifications.map(n => {
        const isSms = n.type === 'sms';

        return (
          <div
            key={n.id}
            className="pointer-events-auto p-4 rounded-xl bg-[#15171e] border border-[#272a33] shadow-2xl text-xs space-y-1.5 transition-all transform animate-in slide-in-from-bottom-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isSms ? (
                  <MessageSquare className="w-4 h-4 text-[#d4af37]" />
                ) : (
                  <Bell className="w-4 h-4 text-[#38bdf8]" />
                )}
                <span className="font-semibold text-white">{n.title}</span>
              </div>
              <button
                onClick={() => onDismiss(n.id)}
                className="text-[#9ca3af] hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[#d1d5db] leading-relaxed">
              {n.message}
            </p>

            <div className="flex items-center justify-between text-[10px] text-[#9ca3af] font-mono pt-1 border-t border-[#1f222b]">
              <span>To: {n.phoneOrTarget}</span>
              <span>{n.timestamp}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
