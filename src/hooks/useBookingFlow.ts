import { useState } from 'react';
import { Appointment, Artist, PortfolioItem, NailService } from '../types';
import { INITIAL_APPOINTMENTS } from '../data/initialData';
import { reminderService, ReminderNotificationEvent } from '../services/reminderService';
import { cryptoCloudSwarm } from '../simulation/cryptocloud';

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
  onNotifyToast?: (event: ReminderNotificationEvent) => void;
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
 * - Multi-appointment tracking and automated 24h / 2h reminder dispatching
 */
export function useBookingFlow({ artists, onNotifyToast }: UseBookingFlowProps): UseBookingFlowReturn {
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState<boolean>(false);
  const [isAppointmentsModalOpen, setIsAppointmentsModalOpen] = useState<boolean>(false);
  const [bookingArtistTarget, setBookingArtistTarget] = useState<Artist | null>(null);
  const [bookingLookTarget, setBookingLookTarget] = useState<PortfolioItem | null>(null);

  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [pendingBookingDetails, setPendingBookingDetails] = useState<PendingBookingDetails | null>(null);

  // Launch booking for a specific artwork look
  const handleStartBookingWithLook = (look: PortfolioItem) => {
    const artist = artists.find(a => a.id === look.artistId) || artists[0];
    setBookingArtistTarget(artist);
    setBookingLookTarget(look);
    setIsBookingModalOpen(true);
  };

  // Launch booking for a specific artist
  const handleStartBookingWithArtist = (artist: Artist) => {
    setBookingArtistTarget(artist);
    setBookingLookTarget(null);
    setIsBookingModalOpen(true);
  };

  // Step 1 Completed -> Open Multi-currency Escrow Checkout
  const handleProceedToCheckout = (details: PendingBookingDetails) => {
    setPendingBookingDetails(details);
    setIsBookingModalOpen(false);
    setIsCheckoutOpen(true);
  };

  // Step 2 Completed -> On-chain escrow locked & appointment confirmed
  const handlePaymentSuccess = (newAppointment: Appointment) => {
    setAppointments(prev => [newAppointment, ...prev]);

    // Schedule automated SMS & Push reminders
    reminderService.dispatch24HourReminder(newAppointment);
    reminderService.dispatch2HourReminder(newAppointment);

    // [SIM] Broadcast appointment block to peer nodes
    cryptoCloudSwarm.broadcastBlock('APPOINTMENT_ESCROW_LOCKED', {
      appointmentId: newAppointment.id,
      escrowHash: newAppointment.escrowTxHash || '0xESCROW_LOCKED',
      artistId: newAppointment.artistId,
      currency: newAppointment.currency,
      price: newAppointment.price,
    });

    // Notify user via toast callback
    if (onNotifyToast) {
      onNotifyToast({
        id: `toast-${Date.now()}`,
        type: 'push',
        title: 'Smart Escrow Locked On-Chain',
        message: `Your appointment with ${newAppointment.artistName} for ${newAppointment.date} at ${newAppointment.timeSlot} is guaranteed.`,
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Client Device',
      });
    }
  };

  // Release escrow from Admin Dashboard
  const handleReleaseEscrow = (appointmentId: string) => {
    setAppointments(prev => prev.map(app => {
      if (app.id === appointmentId) {
        return { ...app, status: 'completed' };
      }
      return app;
    }));

    // [SIM] Broadcast payout to artist
    cryptoCloudSwarm.broadcastBlock('ESCROW_RELEASED_TO_ARTIST', {
      appointmentId,
      timestamp: Date.now(),
    });
  };

  // Manual trigger appointment reminder from dashboard
  const handleTriggerAppointmentReminder = (appointment: Appointment) => {
    reminderService.dispatch24HourReminder(appointment);
    reminderService.dispatch2HourReminder(appointment);
  };

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
