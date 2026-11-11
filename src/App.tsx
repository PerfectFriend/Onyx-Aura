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
  INITIAL_PORTFOLIO, 
  INITIAL_REVIEWS, 
  INITIAL_CHATS, 
  INITIAL_PEERS,
  INITIAL_ANCHOR_POINTS
} from './data/initialData';

import { INITIAL_SPONSORED_ADS } from './data/advertisements';

import { 
  Artist, 
  PortfolioItem, 
  Review, 
  ChatMessage, 
  PeerNode, 
  CryptoCloudState, 
  ClientAnchorPoint,
  SponsoredAd,
} from './types';

import { cryptoCloudSwarm } from './simulation/cryptocloud';
import { blockchainLedger } from './simulation/cryptoLedger';
import { reminderService, ReminderNotificationEvent } from './services/reminderService';
import { useAppChrome } from './hooks/useAppChrome';
import { useBookingFlow } from './hooks/useBookingFlow';

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
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(INITIAL_PORTFOLIO);
  const [reviews, setReviews] = useState<Review[]>(INITIAL_REVIEWS);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHATS);

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

  // Sponsored Ads Engine
  const [ads, setAds] = useState<SponsoredAd[]>(INITIAL_SPONSORED_ADS);
  const [isAdManagerOpen, setIsAdManagerOpen] = useState<boolean>(false);
  
  // Likes & Saves state
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set(['port-gaudi', 'port-1']));
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(['port-gaudi', 'port-2']));

  // Lightbox Modal
  const [selectedLightboxItem, setSelectedLightboxItem] = useState<PortfolioItem | null>(null);

  // Android Permissions & Build Modal
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState<boolean>(false);

  // Chat Drawer
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(1);

  // CryptoCloud Swarm & P2P [SIM]
  const [swarmState, setSwarmState] = useState<CryptoCloudState>(cryptoCloudSwarm.getState());
  const [peers, setPeers] = useState<PeerNode[]>(INITIAL_PEERS);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null);

  // Subscribe to Reminder Service & Crypto Swarm on mount
  useEffect(() => {
    const unsubReminders = reminderService.subscribe((evt) => {
      setToasts(prev => [evt, ...prev.slice(0, 4)]);
      // Auto-dismiss after 6 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== evt.id));
      }, 6000);
    });

    const unsubSwarm = cryptoCloudSwarm.subscribe((event) => {
      const state = cryptoCloudSwarm.getState();
      setSwarmState(state);
      if (event.type === 'PEER_PULSE') {
        setPeers(state.connectedPeers);
      }
    });

    // Request notification permission smoothly on first user interaction
    const requestNotice = () => {
      reminderService.requestPushPermission();
      window.removeEventListener('click', requestNotice);
    };
    window.addEventListener('click', requestNotice);

    return () => {
      unsubReminders();
      unsubSwarm();
      window.removeEventListener('click', requestNotice);
    };
  }, []);

  // Handlers
  const handleToggleLike = (id: string) => {
    setLikedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    setPortfolio(prev => prev.map(item => {
      if (item.id === id) {
        const delta = likedIds.has(id) ? -1 : 1;
        return { ...item, likes: item.likes + delta };
      }
      return item;
    }));
  };

  const handleToggleSave = (id: string) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Launch booking from look with closing lightbox
  const handleStartBookingWithLookFromLightbox = (look: PortfolioItem) => {
    setSelectedLightboxItem(null);
    booking.handleStartBookingWithLook(look);
  };

  // Chat message sending
  const handleSendMessage = (text: string, threadId: string, quoteAttachment?: ChatMessage['quoteAttachment']) => {
    const activeArt = artists.find(a => a.id === threadId) || artists[0];
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      threadId,
      senderId: userRole === 'client' ? 'client-me' : threadId,
      senderName: userRole === 'client' ? 'Genevieve Vance' : activeArt.name,
      senderRole: userRole,
      recipientId: activeArt.id,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      quoteAttachment,
    };

    setChatMessages(prev => [...prev, newMsg]);

    // [SIM] Broadcast encrypted chat chunk to CryptoCloud peer buffer
    cryptoCloudSwarm.broadcastBlock('CHAT_MESSAGE_BUFFERED', {
      threadId,
      msgId: newMsg.id,
    });
  };

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
    cryptoCloudSwarm.broadcastBlock('NEW_BLOCKCHAIN_REVIEW', {
      reviewId: newReview.id,
      artistId: newReview.artistId,
      blockHash: newReview.blockHash,
    });
  };

  // Instagram Sync Handler
  const handleImportInstagramPost = (post: {
    title: string;
    artistId: string;
    artistName: string;
    artistHandle: string;
    artistAvatar: string;
    image: string;
    category: any;
    priceUSD: number;
    durationMinutes: number;
  }) => {
    const newLook: PortfolioItem = {
      id: `port-ig-${Date.now()}`,
      title: post.title,
      artistId: post.artistId,
      artistName: post.artistName,
      artistHandle: post.artistHandle,
      artistAvatar: post.artistAvatar,
      category: post.category,
      image: post.image,
      likes: Math.floor(Math.random() * 80) + 120,
      saves: Math.floor(Math.random() * 40) + 45,
      date: 'Just now',
      description: `Directly synced from @${post.artistHandle} Instagram lookbook into the open public stream.`,
      materials: ['Gel Polish', 'Chrome Pigment'],
      durationMinutes: post.durationMinutes,
      priceUSD: post.priceUSD,
      igPostId: `ig_${Date.now()}`,
      onChainHash: `0xIG_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    };

    setPortfolio(prev => [newLook, ...prev]);

    // [SIM] Broadcast synced look to swarm
    cryptoCloudSwarm.broadcastBlock('INSTAGRAM_PORTFOLIO_SYNC', {
      lookId: newLook.id,
      igPostId: newLook.igPostId,
      artistId: newLook.artistId,
    });

    setToasts(prev => [
      {
        id: `toast-ig-${Date.now()}`,
        type: 'push',
        title: 'Instagram Art Synced',
        message: `Imported "${newLook.title}" directly to Nailix P2P Public Gallery.`,
        timestamp: new Date().toLocaleTimeString(),
        phoneOrTarget: 'Client Device',
      },
      ...prev,
    ]);
  };

  // Self-Hosted CryptoCloud Snapshot Backup Export [SIM]
  const handleExportCryptoCloudBackup = async () => {
    setIsBackingUp(true);
    setBackupSuccessMessage(null);
    try {
      const { filename, blob, checksum } = await cryptoCloudSwarm.exportCryptographicBackup({
        appointments: booking.appointments,
        reviews,
        portfolio,
        chats: chatMessages,
      });

      // Trigger client file download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupSuccessMessage(`Successfully saved ${filename}. Checksum: ${checksum.slice(0, 16)}...`);
      setSwarmState(cryptoCloudSwarm.getState());
    } finally {
      setIsBackingUp(false);
    }
  };

  // Simulate P2P Swarm Network Pulse [SIM]
  const handleSimulatePeerPulse = () => {
    const updatedPeers = cryptoCloudSwarm.simulatePeerPing();
    setPeers(updatedPeers);
    setSwarmState(cryptoCloudSwarm.getState());
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

  // Create new Sponsored Ad Campaign
  const handleCreateAdCampaign = (newAd: SponsoredAd) => {
    setAds(prev => [newAd, ...prev]);
    cryptoCloudSwarm.broadcastBlock('NEW_SPONSORED_CAMPAIGN', {
      adId: newAd.id,
      title: newAd.title,
      brandName: newAd.brandName,
      target: newAd.targetAudience,
    });
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
        onOpenChat={() => setIsChatOpen(true)}
        onOpenPermissions={() => setIsPermissionsModalOpen(true)}
        unreadChatCount={unreadChatCount}
        swarmOnlineCount={peers.filter(p => p.status === 'online').length + 1}
        currentLanguage={currentLanguage}
        onSelectLanguage={setCurrentLanguage}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenAdManager={() => setIsAdManagerOpen(true)}
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
              ads={ads}
              userRole={userRole}
              onOpenAdManager={() => setIsAdManagerOpen(true)}
              theme={theme}
              t={t}
            />

            <OrnamentDivider />

            <div id="portfolio-section">
              <PortfolioGallery
                items={portfolio}
                onSelectItem={(item) => setSelectedLightboxItem(item)}
                onBookItem={booking.handleStartBookingWithLook}
                likedIds={likedIds}
                onToggleLike={handleToggleLike}
                savedIds={savedIds}
                onToggleSave={handleToggleSave}
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
              onOpenChatWithArtist={() => setIsChatOpen(true)}
              userRole={userRole}
              onUpdateMasterSalon={handleUpdateMasterSalon}
              theme={theme}
              t={t}
            />

            <SponsoredAdsBanner
              ads={ads}
              userRole={userRole}
              onOpenAdManager={() => setIsAdManagerOpen(true)}
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
              onOpenChatWithArtist={() => {
                setIsChatOpen(true);
              }}
            />

            <SponsoredAdsBanner
              ads={ads}
              userRole={userRole}
              onOpenAdManager={() => setIsAdManagerOpen(true)}
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
            onImportPost={handleImportInstagramPost}
          />
        )}

        {activeTab === 'cryptocloud' && (
          <CryptoCloudPanel
            swarmState={swarmState}
            peers={peers}
            onTriggerBackup={handleExportCryptoCloudBackup}
            onSimulatePulse={handleSimulatePeerPulse}
            isBackingUp={isBackingUp}
            backupSuccessMessage={backupSuccessMessage}
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
              onOpenChat={() => setIsChatOpen(true)}
              theme={theme}
              t={t}
            />
          </div>
        )}
      </main>

      {/* Ad Campaign Manager Modal */}
      <AdCampaignManagerModal
        isOpen={isAdManagerOpen}
        onClose={() => setIsAdManagerOpen(false)}
        ads={ads}
        onCreateCampaign={handleCreateAdCampaign}
        theme={theme}
        t={t}
      />

      {/* Modals & Overlays */}
      <LightboxModal
        item={selectedLightboxItem}
        onClose={() => setSelectedLightboxItem(null)}
        onBookThisLook={handleStartBookingWithLookFromLightbox}
        onLikeToggle={handleToggleLike}
        isLiked={selectedLightboxItem ? likedIds.has(selectedLightboxItem.id) : false}
        onSaveToggle={handleToggleSave}
        isSaved={selectedLightboxItem ? savedIds.has(selectedLightboxItem.id) : false}
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
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={chatMessages}
        onSendMessage={handleSendMessage}
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
        onOpenChat={() => setIsChatOpen(true)}
        onOpenAndroidSuite={() => setActiveTab('android')}
        theme={theme}
      />

      {/* Android Native Material 3 Bottom Navigation Bar */}
      <AndroidBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadChatCount={unreadChatCount}
        onOpenChat={() => setIsChatOpen(true)}
        theme={theme}
        t={t}
      />

    </div>
  );
}
