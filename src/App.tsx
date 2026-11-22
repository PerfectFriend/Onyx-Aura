import { useState, useCallback, useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
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
import { PasskeyAuthModal } from './components/PasskeyAuthModal';
import { WallpaperModal, OrnamentDivider } from './components/OrnamentalFlourish';
import { ErrorBoundary } from './components/ErrorBoundary';

import {
  DEMO_CLIENT_PROFILE,
  getRelativeDateISO,
} from './data/initialData';

import { ClientAnchorPoint } from './types';
import { createId } from './domain/ids';
import { HydratedSalonData } from './domain/storage';
import { formatAppMessage } from './i18n/messages';

import { blockchainLedger } from './simulation/cryptoLedger';
import { reminderService } from './services/reminderService';
import { useAppChrome, UseAppChromeReturn } from './hooks/useAppChrome';
import { useAppShell } from './hooks/useAppShell';
import { useBookingFlow } from './hooks/useBookingFlow';
import { useChatConcierge } from './hooks/useChatConcierge';
import { useCryptoSwarm } from './hooks/useCryptoSwarm';
import { usePortfolioGallery } from './hooks/usePortfolioGallery';
import { useSponsoredAds } from './hooks/useSponsoredAds';
import { useSalonBootstrap } from './hooks/useSalonBootstrap';
import { useIdentitySession } from './hooks/useIdentitySession';

type SalonBootstrapApi = ReturnType<typeof useSalonBootstrap>;

interface SalonAppProps {
  initialData: HydratedSalonData;
  bootstrap: SalonBootstrapApi;
  chrome: UseAppChromeReturn;
  onReportError: (msg: string) => void;
}

function SalonApp({ initialData, bootstrap, chrome, onReportError }: SalonAppProps) {
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
  } = chrome;

  // Application Shell (Tabs, Role, PWA Deep Links, Toast Queue, Reminders)
  const shell = useAppShell({
    initialRole: initialData.identitySession.authenticated
      ? initialData.identitySession.role
      : 'client',
  });

  // CryptoCloud Swarm & P2P State [SIM]
  const swarm = useCryptoSwarm();

  // Stage 3 WebAuthn / Passkey Identity & Public-Only Session Registry (Load-then-Mount)
  const identity = useIdentitySession({
    language: currentLanguage,
    initialPasskeys: initialData.passkeys,
    initialSession: initialData.identitySession,
    externalRevision: bootstrap.externalRevision,
    onRoleSynced: shell.setUserRole,
    onPersistPasskeys: bootstrap.persistPasskeys,
    onPersistSession: bootstrap.persistIdentitySession,
    onNotify: (title, message) => {
      shell.pushToast({
        id: createId('toast-id'),
        type: 'push',
        title,
        message,
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Passkey Security',
      });
    },
  });

  // Booking, Checkout & Appointments Flow (Load-then-Mount)
  const booking = useBookingFlow({
    artists: bootstrap.artists,
    language: currentLanguage,
    initialBookingOpen: shell.deepLinkAction === 'book',
    initialAppointments: initialData.appointments,
    externalRevision: bootstrap.externalRevision,
    onNotifyToast: shell.pushToast,
    onBroadcastToSwarm: swarm.broadcastBlock,
    onPersistAppointments: bootstrap.persistAppointments,
  });

  // Q-04 & V-02: Reconcile Hosted Checkout return strictly via server GET /api/payments/intents/:id
  const reconciledReturnRef = useRef<string | null>(null);
  const { reconcileHostedCheckoutReturn } = booking;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const intentId = params.get('intent_id');
    if (!intentId || reconciledReturnRef.current === intentId) return;
    reconciledReturnRef.current = intentId;

    void reconcileHostedCheckoutReturn(intentId).finally(() => {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('checkout_status');
      cleanUrl.searchParams.delete('intent_id');
      cleanUrl.searchParams.delete('booking_ref');
      window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    });
  }, [reconcileHostedCheckoutReturn]);

  // Chat & Concierge Drawer (Load-then-Mount)
  const chat = useChatConcierge({
    userRole: shell.userRole,
    artists: bootstrap.artists,
    initialMessages: initialData.chats,
    externalRevision: bootstrap.externalRevision,
    onBroadcastToSwarm: swarm.broadcastBlock,
    onPersistChats: bootstrap.persistChats,
  });

  // Portfolio Stream, Likes/Saves, Lightbox & Instagram Import (Load-then-Mount)
  const portfolio = usePortfolioGallery({
    initialItems: initialData.portfolio,
    initialLikedIds: initialData.likedIds,
    initialSavedIds: initialData.savedIds,
    externalRevision: bootstrap.externalRevision,
    onSyncPostToSwarm: (newLook, igPostId) => {
      swarm.broadcastBlock('INSTAGRAM_PORTFOLIO_SYNC', {
        lookId: newLook.id,
        igPostId,
        artistId: newLook.artistId,
      });
    },
    onNotify: (title, message) => {
      shell.pushToast({
        id: createId('toast-ig'),
        type: 'push',
        title,
        message,
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Client Device',
      });
    },
    onPersistPortfolio: bootstrap.persistPortfolio,
    onPersistLikes: bootstrap.persistLikesAndPortfolio,
    onPersistSaves: bootstrap.persistSaves,
  });

  // Sponsored Ads Engine & Modal (Load-then-Mount)
  const adsEngine = useSponsoredAds({
    initialAds: initialData.ads,
    externalRevision: bootstrap.externalRevision,
    onBroadcastToSwarm: swarm.broadcastBlock,
    onPersistAds: bootstrap.persistAds,
  });

  // Add review to [SIM] ledger & persist reviews + recalculated artist rating atomically
  const handleAddReview = async (
    reviewData: Parameters<typeof blockchainLedger.createVerifiedReviewBlock>[0]
  ) => {
    try {
      const newReview = await blockchainLedger.createVerifiedReviewBlock(reviewData);
      await bootstrap.saveReviewAndUpdateArtistRating(newReview);

      swarm.broadcastBlock('NEW_BLOCKCHAIN_REVIEW', {
        reviewId: newReview.id,
        artistId: newReview.artistId,
        blockHash: newReview.blockHash,
      });
    } catch (err) {
      onReportError(
        err instanceof Error
          ? err.message
          : formatAppMessage('app.review_save_error', {}, currentLanguage)
      );
    }
  };

  // Client Anchor Point Update Handler (persisted locally in IndexedDB)
  const handleUpdateAnchorPoint = (updatedPoint: ClientAnchorPoint) => {
    void bootstrap.updateAnchorPoint(updatedPoint).catch(err => {
      onReportError(
        err instanceof Error
          ? err.message
          : formatAppMessage('app.anchor_save_error', {}, currentLanguage)
      );
    });
  };

  // Master Salon Address Registry Handler (persisted locally in IndexedDB)
  const handleUpdateMasterSalon = (
    artistId: string,
    salonName: string,
    salonAddress: string,
    lat: number,
    lng: number
  ) => {
    void bootstrap.updateMasterSalon(artistId, salonName, salonAddress, lat, lng).catch(err => {
      onReportError(
        err instanceof Error
          ? err.message
          : formatAppMessage('app.salon_save_error', {}, currentLanguage)
      );
    });
  };

  // Reset Local-First IndexedDB demo database back to clean seed fixtures
  const handleResetDemoData = (options: { preserveIdentity: boolean }) => {
    void bootstrap
      .resetAllToSeed(options)
      .then(() => {
        shell.pushToast({
          id: createId('toast-reset'),
          type: 'push',
          title: formatAppMessage('app.reset_toast_title', {}, currentLanguage),
          message: formatAppMessage(
            options.preserveIdentity ? 'app.reset_keep_identity' : 'app.reset_clear_all',
            {},
            currentLanguage
          ),
          timestamp: new Date().toLocaleTimeString(),
          phoneOrTarget: 'IndexedDB',
        });
      })
      .catch(err => {
        onReportError(
          err instanceof Error
            ? err.message
            : formatAppMessage('app.reset_error', {}, currentLanguage)
        );
      });
  };

  const hasHealthIssue = bootstrap.storageHealth !== 'ok' || bootstrap.storageWarnings.length > 0;

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-300 relative ${wallpaperClass} ${
        theme === 'dark' ? 'text-[#edeef2]' : 'text-[#1a1e29]'
      }`}
    >
      {/* Top 3-Zone Navigation */}
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
        identitySession={identity.session}
        onOpenPasskeyAuth={identity.openAuthModal}
        t={t}
      />

      {/* Quiet Degraded / Recovery / Validation Notice Banner (L-01, L-06, N-01, N-03) */}
      {hasHealthIssue && (
        <div
          role="status"
          className="relative z-20 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-3"
        >
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/50 backdrop-blur-md px-4 py-2.5 text-xs text-amber-100 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">
                  {bootstrap.storageHealth === 'memory_only'
                    ? 'Хранилище в режиме памяти (без записи на диск)'
                    : bootstrap.storageHealth === 'degraded'
                    ? 'Локальное хранилище работает в режиме повышенной осторожности'
                    : 'Восстановление локальных данных после проверки схемы'}
                </div>
                {bootstrap.storageWarnings.slice(0, 3).map((warn, idx) => (
                  <p key={idx} className="text-[11px] text-amber-200/85">
                    {warn}
                  </p>
                ))}
                {bootstrap.quarantineKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      void bootstrap
                        .exportQuarantinedJson()
                        .then(dump => {
                          const blob = new Blob([JSON.stringify(dump, null, 2)], {
                            type: 'application/json',
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `nailix-quarantine-${Date.now()}.json`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        })
                        .catch(() => undefined);
                    }}
                    className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded border border-amber-400/50 bg-amber-500/15 hover:bg-amber-500/25 text-[11px] font-mono text-amber-200 cursor-pointer"
                  >
                    Скачать архив карантина (.JSON)
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={bootstrap.dismissWarnings}
              className="p-1 rounded-md text-amber-300 hover:bg-amber-400/20 cursor-pointer shrink-0"
              aria-label="Скрыть уведомление хранилища"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main View Router */}
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

        {shell.activeTab === 'map' && (
          <div className="space-y-6">
            <ErrorBoundary level="section" sectionName="Карта локаций" theme={theme}>
              <ClientLocationMap
                artists={bootstrap.artists}
                anchorPoints={bootstrap.anchorPoints}
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

        {shell.activeTab === 'moderation' && (
          <ErrorBoundary level="section" sectionName="Круг доверия DAO [SIM]" theme={theme}>
            <FriendModerationSection t={t} />
          </ErrorBoundary>
        )}

        {shell.activeTab === 'artists' && (
          <div className="space-y-8">
            <ErrorBoundary level="section" sectionName="Каталог мастеров" theme={theme}>
              <ArtistsView
                artists={bootstrap.artists}
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
              reviews={bootstrap.reviews}
              artists={bootstrap.artists}
              onAddReview={(rev) => {
                void handleAddReview(rev);
              }}
            />
          </ErrorBoundary>
        )}

        {shell.activeTab === 'instagram' && (
          <ErrorBoundary level="section" sectionName="Синхронизация Instagram" theme={theme}>
            <InstagramSyncSection
              artists={bootstrap.artists}
              onImportPost={portfolio.handleImportInstagramPost}
            />
          </ErrorBoundary>
        )}

        {shell.activeTab === 'cryptocloud' && (
          <ErrorBoundary level="section" sectionName="CryptoCloud Swarm [SIM]" theme={theme}>
            <CryptoCloudPanel
              swarmState={swarm.swarmState}
              peers={swarm.peers}
              onTriggerBackup={() => {
                void swarm
                  .handleExportCryptoCloudBackup({
                    appointments: booking.appointments,
                    reviews: bootstrap.reviews,
                    portfolio: portfolio.items,
                    chats: chat.chatMessages,
                  })
                  .catch(err => {
                    onReportError(err instanceof Error ? err.message : 'Ошибка экспорта снимка.');
                  });
              }}
              onSimulatePulse={swarm.handleSimulatePeerPulse}
              isBackingUp={swarm.isBackingUp}
              backupSuccessMessage={swarm.backupSuccessMessage}
              storageBackend={bootstrap.storageBackend}
              pendingOutboxCount={bootstrap.pendingOutboxCount}
              onFlushOutboxDemo={() => {
                void bootstrap.flushOutboxDemo().catch(err => {
                  onReportError(err instanceof Error ? err.message : 'Ошибка обновления Outbox.');
                });
              }}
            />
          </ErrorBoundary>
        )}

        {shell.activeTab === 'analytics' && (
          <ErrorBoundary level="section" sectionName="Аналитика студии" theme={theme}>
            <AdminAnalyticsDashboard
              appointments={booking.appointments}
              artists={bootstrap.artists}
              onReleaseEscrow={booking.handleReleaseEscrow}
              onTriggerReminder={booking.handleTriggerAppointmentReminder}
            />
          </ErrorBoundary>
        )}

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

      <AdCampaignManagerModal
        isOpen={adsEngine.isAdManagerOpen}
        onClose={adsEngine.closeAdManager}
        ads={adsEngine.ads}
        onCreateCampaign={adsEngine.handleCreateAdCampaign}
        theme={theme}
        t={t}
      />

      <LightboxModal
        item={portfolio.selectedLightboxItem}
        onClose={portfolio.closeLightbox}
        onBookThisLook={(look) =>
          portfolio.handleStartBookingWithLookFromLightbox(look, booking.handleStartBookingWithLook)
        }
        onLikeToggle={portfolio.handleToggleLike}
        isLiked={
          portfolio.selectedLightboxItem
            ? portfolio.likedIds.has(portfolio.selectedLightboxItem.id)
            : false
        }
        onSaveToggle={portfolio.handleToggleSave}
        isSaved={
          portfolio.selectedLightboxItem
            ? portfolio.savedIds.has(portfolio.selectedLightboxItem.id)
            : false
        }
      />

      <BookingModal
        isOpen={booking.isBookingModalOpen}
        onClose={() => booking.setIsBookingModalOpen(false)}
        artists={bootstrap.artists}
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
          void reminderService.requestPushPermission();
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
        onHostedPendingCreated={booking.handleHostedPendingCreated}
      />

      <ErrorBoundary level="section" sectionName="Чат-консьерж [SIM]" theme={theme}>
        <ChatDrawer
          isOpen={chat.isChatOpen}
          onClose={chat.closeChat}
          messages={chat.chatMessages}
          onSendMessage={chat.handleSendMessage}
          artists={bootstrap.artists}
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

      <AndroidPermissionsModal
        isOpen={shell.isPermissionsModalOpen}
        onClose={() => shell.setIsPermissionsModalOpen(false)}
        t={t}
      />

      <ClientAppointmentsModal
        isOpen={booking.isAppointmentsModalOpen}
        onClose={() => booking.setIsAppointmentsModalOpen(false)}
        appointments={booking.appointments}
        artists={bootstrap.artists}
        onOpenBooking={() => booking.setIsBookingModalOpen(true)}
        onResetLocalData={handleResetDemoData}
        storageBackend={bootstrap.storageBackend}
        storageHealth={bootstrap.storageHealth}
        pendingOutboxCount={bootstrap.pendingOutboxCount}
        theme={theme}
        onNotification={(msg) => {
          const calLabel = formatAppMessage('app.calendar_toast_title', {}, currentLanguage);
          shell.pushToast({
            id: createId('toast-cal'),
            type: 'push',
            title: calLabel,
            message: msg,
            timestamp: new Date().toLocaleTimeString(),
            phoneOrTarget: calLabel,
          });
        }}
      />

      <PasskeyAuthModal
        isOpen={identity.isAuthModalOpen}
        onClose={identity.closeAuthModal}
        session={identity.session}
        passkeys={identity.passkeys}
        capabilities={identity.capabilities}
        isBusy={identity.isBusy}
        authError={identity.authError}
        currentRole={shell.userRole}
        theme={theme}
        onRegisterPasskey={identity.handleRegisterPasskey}
        onSignInWithPasskey={identity.handleSignInWithPasskey}
        onCreateDemoFallback={identity.handleCreateDemoFallbackPasskey}
        onSignInDemoFallback={identity.handleSignInDemoPasskey}
        onSignOut={identity.handleSignOut}
        onRevokePasskey={identity.handleRevokePasskey}
      />

      <WallpaperModal
        isOpen={isWallpaperModalOpen}
        onClose={() => setIsWallpaperModalOpen(false)}
        currentWallpaper={wallpaper}
        onSelectWallpaper={handleSelectWallpaper}
        theme={theme}
      />

      <ToastNotification
        notifications={shell.toasts}
        onDismiss={shell.dismissToast}
      />

      <footer className="relative z-10 border-t border-cyan-500/20 bg-[#07080e]/95 backdrop-blur-md py-8 text-xs text-gray-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/pwa-192x192.png"
              alt="Nailix"
              className="w-5 h-5 rounded-md object-cover ring-1 ring-cyan-400/40"
            />
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

      <AndroidFAB
        onQuickBook={() => booking.setIsBookingModalOpen(true)}
        onOpenAppointments={() => booking.setIsAppointmentsModalOpen(true)}
        onOpenARCamera={() => shell.setActiveTab('android')}
        onOpenChat={chat.openChat}
        onOpenAndroidSuite={() => shell.setActiveTab('android')}
        theme={theme}
      />

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

export default function App() {
  const chrome = useAppChrome();
  const [storageBannerError, setStorageBannerError] = useState<string | null>(null);

  const handleStorageError = useCallback((message: string) => {
    setStorageBannerError(message);
  }, []);

  const bootstrap = useSalonBootstrap({
    onStorageError: handleStorageError,
  });

  if (!bootstrap.isHydrated || !bootstrap.bootstrapData) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center p-6 font-sans transition-colors duration-300 ${chrome.wallpaperClass} ${
          chrome.theme === 'dark' ? 'text-[#edeef2]' : 'text-[#1a1e29]'
        }`}
      >
        <div className="max-w-md w-full p-6 rounded-2xl border border-cyan-500/30 bg-[#0b0e18]/90 backdrop-blur-md text-center space-y-3 shadow-2xl">
          <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto" />
          <h1 className="font-display text-lg font-bold text-white">Nailix · Onyx Aura</h1>
          <p className="text-xs font-mono text-cyan-200">Загружаем локальные данные салона…</p>
          {storageBannerError && (
            <p className="text-xs text-red-300 bg-red-950/50 border border-red-500/40 rounded-lg p-2">
              {storageBannerError}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {storageBannerError && (
        <div
          role="alert"
          className="fixed bottom-20 right-4 z-50 max-w-sm rounded-xl border border-red-500/50 bg-red-950/95 px-4 py-3 text-xs text-red-100 shadow-2xl flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <div className="font-semibold">Предупреждение локального хранилища</div>
            <p className="text-[11px] text-red-200/90">{storageBannerError}</p>
          </div>
          <button
            type="button"
            onClick={() => setStorageBannerError(null)}
            className="text-red-200 hover:text-white cursor-pointer"
            aria-label="Закрыть предупреждение"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <SalonApp
        key={bootstrap.resetEpoch}
        initialData={bootstrap.bootstrapData}
        bootstrap={bootstrap}
        chrome={chrome}
        onReportError={handleStorageError}
      />
    </>
  );
}
