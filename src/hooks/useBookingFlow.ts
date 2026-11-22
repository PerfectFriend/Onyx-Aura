import { useState, useRef, useEffect, useCallback } from 'react';
import { Appointment, Artist, PortfolioItem, NailService } from '../types';
import { matchIntentToAppointment } from '../domain/payments';
import { fetchServerPaymentIntentStatus } from '../infrastructure/payments/hostedCheckoutProvider';
import { createSeedSnapshot } from '../infrastructure/storage/salonRepository';
import { reminderService, ReminderNotificationEvent } from '../services/reminderService';

export interface PendingBookingDetails {
  artist: Artist;
  service: NailService;
  date: string;
  timeSlot: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  customNotes: string;
  enablePush: boolean;
  enableSMS: boolean;
  referenceLook?: PortfolioItem;
}

export interface UseBookingFlowProps {
  artists: Artist[];
  initialBookingOpen?: boolean;
  initialAppointments?: Appointment[];
  externalRevision?: number;
  onNotifyToast?: (event: ReminderNotificationEvent) => void;
  onBroadcastToSwarm?: (type: string, payload: unknown) => void;
  onPersistAppointments?: (next: Appointment[], action: string, payload: unknown) => Promise<void> | void;
}

export interface UseBookingFlowReturn {
  appointments: Appointment[];
  isBookingModalOpen: boolean;
  setIsBookingModalOpen: (open: boolean) => void;
  isAppointmentsModalOpen: boolean;
  setIsAppointmentsModalOpen: (open: boolean) => void;
  bookingArtistTarget: Artist | null;
  setBookingArtistTarget: (artist: Artist | null) => void;
  bookingLookTarget: PortfolioItem | null;
  setBookingLookTarget: (look: PortfolioItem | null) => void;
  isCheckoutOpen: boolean;
  setIsCheckoutOpen: (open: boolean) => void;
  pendingBookingDetails: PendingBookingDetails | null;
  setPendingBookingDetails: (details: PendingBookingDetails | null) => void;
  handleStartBookingWithLook: (look: PortfolioItem) => void;
  handleStartBookingWithArtist: (artist: Artist) => void;
  handleProceedToCheckout: (details: PendingBookingDetails) => void;
  handlePaymentSuccess: (newAppointment: Appointment) => void;
  handleHostedPendingCreated: (pendingAppointment: Appointment) => Promise<void>;
  reconcileHostedCheckoutReturn: (intentId: string) => Promise<void>;
  handleReleaseEscrow: (appointmentId: string) => void;
  handleTriggerAppointmentReminder: (appointment: Appointment) => void;
}

/**
 * Custom hook encapsulating the booking & [SIM] deposit preview checkout workflow.
 * Initialized once from Load-then-Mount bootstrap data and updates cleanly on cross-tab sync (N-04).
 */
export function useBookingFlow({
  artists,
  initialBookingOpen = false,
  initialAppointments,
  externalRevision = 0,
  onNotifyToast,
  onBroadcastToSwarm,
  onPersistAppointments,
}: UseBookingFlowProps): UseBookingFlowReturn {
  const [appointments, setAppointments] = useState<Appointment[]>(
    () => initialAppointments ?? createSeedSnapshot().appointments
  );
  const appointmentsRef = useRef<Appointment[]>(appointments);

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  useEffect(() => {
    if (externalRevision > 0 && initialAppointments) {
      appointmentsRef.current = initialAppointments;
      setAppointments(initialAppointments);
    }
  }, [externalRevision, initialAppointments]);

  const [isBookingModalOpen, setIsBookingModalOpen] = useState<boolean>(initialBookingOpen);
  const [isAppointmentsModalOpen, setIsAppointmentsModalOpen] = useState<boolean>(false);
  const [bookingArtistTarget, setBookingArtistTarget] = useState<Artist | null>(null);
  const [bookingLookTarget, setBookingLookTarget] = useState<PortfolioItem | null>(null);

  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [pendingBookingDetails, setPendingBookingDetails] = useState<PendingBookingDetails | null>(null);

  const handleStartBookingWithLook = useCallback(
    (look: PortfolioItem) => {
      const artist = artists.find(a => a.id === look.artistId) || null;
      if (!artist && onNotifyToast) {
        onNotifyToast({
          id: `toast-artist-missing-${crypto.randomUUID?.() ?? Date.now()}`,
          type: 'push',
          title: '[SIM] Master Profile Not Matched',
          message: `Please pick a master artist manually for "${look.title}".`,
          timestamp: new Date().toLocaleTimeString(),
          phoneOrTarget: 'Client Device',
        });
      }
      setBookingArtistTarget(artist);
      setBookingLookTarget(look);
      setIsBookingModalOpen(true);
    },
    [artists, onNotifyToast]
  );

  const handleStartBookingWithArtist = useCallback((artist: Artist) => {
    setBookingArtistTarget(artist);
    setBookingLookTarget(null);
    setIsBookingModalOpen(true);
  }, []);

  const handleProceedToCheckout = useCallback((details: PendingBookingDetails) => {
    setPendingBookingDetails(details);
    setIsBookingModalOpen(false);
    setIsCheckoutOpen(true);
  }, []);

  const handlePaymentSuccess = useCallback(
    (newAppointment: Appointment) => {
      const taggedAppointment: Appointment = { ...newAppointment, origin: 'user' };
      const nextAppointments = [taggedAppointment, ...appointmentsRef.current];
      appointmentsRef.current = nextAppointments;
      setAppointments(nextAppointments);

      void Promise.resolve(
        onPersistAppointments?.(nextAppointments, 'BOOKING_CREATED', {
          appointmentId: taggedAppointment.id,
          artistId: taggedAppointment.artistId,
          date: taggedAppointment.date,
          timeSlot: taggedAppointment.timeSlot,
        })
      ).catch(err => {
        console.warn('[Booking] Persist failed cleanly:', err);
      });

      // [SIM] Trigger local simulated 24h & 2h reminder previews
      reminderService.dispatch24HourReminder(taggedAppointment);
      reminderService.dispatch2HourReminder(taggedAppointment);

      // [SIM] Broadcast appointment event to tab swarm
      onBroadcastToSwarm?.('APPOINTMENT_DEPOSIT_SIM', {
        appointmentId: taggedAppointment.id,
        escrowHash: taggedAppointment.escrowTxHash || '0xSIM_DEMO_REF',
        artistId: taggedAppointment.artistId,
        currency: taggedAppointment.currency,
        price: taggedAppointment.price,
      });

      onNotifyToast?.({
        id: `toast-${crypto.randomUUID?.() ?? Date.now()}`,
        type: 'push',
        title: 'Запись сохранена локально',
        message: `${taggedAppointment.artistName} · ${taggedAppointment.date} ${taggedAppointment.timeSlot} (депозит [SIM]).`,
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Local Storage',
      });
    },
    [onBroadcastToSwarm, onNotifyToast, onPersistAppointments]
  );

  const handleHostedPendingCreated = useCallback(
    async (pendingAppointment: Appointment) => {
      const taggedAppointment: Appointment = {
        ...pendingAppointment,
        status: 'pending',
        origin: 'user',
      };
      const exists = appointmentsRef.current.some(a => a.id === taggedAppointment.id);
      const nextAppointments = exists
        ? appointmentsRef.current.map(a => (a.id === taggedAppointment.id ? taggedAppointment : a))
        : [taggedAppointment, ...appointmentsRef.current];

      appointmentsRef.current = nextAppointments;
      setAppointments(nextAppointments);

      await Promise.resolve(
        onPersistAppointments?.(nextAppointments, 'BOOKING_HOSTED_PENDING_CREATED', {
          appointmentId: taggedAppointment.id,
          artistId: taggedAppointment.artistId,
          date: taggedAppointment.date,
          timeSlot: taggedAppointment.timeSlot,
        })
      );

      onNotifyToast?.({
        id: `toast-pending-${crypto.randomUUID?.() ?? Date.now()}`,
        type: 'push',
        title: 'Бронь ожидает оплаты Stripe',
        message: `${taggedAppointment.artistName} · ${taggedAppointment.date} ${taggedAppointment.timeSlot}`,
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Stripe Hosted Checkout',
      });
    },
    [onNotifyToast, onPersistAppointments]
  );

  const reconcileHostedCheckoutReturn = useCallback(
    async (intentId: string) => {
      const serverIntent = await fetchServerPaymentIntentStatus(intentId);
      if (!serverIntent) {
        onNotifyToast?.({
          id: `toast-intent-missing-${crypto.randomUUID?.() ?? Date.now()}`,
          type: 'push',
          title: 'Статус оплаты недоступен',
          message: `Сервер не вернул подтверждение для платежа ${intentId}. Проверьте вкладку «Мои записи».`,
          timestamp: new Date().toLocaleTimeString(),
          phoneOrTarget: 'Stripe Server Intent',
        });
        return;
      }

      const currentList = appointmentsRef.current;
      const target = matchIntentToAppointment(serverIntent, currentList);

      if (serverIntent.status === 'captured') {
        const authoritativePrice = Number((serverIntent.amountMinor / 100).toFixed(2));
        if (!target) {
          const slotInfo =
            serverIntent.appointmentDate && serverIntent.appointmentTimeSlot
              ? ` (${serverIntent.appointmentDate} ${serverIntent.appointmentTimeSlot})`
              : '';
          onNotifyToast?.({
            id: `toast-unmatched-capture-${crypto.randomUUID?.() ?? Date.now()}`,
            type: 'push',
            title: 'Платёж получен — подтвердите время в салоне',
            message: `Депозит $${authoritativePrice} USD подтверждён (${serverIntent.id.slice(0, 18)}...)${slotInfo}, но локальная бронь на этом устройстве не найдена.`,
            timestamp: new Date().toLocaleTimeString(),
            phoneOrTarget: 'Stripe Server Intent',
          });
          return;
        }

        if (target.status === 'escrow_locked' && target.escrowTxHash === serverIntent.id) {
          return;
        }

        const updatedAppointment: Appointment = {
          ...target,
          status: 'escrow_locked',
          price: authoritativePrice,
          escrowTxHash: serverIntent.id,
          origin: 'user',
        };
        const nextAppointments = currentList.map(app =>
          app.id === target.id ? updatedAppointment : app
        );

        appointmentsRef.current = nextAppointments;
        setAppointments(nextAppointments);

        await Promise.resolve(
          onPersistAppointments?.(nextAppointments, 'HOSTED_CHECKOUT_CAPTURED', {
            appointmentId: updatedAppointment.id,
            intentId: serverIntent.id,
          })
        ).catch(err => {
          console.warn('[Booking] Hosted capture persist failed:', err);
        });

        reminderService.dispatch24HourReminder(updatedAppointment);
        reminderService.dispatch2HourReminder(updatedAppointment);
        onBroadcastToSwarm?.('HOSTED_CHECKOUT_CAPTURED', {
          appointmentId: updatedAppointment.id,
          intentId: serverIntent.id,
        });

        onNotifyToast?.({
          id: `toast-captured-${crypto.randomUUID?.() ?? Date.now()}`,
          type: 'push',
          title: 'Депозит Stripe подтверждён',
          message: `${updatedAppointment.artistName} · $${authoritativePrice} USD (${serverIntent.id.slice(0, 18)}...)`,
          timestamp: new Date().toLocaleTimeString(),
          phoneOrTarget: 'Stripe Webhook',
        });
        return;
      }

      if (serverIntent.status === 'partially_refunded' || serverIntent.status === 'disputed') {
        const refundedUsd = Number(((serverIntent.amountRefundedMinor ?? 0) / 100).toFixed(2));
        onNotifyToast?.({
          id: `toast-adjust-${crypto.randomUUID?.() ?? Date.now()}`,
          type: 'push',
          title:
            serverIntent.status === 'disputed'
              ? 'По платежу открыт спор (Dispute)'
              : 'Выполнен частичный возврат',
          message:
            serverIntent.status === 'disputed'
              ? `Бронь ${serverIntent.bookingReferenceId} ожидает разбора спора Stripe.`
              : `Возвращено $${refundedUsd} USD по брони ${serverIntent.bookingReferenceId}; остаток депозита активен.`,
          timestamp: new Date().toLocaleTimeString(),
          phoneOrTarget: 'Stripe Server Intent',
        });
        return;
      }

      if (
        serverIntent.status === 'released' ||
        serverIntent.status === 'canceled' ||
        serverIntent.status === 'failed'
      ) {
        if (target && target.status !== 'cancelled') {
          const cancelled: Appointment = {
            ...target,
            status: 'cancelled',
            escrowTxHash: serverIntent.id,
            origin: 'user',
          };
          const nextAppointments = currentList.map(app => (app.id === target.id ? cancelled : app));
          appointmentsRef.current = nextAppointments;
          setAppointments(nextAppointments);

          await Promise.resolve(
            onPersistAppointments?.(nextAppointments, 'HOSTED_CHECKOUT_CLOSED', {
              appointmentId: target.id,
              status: serverIntent.status,
            })
          ).catch(err => {
            console.warn('[Booking] Hosted cancel persist failed:', err);
          });
        }

        onNotifyToast?.({
          id: `toast-cancelled-${crypto.randomUUID?.() ?? Date.now()}`,
          type: 'push',
          title: serverIntent.status === 'released' ? 'Платёж возвращён' : 'Оплата не завершена',
          message: `Статус сервера для ${serverIntent.bookingReferenceId}: ${serverIntent.status}.`,
          timestamp: new Date().toLocaleTimeString(),
          phoneOrTarget: 'Stripe Server Intent',
        });
        return;
      }

      onNotifyToast?.({
        id: `toast-awaiting-${crypto.randomUUID?.() ?? Date.now()}`,
        type: 'push',
        title: 'Ожидаем подтверждения от Stripe',
        message: `Бронь ${serverIntent.bookingReferenceId} сохранена со статусом pending (${serverIntent.status}).`,
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Stripe Webhook',
      });
    },
    [onBroadcastToSwarm, onNotifyToast, onPersistAppointments]
  );

  const handleReleaseEscrow = useCallback(
    (appointmentId: string) => {
      const nextAppointments = appointmentsRef.current.map(app =>
        app.id === appointmentId ? { ...app, status: 'completed' as const } : app
      );
      appointmentsRef.current = nextAppointments;
      setAppointments(nextAppointments);

      void Promise.resolve(
        onPersistAppointments?.(nextAppointments, 'DEPOSIT_DEMO_RELEASED', {
          appointmentId,
        })
      ).catch(err => {
        console.warn('[Booking] Release persist failed cleanly:', err);
      });

      onBroadcastToSwarm?.('DEPOSIT_DEMO_RELEASED', {
        appointmentId,
        timestamp: Date.now(),
      });
    },
    [onBroadcastToSwarm, onPersistAppointments]
  );

  const handleTriggerAppointmentReminder = useCallback((appointment: Appointment) => {
    reminderService.dispatch24HourReminder(appointment);
    reminderService.dispatch2HourReminder(appointment);
  }, []);

  return {
    appointments,
    isBookingModalOpen,
    setIsBookingModalOpen,
    isAppointmentsModalOpen,
    setIsAppointmentsModalOpen,
    bookingArtistTarget,
    setBookingArtistTarget,
    bookingLookTarget,
    setBookingLookTarget,
    isCheckoutOpen,
    setIsCheckoutOpen,
    pendingBookingDetails,
    setPendingBookingDetails,
    handleStartBookingWithLook,
    handleStartBookingWithArtist,
    handleProceedToCheckout,
    handlePaymentSuccess,
    handleHostedPendingCreated,
    reconcileHostedCheckoutReturn,
    handleReleaseEscrow,
    handleTriggerAppointmentReminder,
  };
}
