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
  onPersistAppointments?: (next: Appointment[], action: string, payload: unknown) => void;
}

export interface UseBookingFlowReturn {
  appointments: Appointment[];
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
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
 * Custom hook encapsulating the entire booking & escrow checkout workflow:
 * - Selected artist & look target
 * - Step 1: BookingModal (date, service, slot selection)
 * - Step 2: CheckoutModal (currency & escrow deposit simulation)
 * - Local-First IndexedDB persistence + Outbox queue delegation via callbacks
 * - Decoupled from CryptoCloud [SIM] implementation (DIP K-15 completed)
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

  // Launch booking for a specific artwork look
  const handleStartBookingWithLook = useCallback(
    (look: PortfolioItem) => {
      const artist = artists.find(a => a.id === look.artistId) || null;
      if (!artist && onNotifyToast) {
        onNotifyToast({
          id: `toast-artist-missing-${Date.now()}`,
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

  // Launch booking for a specific artist
  const handleStartBookingWithArtist = useCallback((artist: Artist) => {
    setBookingArtistTarget(artist);
    setBookingLookTarget(null);
    setIsBookingModalOpen(true);
  }, []);

  // Step 1 Completed -> Open Multi-currency Demo Checkout
  const handleProceedToCheckout = useCallback((details: PendingBookingDetails) => {
    setPendingBookingDetails(details);
    setIsBookingModalOpen(false);
    setIsCheckoutOpen(true);
  }, []);

  // Step 2 Completed -> Persisted locally in IndexedDB + queued in Outbox (Stage 2 Local-First)
  const handlePaymentSuccess = useCallback(
    (newAppointment: Appointment) => {
      const nextAppointments = [newAppointment, ...appointmentsRef.current];
      appointmentsRef.current = nextAppointments;
      setAppointments(nextAppointments);

      onPersistAppointments?.(nextAppointments, 'BOOKING_CREATED', {
        appointmentId: newAppointment.id,
        artistId: newAppointment.artistId,
        date: newAppointment.date,
        timeSlot: newAppointment.timeSlot,
      });

      // [SIM] Trigger local simulated 24h & 2h reminder previews
      reminderService.dispatch24HourReminder(newAppointment);
      reminderService.dispatch2HourReminder(newAppointment);

      // [SIM] Broadcast appointment block to peer nodes via injected facade
      onBroadcastToSwarm?.('APPOINTMENT_ESCROW_LOCKED', {
        appointmentId: newAppointment.id,
        escrowHash: newAppointment.escrowTxHash || '0xSIM_DEMO_REF',
        artistId: newAppointment.artistId,
        currency: newAppointment.currency,
        price: newAppointment.price,
      });

      // Notify user via toast callback
      onNotifyToast?.({
        id: `toast-${Date.now()}`,
        type: 'push',
        title: 'Booking Saved Offline (IndexedDB)',
        message: `Booking recorded in local IndexedDB for ${newAppointment.artistName} on ${newAppointment.date} at ${newAppointment.timeSlot} (escrow deposit preview [SIM]).`,
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Client Device',
      });
    },
    [onBroadcastToSwarm, onNotifyToast, onPersistAppointments]
  );

  // Release escrow from Admin Dashboard
  const handleReleaseEscrow = useCallback(
    (appointmentId: string) => {
      const nextAppointments = appointmentsRef.current.map(app =>
        app.id === appointmentId ? { ...app, status: 'completed' as const } : app
      );
      appointmentsRef.current = nextAppointments;
      setAppointments(nextAppointments);

      onPersistAppointments?.(nextAppointments, 'ESCROW_RELEASED', {
        appointmentId,
        timestamp: Date.now(),
      });

      // [SIM] Broadcast payout to artist via injected facade
      onBroadcastToSwarm?.('ESCROW_RELEASED_TO_ARTIST', {
        appointmentId,
        timestamp: Date.now(),
      });
    },
    [onBroadcastToSwarm, onPersistAppointments]
  );

  // Manual trigger appointment reminder from dashboard
  const handleTriggerAppointmentReminder = useCallback((appointment: Appointment) => {
    reminderService.dispatch24HourReminder(appointment);
    reminderService.dispatch2HourReminder(appointment);
  }, []);

  return {
    appointments,
    setAppointments,
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
