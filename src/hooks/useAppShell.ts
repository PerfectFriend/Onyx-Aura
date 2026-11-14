import { useState, useEffect, useCallback } from 'react';
import { UserRole } from '../types';
import { reminderService, ReminderNotificationEvent } from '../services/reminderService';

function readInitialUrlParams(): { initialTab: string; deepLinkAction: string | null } {
  if (typeof window === 'undefined') {
    return { initialTab: 'explore', deepLinkAction: null };
  }
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  const actionParam = params.get('action');

  if (actionParam === 'ar') {
    return { initialTab: 'android', deepLinkAction: actionParam };
  }
  return {
    initialTab: tabParam || 'explore',
    deepLinkAction: actionParam,
  };
}

/**
 * Encapsulates application shell infrastructure:
 * - Active tab routing & client/master role toggle
 * - Android Permissions modal state
 * - Real-time toast queue & reminderService subscription
 * - PWA deep-link URL parameter parsing (?tab=..., ?action=book|ar)
 */
export function useAppShell() {
  const [{ initialTab, deepLinkAction }] = useState(readInitialUrlParams);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [userRole, setUserRole] = useState<UserRole>('client');
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ReminderNotificationEvent[]>([]);

  const pushToast = useCallback((evt: ReminderNotificationEvent) => {
    setToasts(prev => [evt, ...prev.slice(0, 4)]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Subscribe to Reminder Service & browser push permission prompt on mount
  useEffect(() => {
    const unsubReminders = reminderService.subscribe((evt) => {
      setToasts(prev => [evt, ...prev.slice(0, 4)]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== evt.id));
      }, 6000);
    });

    const requestNotice = () => {
      reminderService.requestPushPermission();
      window.removeEventListener('click', requestNotice);
    };
    window.addEventListener('click', requestNotice);

    return () => {
      unsubReminders();
      window.removeEventListener('click', requestNotice);
    };
  }, []);

  return {
    activeTab,
    setActiveTab,
    userRole,
    setUserRole,
    deepLinkAction,
    isPermissionsModalOpen,
    setIsPermissionsModalOpen,
    toasts,
    pushToast,
    dismissToast,
  };
}
