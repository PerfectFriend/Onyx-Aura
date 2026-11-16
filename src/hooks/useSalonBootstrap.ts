import { useState, useEffect, useCallback, useRef } from 'react';
import {
  HydratedSalonData,
  OutboxEntity,
  OutboxMutation,
  StorageBackendKind,
  StorageHealth,
} from '../domain/storage';
import { computeExactArtistRatingUpdate } from '../domain/rating';
import {
  Appointment,
  Artist,
  ChatMessage,
  ClientAnchorPoint,
  PortfolioItem,
  Review,
  SponsoredAd,
} from '../types';
import { IdentitySession, PasskeyCredentialRecord } from '../domain/identity';
import {
  defaultSalonRepository,
  SalonRepository,
} from '../infrastructure/storage/salonRepository';

export interface UseSalonBootstrapOptions {
  repository?: SalonRepository;
  onStorageError?: (message: string) => void;
}

/**
 * Load-then-Mount Local-First Coordinator (L-11):
 * 1. Hydrates `SalonRepository` cleanly BEFORE mounting `<SalonApp key={resetEpoch} />`,
 *    eliminating `useHydrationCommit`, `dirtyEntitiesRef`, `seq`, ref mirrors, and 7 slice setters.
 * 2. Coordinates atomic single-transaction `setMany` writes (likes+portfolio, reviews+artists).
 * 3. Subscribes to cross-tab `BroadcastChannel` updates for multi-tab consistency.
 */
export function useSalonBootstrap({
  repository = defaultSalonRepository,
  onStorageError,
}: UseSalonBootstrapOptions = {}) {
  const [bootstrapData, setBootstrapData] = useState<HydratedSalonData | null>(null);
  const [resetEpoch, setResetEpoch] = useState<number>(0);

  const [artists, setArtists] = useState<Artist[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [anchorPoints, setAnchorPoints] = useState<ClientAnchorPoint[]>([]);
  const [outbox, setOutbox] = useState<OutboxMutation[]>([]);
  const [storageBackend, setStorageBackend] = useState<StorageBackendKind>(() =>
    repository.getBackendKind()
  );
  const [storageHealth, setStorageHealth] = useState<StorageHealth>('ok');
  const [storageWarnings, setStorageWarnings] = useState<string[]>([]);

  const artistsRef = useRef<Artist[]>(artists);
  const reviewsRef = useRef<Review[]>(reviews);
  const anchorPointsRef = useRef<ClientAnchorPoint[]>(anchorPoints);
  const onStorageErrorRef = useRef(onStorageError);

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
    onStorageErrorRef.current = onStorageError;
  }, [onStorageError]);

  const applyLoadedSnapshot = useCallback((data: HydratedSalonData, bumpEpoch: boolean) => {
    artistsRef.current = data.artists;
    reviewsRef.current = data.reviews;
    anchorPointsRef.current = data.anchorPoints;

    setArtists(data.artists);
    setReviews(data.reviews);
    setAnchorPoints(data.anchorPoints);
    setOutbox(data.outbox);
    setStorageBackend(repository.getBackendKind());
    setStorageHealth(data.health);
    setStorageWarnings(data.warnings);
    setBootstrapData(data);
    if (bumpEpoch) {
      setResetEpoch(prev => prev + 1);
    }
  }, [repository]);

  const refreshHealthFromRepo = useCallback(() => {
    const report = repository.getHealthReport();
    setStorageBackend(report.backend);
    setStorageHealth(report.health);
    if (report.warnings.length > 0) {
      setStorageWarnings(prev => Array.from(new Set([...prev, ...report.warnings])));
    }
  }, [repository]);

  useEffect(() => {
    let active = true;

    repository
      .ensureSeededAndLoad()
      .then(data => {
        if (!active) return;
        applyLoadedSnapshot(data, false);
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[LocalFirst] Bootstrap load failed:', err);
        if (active) {
          onStorageErrorRef.current?.(msg);
        }
      });

    const unsubTabs = repository.subscribeExternalChanges(() => {
      repository
        .ensureSeededAndLoad()
        .then(data => {
          if (active) {
            applyLoadedSnapshot(data, true);
          }
        })
        .catch(() => undefined);
    });

    return () => {
      active = false;
      unsubTabs();
    };
  }, [applyLoadedSnapshot, repository]);

  const recordOutbox = useCallback(
    async (entity: OutboxEntity, action: string, payload: unknown) => {
      const nextOutbox = await repository.enqueueOutboxMutation(entity, action, payload);
      setOutbox(nextOutbox);
      refreshHealthFromRepo();
    },
    [refreshHealthFromRepo, repository]
  );

  const persistAppointments = useCallback(
    async (appointments: Appointment[], action = 'APPOINTMENTS_UPDATED', payload?: unknown) => {
      try {
        await repository.saveAppointments(appointments);
        await recordOutbox('appointments', action, payload ?? { count: appointments.length });
      } catch (err) {
        refreshHealthFromRepo();
        const msg = err instanceof Error ? err.message : String(err);
        onStorageErrorRef.current?.(msg);
        throw err;
      }
    },
    [recordOutbox, refreshHealthFromRepo, repository]
  );

  const persistPortfolio = useCallback(
    async (portfolio: PortfolioItem[], action = 'PORTFOLIO_UPDATED', payload?: unknown) => {
      try {
        await repository.savePortfolio(portfolio);
        await recordOutbox('portfolio', action, payload ?? { count: portfolio.length });
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [recordOutbox, refreshHealthFromRepo, repository]
  );

  const persistLikesAndPortfolio = useCallback(
    async (
      likedIds: string[],
      portfolio: PortfolioItem[],
      action = 'LOOK_LIKE_TOGGLED',
      payload?: unknown
    ) => {
      try {
        await repository.saveLikesAndPortfolioAtomic(likedIds, portfolio);
        await recordOutbox('likes', action, payload ?? { totalLiked: likedIds.length });
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [recordOutbox, refreshHealthFromRepo, repository]
  );

  const persistSaves = useCallback(
    async (savedIds: string[], action = 'LOOK_SAVE_TOGGLED', payload?: unknown) => {
      try {
        await repository.saveSavedIds(savedIds);
        await recordOutbox('saves', action, payload ?? { totalSaved: savedIds.length });
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [recordOutbox, refreshHealthFromRepo, repository]
  );

  const saveReviewAndUpdateArtistRating = useCallback(
    async (newReview: Review) => {
      const taggedReview: Review = { ...newReview, origin: 'user' };
      const nextReviews = [taggedReview, ...reviewsRef.current];
      const nextArtists = artistsRef.current.map(art => {
        if (art.id !== taggedReview.artistId) return art;
        const updated = computeExactArtistRatingUpdate({
          currentRating: art.rating,
          totalReviews: art.totalReviews,
          ratingSum: art.ratingSum,
          newRating: taggedReview.rating,
        });
        return {
          ...art,
          rating: updated.rating,
          totalReviews: updated.totalReviews,
          ratingSum: updated.ratingSum,
        };
      });

      await repository.saveReviewsAndArtistsAtomic(nextReviews, nextArtists);
      reviewsRef.current = nextReviews;
      artistsRef.current = nextArtists;
      setReviews(nextReviews);
      setArtists(nextArtists);

      await recordOutbox('reviews', 'REVIEW_SUBMITTED', {
        reviewId: taggedReview.id,
        artistId: taggedReview.artistId,
        rating: taggedReview.rating,
      });
    },
    [recordOutbox, repository]
  );

  const updateAnchorPoint = useCallback(
    async (updatedPoint: ClientAnchorPoint) => {
      const tagged: ClientAnchorPoint = { ...updatedPoint, origin: 'user' };
      const nextAnchors = anchorPointsRef.current.map(p => (p.id === tagged.id ? tagged : p));
      await repository.saveAnchorPoints(nextAnchors);
      anchorPointsRef.current = nextAnchors;
      setAnchorPoints(nextAnchors);
      await recordOutbox('anchorPoints', 'ANCHOR_POINT_UPDATED', {
        anchorId: tagged.id,
        label: tagged.label,
      });
    },
    [recordOutbox, repository]
  );

  const updateMasterSalon = useCallback(
    async (artistId: string, salonName: string, salonAddress: string, lat: number, lng: number) => {
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
      await repository.saveArtists(nextArtists);
      artistsRef.current = nextArtists;
      setArtists(nextArtists);
      await recordOutbox('artists', 'MASTER_SALON_UPDATED', {
        artistId,
        salonName,
      });
    },
    [recordOutbox, repository]
  );

  const persistChats = useCallback(
    async (chats: ChatMessage[], payload?: unknown) => {
      try {
        await repository.saveChats(chats);
        await recordOutbox('chats', 'CHAT_MESSAGE_SAVED', payload ?? { count: chats.length });
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [recordOutbox, refreshHealthFromRepo, repository]
  );

  const persistAds = useCallback(
    async (ads: SponsoredAd[], payload?: unknown) => {
      try {
        await repository.saveAds(ads);
        await recordOutbox('ads', 'AD_CAMPAIGN_CREATED', payload ?? { count: ads.length });
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [recordOutbox, refreshHealthFromRepo, repository]
  );

  const persistPasskeys = useCallback(
    async (passkeys: PasskeyCredentialRecord[], action = 'PASSKEY_UPDATED', payload?: unknown) => {
      await repository.savePasskeys(passkeys);
      await recordOutbox('identity', action, payload ?? { count: passkeys.length });
    },
    [recordOutbox, repository]
  );

  const persistIdentitySession = useCallback(
    async (session: IdentitySession, action = 'IDENTITY_SESSION_UPDATED') => {
      await repository.saveIdentitySession(session);
      await recordOutbox('identity', action, {
        authenticated: session.authenticated,
        role: session.role,
        authMethod: session.authMethod,
      });
    },
    [recordOutbox, repository]
  );

  const resetAllToSeed = useCallback(
    async (options: { preserveIdentity?: boolean } = {}) => {
      const freshData = await repository.resetToSeed(options);
      applyLoadedSnapshot(freshData, true);
      return freshData;
    },
    [applyLoadedSnapshot, repository]
  );

  const flushOutboxDemo = useCallback(async () => {
    const flushed = await repository.flushOutboxLocalDemo();
    setOutbox(flushed);
    refreshHealthFromRepo();
    return flushed;
  }, [refreshHealthFromRepo, repository]);

  const dismissWarnings = useCallback(() => {
    setStorageWarnings([]);
  }, []);

  const pendingOutboxCount = outbox.filter(entry => entry.status === 'pending_sync').length;

  return {
    bootstrapData,
    resetEpoch,
    isHydrated: bootstrapData !== null,
    artists,
    reviews,
    anchorPoints,
    storageBackend,
    storageHealth,
    storageWarnings,
    dismissWarnings,
    outbox,
    pendingOutboxCount,
    persistAppointments,
    persistPortfolio,
    persistLikesAndPortfolio,
    persistSaves,
    saveReviewAndUpdateArtistRating,
    updateAnchorPoint,
    updateMasterSalon,
    persistChats,
    persistAds,
    persistPasskeys,
    persistIdentitySession,
    resetAllToSeed,
    flushOutboxDemo,
  };
}
