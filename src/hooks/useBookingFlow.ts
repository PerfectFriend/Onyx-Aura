import { useState, useRef, useEffect, useCallback } from 'react';
import { Appointment, Artist, PortfolioItem, NailService } from '../types';
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
  handleReleaseEscrow: (appointmentId: string) => void;
  handleTriggerAppointmentReminder: (appointment: Appointment) => void;
}

/**
 * Custom hook encapsulating the booking & [SIM] deposit preview checkout workflow.
 * Initialized once from Load-then-Mount bootstrap data (L-11).
 */
export function useBookingFlow({
  artists,
  initialBookingOpen = false,
  initialAppointments,
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
    handleReleaseEscrow,
    handleTriggerAppointmentReminder,
  };
}
