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
import { ErrorBoundary } from './components/ErrorBoundary';

import {
  DEMO_CLIENT_PROFILE,
  getRelativeDateISO,
} from './data/initialData';

import { ClientAnchorPoint } from './types';

import { blockchainLedger } from './simulation/cryptoLedger';
import { reminderService } from './services/reminderService';
import { useAppChrome } from './hooks/useAppChrome';
import { useAppShell } from './hooks/useAppShell';
import { useBookingFlow } from './hooks/useBookingFlow';
import { useChatConcierge } from './hooks/useChatConcierge';
import { useCryptoSwarm } from './hooks/useCryptoSwarm';
import { usePortfolioGallery } from './hooks/usePortfolioGallery';
import { useSponsoredAds } from './hooks/useSponsoredAds';
import { useLocalFirstHydration, useHydrationCommit } from './hooks/useLocalFirstHydration';

/**
 * Computes incremental weighted average rating without depending on stale closures (K-09).
 */
export function computeUpdatedArtistRating(
  currentRating: number,
  totalReviews: number,
  newRating: number
): number {
  const safeCount = Math.max(0, totalReviews);
  const weighted = (currentRating * safeCount + newRating) / (safeCount + 1);
  return Number(weighted.toFixed(2));
}

export default function App() {
  // Global UI Chrome (Theme, Language/Locale, Wallpaper) - Sprint 1.1 / 1.4
  const {
    currentLanguage,
    setCurrentLanguage,
    t,
    theme,
    handleToggleTheme,
    wallpaper,
    wallpaperClass,
    isWallpaperModalOpen,
    setIsWallpaperModalOpen,
    handleSelectWallpaper,
  } = useAppChrome();

  // Application Shell (Tabs, Role, PWA Deep Links, Toast Queue, Reminders) - Sprint 1.4
  const shell = useAppShell();

  // CryptoCloud Swarm & P2P State [SIM] - Sprint 1.2
  const swarm = useCryptoSwarm();

  // Stage 2 Local-First IndexedDB Repository + Offline Sync Outbox + Shared Entities
  const localFirst = useLocalFirstHydration();

  // Booking, Checkout & Appointments Flow - Sprint 1.1 + Stage 2 DIP & IndexedDB
  const booking = useBookingFlow({
    artists: localFirst.artists,
    initialBookingOpen: shell.deepLinkAction === 'book',
    onNotifyToast: shell.pushToast,
    onBroadcastToSwarm: swarm.broadcastBlock,
    onPersistAppointments: localFirst.persistAppointments,
  });

  // Chat & Concierge Drawer - Sprint 1.2 + Stage 2 DIP & IndexedDB
  const chat = useChatConcierge({
    userRole: shell.userRole,
    artists: localFirst.artists,
    onBroadcastToSwarm: swarm.broadcastBlock,
    onPersistChats: localFirst.persistChats,
  });

  // Portfolio Stream, Likes/Saves, Lightbox & Instagram Import - Sprint 1.3 + Stage 2 K-14
  const portfolio = usePortfolioGallery({
    onSyncPostToSwarm: (newLook, igPostId) => {
      swarm.broadcastBlock('INSTAGRAM_PORTFOLIO_SYNC', {
        lookId: newLook.id,
        igPostId,
        artistId: newLook.artistId,
      });
    },
    onNotify: (title, message) => {
      shell.pushToast({
        id: `toast-ig-${Date.now()}`,
        type: 'push',
        title,
        message,
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Client Device',
      });
    },
    onPersistPortfolio: localFirst.persistPortfolio,
    onPersistLikes: localFirst.persistLikesAndPortfolio,
    onPersistSaves: localFirst.persistSaves,
  });

  // Sponsored Ads Engine & Modal - Sprint 1.3 + Stage 2 IndexedDB
  const adsEngine = useSponsoredAds({
    onBroadcastToSwarm: swarm.broadcastBlock,
    onPersistAds: localFirst.persistAds,
  });

  // Synchronize persisted IndexedDB collections (or reset-to-seed) into domain hooks
  useHydrationCommit(localFirst.hydrationEvent, (data, dirty, force) => {
    if (force || !dirty.has('appointments')) {
      booking.setAppointments(data.appointments);
    }
    if (force || !dirty.has('chats')) {
      chat.setChatMessages(data.chats);
    }
    if (force || !dirty.has('portfolio')) {
      portfolio.setItems(data.portfolio);
    }
    if (force || !dirty.has('likes')) {
      portfolio.setLikedIds(new Set(data.likedIds));
    }
    if (force || !dirty.has('saves')) {
      portfolio.setSavedIds(new Set(data.savedIds));
    }
    if (force || !dirty.has('ads')) {
      adsEngine.setAds(data.ads);
    }
  });

  // Add review to [SIM] ledger & persist reviews + recalculated artist rating locally
  const handleAddReview = async (reviewData: Parameters<typeof blockchainLedger.createVerifiedReviewBlock>[0]) => {
    const newReview = await blockchainLedger.createVerifiedReviewBlock(reviewData);
    await localFirst.saveReviewAndUpdateArtistRating(newReview, computeUpdatedArtistRating);

    // [SIM] Broadcast review block to swarm
    swarm.broadcastBlock('NEW_BLOCKCHAIN_REVIEW', {
      reviewId: newReview.id,
      artistId: newReview.artistId,
      blockHash: newReview.blockHash,
    });
  };

  // Client Anchor Point Update Handler (persisted locally in IndexedDB)
  const handleUpdateAnchorPoint = (updatedPoint: ClientAnchorPoint) => {
    void localFirst.updateAnchorPoint(updatedPoint);
  };

  // Master Salon Address Registry Handler (persisted locally in IndexedDB)
  const handleUpdateMasterSalon = (artistId: string, salonName: string, salonAddress: string, lat: number, lng: number) => {
    void localFirst.updateMasterSalon(artistId, salonName, salonAddress, lat, lng);
  };

  // Reset Local-First IndexedDB demo database back to clean seed fixtures
  const handleResetDemoData = () => {
    void localFirst.resetAllToSeed().then(() => {
      shell.pushToast({
        id: `toast-reset-${Date.now()}`,
        type: 'push',
        title: 'Локальная база сброшена',
        message: 'Демо-данные IndexedDB (записи, лайки, отзывы, чат, локации) восстановлены до исходных значений.',
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'IndexedDB',
      });
    });
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 relative ${wallpaperClass} ${
      theme === 'dark' ? 'text-[#edeef2]' : 'text-[#1a1e29]'
    }`}>
      
      {/* Top 3-Zone Navigation with Nailix Rebrand, Theme Toggle, Map & 10 Languages */}
      <Navbar
        activeTab={shell.activeTab}
        setActiveTab={shell.setActiveTab}
        userRole={shell.userRole}
        setUserRole={shell.setUserRole}
        onOpenBooking={() => {
          booking.setBookingArtistTarget(null);
          booking.setBookingLookTarget(null);
          booking.setIsBookingModalOpen(true);
        }}
        onOpenAppointments={() => booking.setIsAppointmentsModalOpen(true)}
        appointmentsCount={booking.appointments.length}
        onOpenChat={chat.openChat}
        onOpenPermissions={() => shell.setIsPermissionsModalOpen(true)}
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
        {shell.activeTab === 'explore' && (
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
              onOpenLedger={() => shell.setActiveTab('ledger')}
              onOpenPermissions={() => shell.setIsPermissionsModalOpen(true)}
              theme={theme}
              t={t}
            />

            <OrnamentDivider />

            {/* Targeted In-App Sponsored Ads (Salon Deals for Clients, Tools for Masters) */}
            <SponsoredAdsBanner
              ads={adsEngine.ads}
              userRole={shell.userRole}
              onOpenAdManager={adsEngine.openAdManager}
              theme={theme}
              t={t}
            />

            <OrnamentDivider />

            <div id="portfolio-section">
              <ErrorBoundary level="section" sectionName="Галерея портфолио" theme={theme}>
                <PortfolioGallery
                  items={portfolio.items}
                  onSelectItem={portfolio.openLightbox}
                  onBookItem={booking.handleStartBookingWithLook}
                  likedIds={portfolio.likedIds}
                  onToggleLike={portfolio.handleToggleLike}
                  savedIds={portfolio.savedIds}
                  onToggleSave={portfolio.handleToggleSave}
                  onFlagToJury={() => shell.setActiveTab('moderation')}
                  theme={theme}
                  t={t}
                />
              </ErrorBoundary>
            </div>
          </>
        )}

        {/* Hyper-Local Map & Distance Proximity View */}
        {shell.activeTab === 'map' && (
          <div className="space-y-6">
            <ErrorBoundary level="section" sectionName="Карта локаций" theme={theme}>
              <ClientLocationMap
                artists={localFirst.artists}
                anchorPoints={localFirst.anchorPoints}
                onUpdateAnchorPoint={handleUpdateAnchorPoint}
                onSelectArtistToBook={booking.handleStartBookingWithArtist}
                onOpenChatWithArtist={chat.openChat}
                userRole={shell.userRole}
                onUpdateMasterSalon={handleUpdateMasterSalon}
                theme={theme}
                t={t}
              />
            </ErrorBoundary>

            <SponsoredAdsBanner
              ads={adsEngine.ads}
              userRole={shell.userRole}
              onOpenAdManager={adsEngine.openAdManager}
              theme={theme}
              t={t}
            />
          </div>
        )}

        {/* Friend Circle Consensus Moderation DAO View [SIM] */}
        {shell.activeTab === 'moderation' && (
          <ErrorBoundary level="section" sectionName="Круг доверия DAO [SIM]" theme={theme}>
            <FriendModerationSection t={t} />
          </ErrorBoundary>
        )}

        {shell.activeTab === 'artists' && (
          <div className="space-y-8">
            <ErrorBoundary level="section" sectionName="Каталог мастеров" theme={theme}>
              <ArtistsView
                artists={localFirst.artists}
                onSelectArtistToBook={booking.handleStartBookingWithArtist}
                onOpenChatWithArtist={chat.openChat}
              />
            </ErrorBoundary>

            <SponsoredAdsBanner
              ads={adsEngine.ads}
              userRole={shell.userRole}
              onOpenAdManager={adsEngine.openAdManager}
              theme={theme}
              t={t}
            />
          </div>
        )}

        {shell.activeTab === 'ledger' && (
          <ErrorBoundary level="section" sectionName="Реестр отзывов [SIM]" theme={theme}>
            <ReputationLedger
              reviews={localFirst.reviews}
              artists={localFirst.artists}
              onAddReview={handleAddReview}
            />
          </ErrorBoundary>
        )}

        {shell.activeTab === 'instagram' && (
          <ErrorBoundary level="section" sectionName="Синхронизация Instagram" theme={theme}>
            <InstagramSyncSection
              artists={localFirst.artists}
              onImportPost={portfolio.handleImportInstagramPost}
            />
          </ErrorBoundary>
        )}

        {shell.activeTab === 'cryptocloud' && (
          <ErrorBoundary level="section" sectionName="CryptoCloud Swarm [SIM]" theme={theme}>
            <CryptoCloudPanel
              swarmState={swarm.swarmState}
              peers={swarm.peers}
              onTriggerBackup={() =>
                swarm.handleExportCryptoCloudBackup({
                  appointments: booking.appointments,
                  reviews: localFirst.reviews,
                  portfolio: portfolio.items,
                  chats: chat.chatMessages,
                })
              }
              onSimulatePulse={swarm.handleSimulatePeerPulse}
              isBackingUp={swarm.isBackingUp}
              backupSuccessMessage={swarm.backupSuccessMessage}
            />
          </ErrorBoundary>
        )}

        {shell.activeTab === 'analytics' && (
          <ErrorBoundary level="section" sectionName="Аналитика студии" theme={theme}>
            <AdminAnalyticsDashboard
              appointments={booking.appointments}
              artists={localFirst.artists}
              onReleaseEscrow={booking.handleReleaseEscrow}
              onTriggerReminder={booking.handleTriggerAppointmentReminder}
            />
          </ErrorBoundary>
        )}

        {/* Android Native Suite & AR Fitting View */}
        {shell.activeTab === 'android' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            <ErrorBoundary level="section" sectionName="AR-примерка и PWA Suite [SIM]" theme={theme}>
              <AndroidExperienceView
                onOpenBookingModal={() => booking.setIsBookingModalOpen(true)}
                theme={theme}
                t={t}
              />
            </ErrorBoundary>
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
        artists={localFirst.artists}
        initialArtist={booking.bookingArtistTarget}
        initialLook={booking.bookingLookTarget}
        onProceedToCheckout={booking.handleProceedToCheckout}
        onTestSMS={(phone, artistName, serviceName, date, time) => {
          reminderService.dispatch24HourReminder({
            id: 'test-preview',
            clientName: DEMO_CLIENT_PROFILE.name,
            clientPhone: phone,
            clientEmail: DEMO_CLIENT_PROFILE.email,
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
            clientName: DEMO_CLIENT_PROFILE.name,
            clientPhone: DEMO_CLIENT_PROFILE.phone,
            clientEmail: DEMO_CLIENT_PROFILE.email,
            artistId: '',
            artistName,
            artistAvatar: '',
            serviceId: '',
            serviceName,
            price: 150,
            currency: 'USD',
            date: getRelativeDateISO(1),
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

      <ErrorBoundary level="section" sectionName="Чат-консьерж [SIM]" theme={theme}>
        <ChatDrawer
          isOpen={chat.isChatOpen}
          onClose={chat.closeChat}
          messages={chat.chatMessages}
          onSendMessage={chat.handleSendMessage}
          artists={localFirst.artists}
          userRole={shell.userRole}
          activeThreadId={chat.activeThreadId}
          onSelectThread={chat.setActiveThreadId}
          onBookService={(artist, serviceName) => {
            const srv = artist.services.find(s => s.name === serviceName) || artist.services[0];
            booking.handleProceedToCheckout({
              artist,
              service: srv,
              date: getRelativeDateISO(2),
              timeSlot: '02:30 PM',
              clientName: DEMO_CLIENT_PROFILE.name,
              clientPhone: DEMO_CLIENT_PROFILE.phone,
              clientEmail: DEMO_CLIENT_PROFILE.email,
              customNotes: 'Direct demo quote locked from studio chat.',
              enablePush: true,
              enableSMS: true,
            });
          }}
        />
      </ErrorBoundary>

      {/* Android Permissions & APK Modal */}
      <AndroidPermissionsModal
        isOpen={shell.isPermissionsModalOpen}
        onClose={() => shell.setIsPermissionsModalOpen(false)}
        t={t}
      />

      {/* Confirmed Appointments & Calendar Sync (.ICS / Google Calendar) Modal */}
      <ClientAppointmentsModal
        isOpen={booking.isAppointmentsModalOpen}
        onClose={() => booking.setIsAppointmentsModalOpen(false)}
        appointments={booking.appointments}
        artists={localFirst.artists}
        onOpenBooking={() => booking.setIsBookingModalOpen(true)}
        onResetLocalData={handleResetDemoData}
        theme={theme}
        onNotification={(msg) => {
          shell.pushToast({
            id: `toast-cal-${Date.now()}`,
            type: 'push',
            title: 'Календарь',
            message: msg,
            timestamp: new Date().toLocaleTimeString(),
            phoneOrTarget: 'Календарь',
          });
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
        notifications={shell.toasts}
        onDismiss={shell.dismissToast}
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
            <span className="text-amber-300">Local-First IndexedDB</span>
            <span aria-hidden="true">·</span>
            <span className="text-cyan-300">Studio Concierge Chat [SIM]</span>
            <span aria-hidden="true">·</span>
            <span className="text-fuchsia-300">Friend Circle Jury [SIM]</span>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => shell.setIsPermissionsModalOpen(true)}
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
        onOpenARCamera={() => shell.setActiveTab('android')}
        onOpenChat={chat.openChat}
        onOpenAndroidSuite={() => shell.setActiveTab('android')}
        theme={theme}
      />

      {/* Android Native Material 3 Bottom Navigation Bar */}
      <AndroidBottomNav
        activeTab={shell.activeTab}
        setActiveTab={shell.setActiveTab}
        unreadChatCount={chat.unreadChatCount}
        onOpenChat={chat.openChat}
        theme={theme}
        t={t}
      />

    </div>
  );
}
