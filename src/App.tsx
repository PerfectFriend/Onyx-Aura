import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { PortfolioGallery } from './components/PortfolioGallery';
import { LightboxModal } from './components/LightboxModal';
import { BookingModal } from './components/BookingModal';
import { CheckoutModal } from './components/CheckoutModal';
import { ChatDrawer } from './components/ChatDrawer';
import { ReputationLedger } from './components/ReputationLedger';
import { InstagramSyncSection } from './components/InstagramSyncSection';
import { CryptoCloudPanel } from './components/CryptoCloudPanel';
import { AdminAnalyticsDashboard } from './components/AdminAnalyticsDashboard';
import { ArtistsView } from './components/ArtistsView';
import { ToastNotification } from './components/ToastNotification';
import { FriendModerationSection } from './components/FriendModerationSection';
import { AndroidPermissionsModal } from './components/AndroidPermissionsModal';
import { AndroidExperienceView } from './components/AndroidExperienceView';
import { AndroidBottomNav } from './components/AndroidBottomNav';
import { AndroidFAB } from './components/AndroidFAB';
import { ClientLocationMap } from './components/ClientLocationMap';
import { SponsoredAdsBanner } from './components/SponsoredAdsBanner';
import { AdCampaignManagerModal } from './components/AdCampaignManagerModal';
import { ClientAppointmentsModal } from './components/ClientAppointmentsModal';
import { WallpaperModal, OrnamentDivider } from './components/OrnamentalFlourish';

import { 
  INITIAL_ARTISTS, 
  INITIAL_REVIEWS, 
  INITIAL_ANCHOR_POINTS
} from './data/initialData';

import { 
  Artist, 
  Review, 
  ClientAnchorPoint,
} from './types';

import { blockchainLedger } from './simulation/cryptoLedger';
import { reminderService, ReminderNotificationEvent } from './services/reminderService';
import { useAppChrome } from './hooks/useAppChrome';
import { useBookingFlow } from './hooks/useBookingFlow';
import { useChatConcierge } from './hooks/useChatConcierge';
import { useCryptoSwarm } from './hooks/useCryptoSwarm';
import { usePortfolioGallery } from './hooks/usePortfolioGallery';
import { useSponsoredAds } from './hooks/useSponsoredAds';

export default function App() {
  // Global UI Chrome (Theme, Language/Locale, Wallpaper) - Extracted in Sprint 1.1
  const {
    currentLanguage,
    setCurrentLanguage,
    t,
    theme,
    handleToggleTheme,
    wallpaper,
    isWallpaperModalOpen,
    setIsWallpaperModalOpen,
    handleSelectWallpaper,
  } = useAppChrome();

  // Core Data
  const [artists, setArtists] = useState<Artist[]>(INITIAL_ARTISTS);
  const [reviews, setReviews] = useState<Review[]>(INITIAL_REVIEWS);

  // Notifications & Reminders
  const [toasts, setToasts] = useState<ReminderNotificationEvent[]>([]);

  // Booking, Checkout & Appointments Flow - Extracted in Sprint 1.1
  const booking = useBookingFlow({
    artists,
    onNotifyToast: (evt) => setToasts(prev => [evt, ...prev.slice(0, 4)]),
  });

  // Navigation & Role State
  const [activeTab, setActiveTab] = useState<string>('explore');
  const [userRole, setUserRole] = useState<'client' | 'master'>('client');

  // Chat & Concierge Drawer - Extracted in Sprint 1.2
  const chat = useChatConcierge({
    userRole,
    artists,
  });

  // CryptoCloud Swarm & P2P State [SIM] - Extracted in Sprint 1.2
  const swarm = useCryptoSwarm();

  // Portfolio Stream, Likes/Saves, Lightbox & Instagram Import - Extracted in Sprint 1.3
  const portfolio = usePortfolioGallery({
    onSyncPostToSwarm: (newLook, igPostId) => {
      swarm.broadcastBlock('INSTAGRAM_PORTFOLIO_SYNC', {
        lookId: newLook.id,
        igPostId,
        artistId: newLook.artistId,
      });
    },
    onNotify: (title, message) => {
      setToasts(prev => [
        {
          id: `toast-ig-${Date.now()}`,
          type: 'push',
          title,
          message,
          timestamp: new Date().toLocaleTimeString(),
          phoneOrTarget: 'Client Device',
        },
        ...prev,
      ]);
    },
  });

  // Sponsored Ads Engine & Modal - Extracted in Sprint 1.3
  const adsEngine = useSponsoredAds({
    onBroadcastToSwarm: swarm.broadcastBlock,
  });

  // Handle Android PWA shortcuts & deep links (e.g., /?tab=android or /?action=book)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const actionParam = params.get('action');

      if (tabParam) {
        setActiveTab(tabParam);
      }
      if (actionParam === 'book') {
        booking.setIsBookingModalOpen(true);
      } else if (actionParam === 'ar') {
        setActiveTab('android');
      }
    }
  }, []);

  // Client Frequent Anchor Points (Home, Work, Studio/Gym)
  const [anchorPoints, setAnchorPoints] = useState<ClientAnchorPoint[]>(INITIAL_ANCHOR_POINTS);

  // Android Permissions & Build Modal
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState<boolean>(false);

  // Subscribe to Reminder Service on mount
  useEffect(() => {
    const unsubReminders = reminderService.subscribe((evt) => {
      setToasts(prev => [evt, ...prev.slice(0, 4)]);
      // Auto-dismiss after 6 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== evt.id));
      }, 6000);
    });

    // Request notification permission smoothly on first user interaction
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

  // Add review to blockchain ledger [SIM]
  const handleAddReview = async (reviewData: Parameters<typeof blockchainLedger.createVerifiedReviewBlock>[0]) => {
    const newReview = await blockchainLedger.createVerifiedReviewBlock(reviewData);
    setReviews(prev => [newReview, ...prev]);

    // Recalculate artist rating
    setArtists(prev => prev.map(art => {
      if (art.id === reviewData.artistId) {
        const artistReviews = [...reviews.filter(r => r.artistId === art.id), newReview];
        const avg = artistReviews.reduce((sum, r) => sum + r.rating, 0) / artistReviews.length;
        return {
          ...art,
          rating: Number(avg.toFixed(2)),
          totalReviews: art.totalReviews + 1,
        };
      }
      return art;
    }));

    // [SIM] Broadcast review block to swarm
    swarm.broadcastBlock('NEW_BLOCKCHAIN_REVIEW', {
      reviewId: newReview.id,
      artistId: newReview.artistId,
      blockHash: newReview.blockHash,
    });
  };

  // Client Anchor Point Update Handler
  const handleUpdateAnchorPoint = (updatedPoint: ClientAnchorPoint) => {
    setAnchorPoints(prev => prev.map(p => p.id === updatedPoint.id ? updatedPoint : p));
  };

  // Master Salon Address Registry Handler
  const handleUpdateMasterSalon = (artistId: string, salonName: string, salonAddress: string, lat: number, lng: number) => {
    setArtists(prev => prev.map(art => {
      if (art.id === artistId) {
        return {
          ...art,
          salonName,
          salonAddress,
          coordinates: { lat, lng },
        };
      }
      return art;
    }));
  };

  const wallpaperClass = 
    wallpaper === 'damask' 
      ? (theme === 'dark' ? 'app-wallpaper-damask-dark' : 'app-wallpaper-damask-light')
      : wallpaper === 'filigree'
      ? (theme === 'dark' ? 'app-wallpaper-filigree-dark' : 'app-wallpaper-filigree-light')
      : wallpaper === 'mosaic'
      ? (theme === 'dark' ? 'app-wallpaper-mosaic-dark' : 'app-wallpaper-mosaic-light')
      : (theme === 'dark' ? 'app-wallpaper-minimal-dark' : 'app-wallpaper-minimal-light');

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 relative ${wallpaperClass} ${
      theme === 'dark' ? 'text-[#edeef2]' : 'text-[#1a1e29]'
    }`}>
      
      {/* Top 3-Zone Navigation with Nailix Rebrand, Theme Toggle, Map & 10 Languages */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userRole={userRole}
        setUserRole={setUserRole}
        onOpenBooking={() => {
          booking.setBookingArtistTarget(null);
          booking.setBookingLookTarget(null);
          booking.setIsBookingModalOpen(true);
        }}
        onOpenAppointments={() => booking.setIsAppointmentsModalOpen(true)}
        appointmentsCount={booking.appointments.length}
        onOpenChat={chat.openChat}
        onOpenPermissions={() => setIsPermissionsModalOpen(true)}
        unreadChatCount={chat.unreadChatCount}
        swarmOnlineCount={swarm.swarmOnlineCount}
        currentLanguage={currentLanguage}
        onSelectLanguage={setCurrentLanguage}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenAdManager={adsEngine.openAdManager}
        onOpenWallpaper={() => setIsWallpaperModalOpen(true)}
        t={t}
      />

      {/* Main View Router with bottom padding for Android bottom nav */}
      <main className="flex-1 relative z-10 pb-24 sm:pb-28">
        {activeTab === 'explore' && (
          <>
            <HeroSection
              onExploreClick={() => {
                const el = document.getElementById('portfolio-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              onBookClick={() => {
                booking.setBookingArtistTarget(null);
                booking.setBookingLookTarget(null);
                booking.setIsBookingModalOpen(true);
              }}
              onOpenLedger={() => setActiveTab('ledger')}
              onOpenPermissions={() => setIsPermissionsModalOpen(true)}
              theme={theme}
              t={t}
            />

            <OrnamentDivider />

            {/* Targeted In-App Sponsored Ads (Salon Deals for Clients, Tools for Masters) */}
            <SponsoredAdsBanner
              ads={adsEngine.ads}
              userRole={userRole}
              onOpenAdManager={adsEngine.openAdManager}
              theme={theme}
              t={t}
            />

            <OrnamentDivider />

            <div id="portfolio-section">
              <PortfolioGallery
                items={portfolio.items}
                onSelectItem={portfolio.openLightbox}
                onBookItem={booking.handleStartBookingWithLook}
                likedIds={portfolio.likedIds}
                onToggleLike={portfolio.handleToggleLike}
                savedIds={portfolio.savedIds}
                onToggleSave={portfolio.handleToggleSave}
                onFlagToJury={() => setActiveTab('moderation')}
                theme={theme}
                t={t}
              />
            </div>
          </>
        )}

        {/* Hyper-Local Map & Distance Proximity View */}
        {activeTab === 'map' && (
          <div className="space-y-6">
            <ClientLocationMap
              artists={artists}
              anchorPoints={anchorPoints}
              onUpdateAnchorPoint={handleUpdateAnchorPoint}
              onSelectArtistToBook={booking.handleStartBookingWithArtist}
              onOpenChatWithArtist={chat.openChat}
              userRole={userRole}
              onUpdateMasterSalon={handleUpdateMasterSalon}
              theme={theme}
              t={t}
            />

            <SponsoredAdsBanner
              ads={adsEngine.ads}
              userRole={userRole}
              onOpenAdManager={adsEngine.openAdManager}
              theme={theme}
              t={t}
            />
          </div>
        )}

        {/* Friend Circle Consensus Moderation DAO View [SIM] */}
        {activeTab === 'moderation' && (
          <FriendModerationSection t={t} />
        )}

        {activeTab === 'artists' && (
          <div className="space-y-8">
            <ArtistsView
              artists={artists}
              onSelectArtistToBook={booking.handleStartBookingWithArtist}
              onOpenChatWithArtist={chat.openChat}
            />

            <SponsoredAdsBanner
              ads={adsEngine.ads}
              userRole={userRole}
              onOpenAdManager={adsEngine.openAdManager}
              theme={theme}
              t={t}
            />
          </div>
        )}

        {activeTab === 'ledger' && (
          <ReputationLedger
            reviews={reviews}
            artists={artists}
            onAddReview={handleAddReview}
          />
        )}

        {activeTab === 'instagram' && (
          <InstagramSyncSection
            artists={artists}
            onImportPost={portfolio.handleImportInstagramPost}
          />
        )}

        {activeTab === 'cryptocloud' && (
          <CryptoCloudPanel
            swarmState={swarm.swarmState}
            peers={swarm.peers}
            onTriggerBackup={() =>
              swarm.handleExportCryptoCloudBackup({
                appointments: booking.appointments,
                reviews,
                portfolio: portfolio.items,
                chats: chat.chatMessages,
              })
            }
            onSimulatePulse={swarm.handleSimulatePeerPulse}
            isBackingUp={swarm.isBackingUp}
            backupSuccessMessage={swarm.backupSuccessMessage}
          />
        )}

        {activeTab === 'analytics' && (
          <AdminAnalyticsDashboard
            appointments={booking.appointments}
            artists={artists}
            onReleaseEscrow={booking.handleReleaseEscrow}
            onTriggerReminder={booking.handleTriggerAppointmentReminder}
          />
        )}

        {/* Android Native Suite & AR Fitting View */}
        {activeTab === 'android' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            <AndroidExperienceView
              onBookLook={booking.handleStartBookingWithLook}
              onOpenBookingModal={() => booking.setIsBookingModalOpen(true)}
              onOpenChat={chat.openChat}
              theme={theme}
              t={t}
            />
          </div>
        )}
      </main>

      {/* Ad Campaign Manager Modal */}
      <AdCampaignManagerModal
        isOpen={adsEngine.isAdManagerOpen}
        onClose={adsEngine.closeAdManager}
        ads={adsEngine.ads}
        onCreateCampaign={adsEngine.handleCreateAdCampaign}
        theme={theme}
        t={t}
      />

      {/* Modals & Overlays */}
      <LightboxModal
        item={portfolio.selectedLightboxItem}
        onClose={portfolio.closeLightbox}
        onBookThisLook={(look) =>
          portfolio.handleStartBookingWithLookFromLightbox(look, booking.handleStartBookingWithLook)
        }
        onLikeToggle={portfolio.handleToggleLike}
        isLiked={portfolio.selectedLightboxItem ? portfolio.likedIds.has(portfolio.selectedLightboxItem.id) : false}
        onSaveToggle={portfolio.handleToggleSave}
        isSaved={portfolio.selectedLightboxItem ? portfolio.savedIds.has(portfolio.selectedLightboxItem.id) : false}
      />

      <BookingModal
        isOpen={booking.isBookingModalOpen}
        onClose={() => booking.setIsBookingModalOpen(false)}
        artists={artists}
        initialArtist={booking.bookingArtistTarget}
        initialLook={booking.bookingLookTarget}
        onProceedToCheckout={booking.handleProceedToCheckout}
        onTestSMS={(phone, artistName, serviceName, date, time) => {
          reminderService.dispatch24HourReminder({
            id: 'test-preview',
            clientName: 'Client',
            clientPhone: phone,
            clientEmail: '',
            artistId: '',
            artistName,
            artistAvatar: '',
            serviceId: '',
            serviceName,
            price: 150,
            currency: 'USD',
            date,
            timeSlot: time,
            status: 'confirmed',
            remindersEnabled: true,
            pushReminderScheduled: true,
            smsReminderScheduled: true,
            createdAt: new Date().toISOString(),
          });
        }}
        onTestPush={(artistName, serviceName) => {
          reminderService.requestPushPermission();
          reminderService.dispatch2HourReminder({
            id: 'test-push',
            clientName: 'Client',
            clientPhone: '',
            clientEmail: '',
            artistId: '',
            artistName,
            artistAvatar: '',
            serviceId: '',
            serviceName,
            price: 150,
            currency: 'USD',
            date: 'Tomorrow',
            timeSlot: '14:30',
            status: 'confirmed',
            remindersEnabled: true,
            pushReminderScheduled: true,
            smsReminderScheduled: true,
            createdAt: new Date().toISOString(),
          });
        }}
      />

      <CheckoutModal
        isOpen={booking.isCheckoutOpen}
        onClose={() => booking.setIsCheckoutOpen(false)}
        bookingDetails={booking.pendingBookingDetails}
        onPaymentSuccess={booking.handlePaymentSuccess}
      />

      <ChatDrawer
        isOpen={chat.isChatOpen}
        onClose={chat.closeChat}
        messages={chat.chatMessages}
        onSendMessage={chat.handleSendMessage}
        artists={artists}
        userRole={userRole}
        onBookService={(artist, serviceName) => {
          const srv = artist.services.find(s => s.name === serviceName) || artist.services[0];
          booking.handleProceedToCheckout({
            artist,
            service: srv,
            date: '2026-09-25',
            timeSlot: '02:30 PM',
            clientName: 'Genevieve Vance',
            clientPhone: '+1 (555) 749-0182',
            clientEmail: 'genevieve@pariscouture.com',
            customNotes: 'Direct quote locked from studio chat.',
            enablePush: true,
            enableSMS: true,
          });
        }}
      />

      {/* Android Permissions & APK Modal */}
      <AndroidPermissionsModal
        isOpen={isPermissionsModalOpen}
        onClose={() => setIsPermissionsModalOpen(false)}
        t={t}
      />

      {/* Confirmed Appointments & Calendar Sync (.ICS / Google Calendar) Modal */}
      <ClientAppointmentsModal
        isOpen={booking.isAppointmentsModalOpen}
        onClose={() => booking.setIsAppointmentsModalOpen(false)}
        appointments={booking.appointments}
        artists={artists}
        onOpenBooking={() => booking.setIsBookingModalOpen(true)}
        theme={theme}
        onNotification={(msg) => {
          setToasts(prev => [{
            id: `toast-cal-${Date.now()}`,
            type: 'push',
            title: 'Календарь',
            message: msg,
            timestamp: new Date().toLocaleTimeString(),
            phoneOrTarget: 'Календарь',
          }, ...prev]);
        }}
      />

      {/* Luxury Wallpaper & Ornament Selector Modal */}
      <WallpaperModal
        isOpen={isWallpaperModalOpen}
        onClose={() => setIsWallpaperModalOpen(false)}
        currentWallpaper={wallpaper}
        onSelectWallpaper={handleSelectWallpaper}
        theme={theme}
      />

      {/* Real-Time Toast Notifications (SMS, Push, P2P Sync) */}
      <ToastNotification
        notifications={toasts}
        onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))}
      />

      {/* Expressive Haute Couture & Ornament Art Footer */}
      <footer className="relative z-10 border-t border-cyan-500/20 bg-[#07080e]/95 backdrop-blur-md py-8 text-xs text-gray-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/pwa-192x192.png" alt="Nailix" className="w-5 h-5 rounded-md object-cover ring-1 ring-cyan-400/40" />
            <span className="font-display font-bold text-white tracking-wider text-sm">Nailix</span>
            <span aria-hidden="true">·</span>
            <span className="text-cyan-300 font-mono text-[11px]">{t.tagline}</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono text-[11px] text-gray-400">
            <span className="text-amber-300">Public Unencrypted Art Stream</span>
            <span aria-hidden="true">·</span>
            <span className="text-cyan-300">E2E Cryptographic Chat</span>
            <span aria-hidden="true">·</span>
            <span className="text-fuchsia-300">Friend Circle Jury DAO [SIM]</span>
            <span aria-hidden="true">·</span>
            <button 
              onClick={() => setIsPermissionsModalOpen(true)}
              className="text-white hover:text-cyan-300 underline cursor-pointer"
            >
              {t.androidBuild}
            </button>
          </div>
        </div>
      </footer>

      {/* Android Floating Action Button (FAB) Speed Dial */}
      <AndroidFAB
        onQuickBook={() => booking.setIsBookingModalOpen(true)}
        onOpenAppointments={() => booking.setIsAppointmentsModalOpen(true)}
        onOpenARCamera={() => setActiveTab('android')}
        onOpenChat={chat.openChat}
        onOpenAndroidSuite={() => setActiveTab('android')}
        theme={theme}
      />

      {/* Android Native Material 3 Bottom Navigation Bar */}
      <AndroidBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadChatCount={chat.unreadChatCount}
        onOpenChat={chat.openChat}
        theme={theme}
        t={t}
      />

    </div>
  );
}
