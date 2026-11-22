import { useState, useRef, useEffect, useCallback } from 'react';
import { Appointment, Artist, PortfolioItem, NailService } from '../types';
import { createId } from '../domain/ids';
import { matchIntentToAppointment } from '../domain/payments';
import { SupportedLanguage } from '../i18n/translations';
import { formatAppMessage } from '../i18n/messages';
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
  language?: SupportedLanguage;
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
  language,
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
          id: createId('toast-artist-missing'),
          type: 'push',
          title: formatAppMessage('booking.artist_missing.title', {}, language),
          message: formatAppMessage(
            'booking.artist_missing.message',
            { lookTitle: look.title },
            language
          ),
          timestamp: new Date().toLocaleTimeString(),
          phoneOrTarget: 'Client Device',
        });
      }
      setBookingArtistTarget(artist);
      setBookingLookTarget(look);
      setIsBookingModalOpen(true);
    },
    [artists, language, onNotifyToast]
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
        id: createId('toast'),
        type: 'push',
        title: formatAppMessage('booking.saved_local.title', {}, language),
        message: formatAppMessage(
          'booking.saved_local.message',
          {
            artistName: taggedAppointment.artistName,
            date: taggedAppointment.date,
            timeSlot: taggedAppointment.timeSlot,
          },
          language
        ),
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Local Storage',
      });
    },
    [language, onBroadcastToSwarm, onNotifyToast, onPersistAppointments]
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
        id: createId('toast-pending'),
        type: 'push',
        title: formatAppMessage('booking.hosted_pending.title', {}, language),
        message: formatAppMessage(
          'booking.hosted_pending.message',
          {
            artistName: taggedAppointment.artistName,
            date: taggedAppointment.date,
            timeSlot: taggedAppointment.timeSlot,
          },
          language
        ),
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Stripe Hosted Checkout',
      });
    },
    [language, onNotifyToast, onPersistAppointments]
  );

  const reconcileHostedCheckoutReturn = useCallback(
    async (intentId: string) => {
      const serverIntent = await fetchServerPaymentIntentStatus(intentId);
      if (!serverIntent) {
        onNotifyToast?.({
          id: createId('toast-intent-missing'),
          type: 'push',
          title: formatAppMessage('booking.intent_missing.title', {}, language),
          message: formatAppMessage(
            'booking.intent_missing.message',
            { intentId },
            language
          ),
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
            id: createId('toast-unmatched-capture'),
            type: 'push',
            title: formatAppMessage('booking.unmatched_capture.title', {}, language),
            message: formatAppMessage(
              'booking.unmatched_capture.message',
              {
                amount: authoritativePrice,
                intentShort: serverIntent.id.slice(0, 18),
                slotInfo,
              },
              language
            ),
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
          id: createId('toast-captured'),
          type: 'push',
          title: formatAppMessage('booking.captured.title', {}, language),
          message: formatAppMessage(
            'booking.captured.message',
            {
              artistName: updatedAppointment.artistName,
              amount: authoritativePrice,
              intentShort: serverIntent.id.slice(0, 18),
            },
            language
          ),
          timestamp: new Date().toLocaleTimeString(),
          phoneOrTarget: 'Stripe Webhook',
        });
        return;
      }

      if (serverIntent.status === 'partially_refunded' || serverIntent.status === 'disputed') {
        const refundedUsd = Number(((serverIntent.amountRefundedMinor ?? 0) / 100).toFixed(2));
        onNotifyToast?.({
          id: createId('toast-adjust'),
          type: 'push',
          title: formatAppMessage(
            serverIntent.status === 'disputed'
              ? 'booking.disputed.title'
              : 'booking.partially_refunded.title',
            {},
            language
          ),
          message: formatAppMessage(
            serverIntent.status === 'disputed'
              ? 'booking.disputed.message'
              : 'booking.partially_refunded.message',
            {
              bookingRef: serverIntent.bookingReferenceId,
              amount: refundedUsd,
            },
            language
          ),
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
          id: createId('toast-cancelled'),
          type: 'push',
          title: formatAppMessage(
            serverIntent.status === 'released'
              ? 'booking.released.title'
              : 'booking.incomplete.title',
            {},
            language
          ),
          message: formatAppMessage(
            serverIntent.status === 'released'
              ? 'booking.released.message'
              : 'booking.incomplete.message',
            {
              bookingRef: serverIntent.bookingReferenceId,
              status: serverIntent.status,
            },
            language
          ),
          timestamp: new Date().toLocaleTimeString(),
          phoneOrTarget: 'Stripe Server Intent',
        });
        return;
      }

      onNotifyToast?.({
        id: createId('toast-awaiting'),
        type: 'push',
        title: formatAppMessage('booking.awaiting.title', {}, language),
        message: formatAppMessage(
          'booking.awaiting.message',
          {
            bookingRef: serverIntent.bookingReferenceId,
            status: serverIntent.status,
          },
          language
        ),
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Stripe Webhook',
      });
    },
    [language, onBroadcastToSwarm, onNotifyToast, onPersistAppointments]
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
