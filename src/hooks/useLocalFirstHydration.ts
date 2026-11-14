import { useState, useEffect, useRef, useCallback } from 'react';
import {
  HydratedSalonData,
  OutboxEntity,
  OutboxMutation,
  StorageBackendKind,
} from '../domain/storage';
import {
  Appointment,
  Artist,
  ChatMessage,
  ClientAnchorPoint,
  PortfolioItem,
  Review,
  SponsoredAd,
} from '../types';
import {
  createSeedSnapshot,
  defaultSalonRepository,
  SalonRepository,
} from '../infrastructure/storage/salonRepository';

export interface HydrationEvent {
  data: HydratedSalonData;
  dirty: ReadonlySet<OutboxEntity>;
  force: boolean;
  seq: number;
}

export interface UseLocalFirstHydrationOptions {
  repository?: SalonRepository;
}

/**
 * Stage 2 Local-First store & IndexedDB hydration hook:
 * - Loads/seeds all domain collections cleanly via SalonRepository on mount
 * - Owns cross-domain shared collections (artists, reviews, anchorPoints)
 * - Emits a HydrationEvent (guarded by dirtyEntities) for slice hooks (booking, chat, portfolio, ads)
 * - Records every client/master mutation in IndexedDB + Offline Outbox Queue
 */
export function useLocalFirstHydration({
  repository = defaultSalonRepository,
}: UseLocalFirstHydrationOptions = {}) {
  const [artists, setArtists] = useState<Artist[]>(() => createSeedSnapshot().artists);
  const [reviews, setReviews] = useState<Review[]>(() => createSeedSnapshot().reviews);
  const [anchorPoints, setAnchorPoints] = useState<ClientAnchorPoint[]>(
    () => createSeedSnapshot().anchorPoints
  );

  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [storageBackend, setStorageBackend] = useState<StorageBackendKind>(() =>
    repository.getBackendKind()
  );
  const [outbox, setOutbox] = useState<OutboxMutation[]>([]);
  const [hydrationEvent, setHydrationEvent] = useState<HydrationEvent | null>(null);

  const artistsRef = useRef<Artist[]>(artists);
  const reviewsRef = useRef<Review[]>(reviews);
  const anchorPointsRef = useRef<ClientAnchorPoint[]>(anchorPoints);
  const dirtyEntitiesRef = useRef<Set<OutboxEntity>>(new Set());
  const seqRef = useRef<number>(0);

  useEffect(() => {
    artistsRef.current = artists;
  }, [artists]);

  useEffect(() => {
    reviewsRef.current = reviews;
  }, [reviews]);

  useEffect(() => {
    anchorPointsRef.current = anchorPoints;
  }, [anchorPoints]);

  useEffect(() => {
    let active = true;

    repository
      .ensureSeededAndLoad()
      .then(data => {
        if (!active) return;
        const dirtySnapshot = new Set(dirtyEntitiesRef.current);

        if (!dirtySnapshot.has('artists')) {
          artistsRef.current = data.artists;
          setArtists(data.artists);
        }
        if (!dirtySnapshot.has('reviews')) {
          reviewsRef.current = data.reviews;
          setReviews(data.reviews);
        }
        if (!dirtySnapshot.has('anchorPoints')) {
          anchorPointsRef.current = data.anchorPoints;
          setAnchorPoints(data.anchorPoints);
        }

        seqRef.current += 1;
        setHydrationEvent({
          data,
          dirty: dirtySnapshot,
          force: false,
          seq: seqRef.current,
        });
        setOutbox(data.outbox);
        setStorageBackend(repository.getBackendKind());
        setIsHydrated(true);
      })
      .catch(err => {
        console.warn('[LocalFirst] Initial hydration failed cleanly, continuing with seed defaults:', err);
        if (active) {
          setIsHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, [repository]);

  const markDirty = useCallback((entity: OutboxEntity) => {
    dirtyEntitiesRef.current.add(entity);
  }, []);

  const recordOutbox = useCallback(
    async (entity: OutboxEntity, action: string, payload: unknown) => {
      const nextOutbox = await repository.enqueueOutboxMutation(entity, action, payload);
      setOutbox(nextOutbox);
      setStorageBackend(repository.getBackendKind());
    },
    [repository]
  );

  const persistAppointments = useCallback(
    async (appointments: Appointment[], action = 'APPOINTMENTS_UPDATED', payload?: unknown) => {
      markDirty('appointments');
      await repository.saveAppointments(appointments);
      await recordOutbox('appointments', action, payload ?? { count: appointments.length });
    },
    [markDirty, recordOutbox, repository]
  );

  const persistPortfolio = useCallback(
    async (portfolio: PortfolioItem[], action = 'PORTFOLIO_UPDATED', payload?: unknown) => {
      markDirty('portfolio');
      await repository.savePortfolio(portfolio);
      await recordOutbox('portfolio', action, payload ?? { count: portfolio.length });
    },
    [markDirty, recordOutbox, repository]
  );

  const persistLikesAndPortfolio = useCallback(
    async (
      likedIds: string[],
      portfolio: PortfolioItem[],
      action = 'LOOK_LIKE_TOGGLED',
      payload?: unknown
    ) => {
      markDirty('likes');
      markDirty('portfolio');
      await Promise.all([
        repository.saveLikedIds(likedIds),
        repository.savePortfolio(portfolio),
      ]);
      await recordOutbox('likes', action, payload ?? { totalLiked: likedIds.length });
    },
    [markDirty, recordOutbox, repository]
  );

  const persistSaves = useCallback(
    async (savedIds: string[], action = 'LOOK_SAVE_TOGGLED', payload?: unknown) => {
      markDirty('saves');
      await repository.saveSavedIds(savedIds);
      await recordOutbox('saves', action, payload ?? { totalSaved: savedIds.length });
    },
    [markDirty, recordOutbox, repository]
  );

  const saveReviewAndUpdateArtistRating = useCallback(
    async (
      newReview: Review,
      computeRating: (currentRating: number, totalReviews: number, rating: number) => number
    ) => {
      markDirty('reviews');
      markDirty('artists');

      const nextReviews = [newReview, ...reviewsRef.current];
      const nextArtists = artistsRef.current.map(art =>
        art.id === newReview.artistId
          ? {
              ...art,
              rating: computeRating(art.rating, art.totalReviews, newReview.rating),
              totalReviews: art.totalReviews + 1,
            }
          : art
      );

      reviewsRef.current = nextReviews;
      artistsRef.current = nextArtists;
      setReviews(nextReviews);
      setArtists(nextArtists);

      await Promise.all([
        repository.saveReviews(nextReviews),
        repository.saveArtists(nextArtists),
      ]);
      await recordOutbox('reviews', 'REVIEW_SUBMITTED', {
        reviewId: newReview.id,
        artistId: newReview.artistId,
        rating: newReview.rating,
      });
    },
    [markDirty, recordOutbox, repository]
  );

  const updateAnchorPoint = useCallback(
    async (updatedPoint: ClientAnchorPoint) => {
      markDirty('anchorPoints');
      const nextAnchors = anchorPointsRef.current.map(p =>
        p.id === updatedPoint.id ? updatedPoint : p
      );
      anchorPointsRef.current = nextAnchors;
      setAnchorPoints(nextAnchors);

      await repository.saveAnchorPoints(nextAnchors);
      await recordOutbox('anchorPoints', 'ANCHOR_POINT_UPDATED', {
        anchorId: updatedPoint.id,
        label: updatedPoint.label,
      });
    },
    [markDirty, recordOutbox, repository]
  );

  const updateMasterSalon = useCallback(
    async (artistId: string, salonName: string, salonAddress: string, lat: number, lng: number) => {
      markDirty('artists');
      const nextArtists = artistsRef.current.map(art =>
        art.id === artistId
          ? {
              ...art,
              salonName,
              salonAddress,
              coordinates: { lat, lng },
            }
          : art
      );
      artistsRef.current = nextArtists;
      setArtists(nextArtists);

      await repository.saveArtists(nextArtists);
      await recordOutbox('artists', 'MASTER_SALON_UPDATED', {
        artistId,
        salonName,
      });
    },
    [markDirty, recordOutbox, repository]
  );

  const persistChats = useCallback(
    async (chats: ChatMessage[], payload?: unknown) => {
      markDirty('chats');
      await repository.saveChats(chats);
      await recordOutbox('chats', 'CHAT_MESSAGE_SAVED', payload ?? { count: chats.length });
    },
    [markDirty, recordOutbox, repository]
  );

  const persistAds = useCallback(
    async (ads: SponsoredAd[], payload?: unknown) => {
      markDirty('ads');
      await repository.saveAds(ads);
      await recordOutbox('ads', 'AD_CAMPAIGN_CREATED', payload ?? { count: ads.length });
    },
    [markDirty, recordOutbox, repository]
  );

  const resetAllToSeed = useCallback(async () => {
    dirtyEntitiesRef.current.clear();
    const freshData = await repository.resetToSeed();

    artistsRef.current = freshData.artists;
    reviewsRef.current = freshData.reviews;
    anchorPointsRef.current = freshData.anchorPoints;
    setArtists(freshData.artists);
    setReviews(freshData.reviews);
    setAnchorPoints(freshData.anchorPoints);

    seqRef.current += 1;
    setHydrationEvent({
      data: freshData,
      dirty: new Set(),
      force: true,
      seq: seqRef.current,
    });
    setOutbox(freshData.outbox);
    setStorageBackend(repository.getBackendKind());
    return freshData;
  }, [repository]);

  const flushOutboxDemo = useCallback(async () => {
    const flushed = await repository.flushOutboxLocalDemo();
    setOutbox(flushed);
    return flushed;
  }, [repository]);

  const pendingOutboxCount = outbox.filter(entry => entry.status === 'pending_sync').length;

  return {
    artists,
    reviews,
    anchorPoints,
    isHydrated,
    storageBackend,
    outbox,
    pendingOutboxCount,
    hydrationEvent,
    persistAppointments,
    persistPortfolio,
    persistLikesAndPortfolio,
    persistSaves,
    saveReviewAndUpdateArtistRating,
    updateAnchorPoint,
    updateMasterSalon,
    persistChats,
    persistAds,
    resetAllToSeed,
    flushOutboxDemo,
  };
}

/**
 * Synchronizes domain slice hooks (booking, chat, portfolio, ads) whenever IndexedDB finishes
 * initial hydration or triggers a user-requested reset.
 */
export function useHydrationCommit(
  event: HydrationEvent | null,
  onApply: (data: HydratedSalonData, dirty: ReadonlySet<OutboxEntity>, force: boolean) => void
) {
  const onApplyRef = useRef(onApply);

  useEffect(() => {
    onApplyRef.current = onApply;
  }, [onApply]);

  useEffect(() => {
    if (!event) return;
    onApplyRef.current(event.data, event.dirty, event.force);
  }, [event]);
}
