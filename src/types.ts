export type ServiceCategory = 
  | 'Sculptural 3D Chrome'
  | 'Japanese Glass Aura'
  | 'Russian E-File Precision'
  | 'Gothic Velvet Cat-Eye'
  | 'Baroque Gold Leaf Art'
  | 'Architectural Nail Extension';

export interface NailService {
  id: string;
  name: string;
  category: ServiceCategory;
  priceUSD: number;
  durationMinutes: number;
  description: string;
  includesCharms: boolean;
}

export interface PortfolioItem {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  artistHandle: string;
  artistAvatar: string;
  category: ServiceCategory;
  image: string;
  likes: number;
  saves: number;
  date: string;
  description: string;
  materials: string[];
  durationMinutes: number;
  priceUSD: number;
  igPostId?: string;
  igLikes?: number;
  onChainHash: string;
}

export interface Review {
  id: string;
  artistId: string;
  artistName: string;
  clientName: string;
  clientAddress: string;
  rating: number; // 1-5
  breakdown: {
    technique: number;
    hygiene: number;
    durability: number;
    precision: number;
  };
  text: string;
  date: string;
  blockHeight: number;
  blockHash: string;
  parentHash: string;
  verifiedBookingTx: string;
  verifiedInPerson: boolean;
}

export interface Artist {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  location: string;
  bio: string;
  verifiedTier: 'Master Guild Gold' | 'On-Chain Verified' | 'Apprentice Guild';
  reputationScore: number; // 0-100
  totalReviews: number;
  rating: number;
  walletAddress: string;
  stakedNAIL: number;
  igHandle: string;
  igFollowers: number;
  igEngagementRate: string;
  isIgConnected: boolean;
  services: NailService[];
  portfolioCount: number;
  salonName?: string;
  salonAddress?: string;
  coordinates?: { lat: number; lng: number };
  workingHours?: string;
}

export type ThemeMode = 'dark' | 'light';

export interface ClientAnchorPoint {
  id: 'home' | 'work' | 'custom';
  name: string;
  label: string;
  icon: string;
  address: string;
  coordinates: { lat: number; lng: number };
}

export type AdTargetAudience = 'client' | 'master' | 'all';
export type AdCategory = 'salon_spa' | 'tools_supplies' | 'education' | 'cosmetics';

export interface SponsoredAd {
  id: string;
  title: string;
  brandName: string;
  brandLogo?: string;
  tagline: string;
  description: string;
  targetAudience: AdTargetAudience;
  category: AdCategory;
  bannerImage: string;
  ctaText: string;
  ctaUrl?: string;
  discountCode?: string;
  discountPercent?: number;
  bidPerClickNAIL: number;
  impressions: number;
  clicks: number;
  isActive: boolean;
  sponsoredBadge: string;
}

export type PaymentCurrency = 'USD' | 'EUR' | 'GBP' | 'ETH' | 'SOL' | 'USDC' | 'NAIL';

export interface Appointment {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  artistId: string;
  artistName: string;
  artistAvatar: string;
  serviceId: string;
  serviceName: string;
  price: number;
  currency: PaymentCurrency;
  cryptoEquivalent?: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "14:00"
  status: 'pending' | 'escrow_locked' | 'confirmed' | 'completed' | 'cancelled';
  escrowTxHash?: string;
  remindersEnabled: boolean;
  pushReminderScheduled: boolean;
  smsReminderScheduled: boolean;
  referenceLookTitle?: string;
  referenceLookImage?: string;
  customNotes?: string;
  createdAt: string;
}

export type UserRole = 'client' | 'master';

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  recipientId: string;
  text: string;
  timestamp: string;
  quoteAttachment?: {
    serviceName: string;
    price: number;
    currency: PaymentCurrency;
    durationMinutes: number;
  };
  inspirationImg?: string;
}

export interface PeerNode {
  id: string;
  name: string;
  region: string;
  latencyMs: number;
  bufferedChunks: number;
  status: 'online' | 'syncing' | 'idle';
  reputation: number;
}

export interface CryptoCloudState {
  localNodeId: string;
  connectedPeers: PeerNode[];
  bufferHealthPct: number;
  totalSyncedBlocks: number;
  localBufferedChunks: number;
  storageUsedKB: number;
  encryptionMode: 'AES-256-GCM / Zero-Knowledge' | 'Hardware Enclave';
  autoBackupIntervalHours: number;
  lastBackupTimestamp: string;
}

export interface SystemNotification {
  id: string;
  type: 'sms' | 'push' | 'blockchain' | 'p2p';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export type WallpaperTheme = 'damask' | 'filigree' | 'mosaic' | 'minimal';

