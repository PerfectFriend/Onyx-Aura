import { useReducer, useEffect, useCallback, useRef } from 'react';
import {
  HydratedSalonData,
  OutboxMutation,
  StorageBackendKind,
  StorageHealth,
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
import { IdentitySession, PasskeyCredentialRecord } from '../domain/identity';
import {
  defaultSalonRepository,
  SalonRepository,
} from '../infrastructure/storage/salonRepository';

export interface UseSalonBootstrapOptions {
  repository?: SalonRepository;
  onStorageError?: (message: string) => void;
}

interface BootstrapState {
  bootstrapData: HydratedSalonData | null;
  resetEpoch: number;
  externalRevision: number;
  storageBackend: StorageBackendKind;
  storageHealth: StorageHealth;
  storageWarnings: string[];
  outbox: OutboxMutation[];
}

type BootstrapAction =
  | { type: 'HYDRATE_INITIAL'; data: HydratedSalonData }
  | { type: 'APPLY_EXTERNAL_SYNC'; data: HydratedSalonData }
  | { type: 'APPLY_RESET'; data: HydratedSalonData }
  | {
      type: 'PATCH_SLICE';
      patch: Partial<HydratedSalonData>;
      backend: StorageBackendKind;
      health: StorageHealth;
      warnings: string[];
    }
  | {
      type: 'REFRESH_HEALTH';
      backend: StorageBackendKind;
      health: StorageHealth;
      warnings: string[];
    }
  | { type: 'DISMISS_WARNINGS' };

function bootstrapReducer(state: BootstrapState, action: BootstrapAction): BootstrapState {
  switch (action.type) {
    case 'HYDRATE_INITIAL':
      return {
        ...state,
        bootstrapData: action.data,
        outbox: action.data.outbox,
        storageBackend: action.data.meta.backend,
        storageHealth: action.data.health,
        storageWarnings: action.data.warnings,
      };
    case 'APPLY_EXTERNAL_SYNC':
      return {
        ...state,
        bootstrapData: action.data,
        externalRevision: state.externalRevision + 1,
        outbox: action.data.outbox,
        storageBackend: action.data.meta.backend,
        storageHealth: action.data.health,
        storageWarnings: action.data.warnings,
      };
    case 'APPLY_RESET':
      return {
        ...state,
        bootstrapData: action.data,
        resetEpoch: state.resetEpoch + 1,
        externalRevision: 0,
        outbox: action.data.outbox,
        storageBackend: action.data.meta.backend,
        storageHealth: action.data.health,
        storageWarnings: action.data.warnings,
      };
    case 'PATCH_SLICE':
      return {
        ...state,
        bootstrapData: state.bootstrapData
          ? { ...state.bootstrapData, ...action.patch }
          : state.bootstrapData,
        outbox: action.patch.outbox ?? state.outbox,
        storageBackend: action.backend,
        storageHealth: action.health,
        storageWarnings:
          action.warnings.length > 0
            ? Array.from(new Set([...state.storageWarnings, ...action.warnings]))
            : state.storageWarnings,
      };
    case 'REFRESH_HEALTH':
      return {
        ...state,
        storageBackend: action.backend,
        storageHealth: action.health,
        storageWarnings:
          action.warnings.length > 0
            ? Array.from(new Set([...state.storageWarnings, ...action.warnings]))
            : state.storageWarnings,
      };
    case 'DISMISS_WARNINGS':
      return {
        ...state,
        storageWarnings: [],
      };
  }
}

/**
 * Load-then-Mount Local-First Coordinator (L-11 / N-04 / N-06 / N-09):
 * - Single reducer state (`bootstrapData`) without duplicate ref mirrors or sync effects.
 * - Transactional `*WithOutbox` repository commits (1 transaction per action, zero split-writes).
 * - Debounced cross-tab updates (`externalRevision`) without remounting `<SalonApp>`.
 * - Retries deferred writes on `online` / `visibilitychange` / `pagehide` & warns `beforeunload`.
 */
export function useSalonBootstrap({
  repository = defaultSalonRepository,
  onStorageError,
}: UseSalonBootstrapOptions = {}) {
  const [state, dispatch] = useReducer(
    bootstrapReducer,
    undefined,
    (): BootstrapState => ({
      bootstrapData: null,
      resetEpoch: 0,
      externalRevision: 0,
      storageBackend: repository.getBackendKind(),
      storageHealth: 'ok',
      storageWarnings: [],
      outbox: [],
    })
  );

  const onStorageErrorRef = useRef(onStorageError);
  onStorageErrorRef.current = onStorageError;

  const refreshHealthFromRepo = useCallback(
    (patch: Partial<HydratedSalonData> = {}) => {
      const report = repository.getHealthReport();
      dispatch({
        type: 'PATCH_SLICE',
        patch,
        backend: report.backend,
        health: report.health,
        warnings: report.warnings,
      });
    },
    [repository]
  );

  useEffect(() => {
    let active = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    repository
      .ensureSeededAndLoad()
      .then(data => {
        if (active) {
          dispatch({ type: 'HYDRATE_INITIAL', data });
        }
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[LocalFirst] Bootstrap load failed:', err);
        if (active) {
          onStorageErrorRef.current?.(msg);
        }
      });

    const unsubTabs = repository.subscribeExternalChanges(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        repository
          .ensureSeededAndLoad()
          .then(data => {
            if (active) {
              dispatch({ type: 'APPLY_EXTERNAL_SYNC', data });
            }
          })
          .catch(() => undefined);
      }, 150);
    });

    const triggerRetry = () => {
      if (repository.getPendingWriteCount() === 0) return;
      void repository
        .retryPendingWrites()
        .then(() => {
          if (!active) return;
          const report = repository.getHealthReport();
          dispatch({
            type: 'REFRESH_HEALTH',
            backend: report.backend,
            health: report.health,
            warnings: report.warnings,
          });
        })
        .catch(() => undefined);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' || document.visibilityState === 'visible') {
        triggerRetry();
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (repository.getPendingWriteCount() > 0) {
        triggerRetry();
        e.preventDefault();
        e.returnValue = '';
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', triggerRetry);
      window.addEventListener('pagehide', triggerRetry);
      window.addEventListener('beforeunload', handleBeforeUnload);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      active = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubTabs();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', triggerRetry);
        window.removeEventListener('pagehide', triggerRetry);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [repository]);

  const persistAppointments = useCallback(
    async (appointments: Appointment[], action = 'APPOINTMENTS_UPDATED', payload?: unknown) => {
      try {
        const nextOutbox = await repository.saveAppointmentsWithOutbox(appointments, {
          entity: 'appointments',
          action,
          payload: payload ?? { count: appointments.length },
        });
        refreshHealthFromRepo({ appointments, outbox: nextOutbox });
      } catch (err) {
        refreshHealthFromRepo();
        const msg = err instanceof Error ? err.message : String(err);
        onStorageErrorRef.current?.(msg);
        throw err;
      }
    },
    [refreshHealthFromRepo, repository]
  );

  const persistPortfolio = useCallback(
    async (portfolio: PortfolioItem[], action = 'PORTFOLIO_UPDATED', payload?: unknown) => {
      try {
        const nextOutbox = await repository.savePortfolioWithOutbox(portfolio, {
          entity: 'portfolio',
          action,
          payload: payload ?? { count: portfolio.length },
        });
        refreshHealthFromRepo({ portfolio, outbox: nextOutbox });
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refreshHealthFromRepo, repository]
  );

  const persistLikesAndPortfolio = useCallback(
    async (
      likedIds: string[],
      portfolio: PortfolioItem[],
      action = 'LOOK_LIKE_TOGGLED',
      payload?: unknown
    ) => {
      try {
        const nextOutbox =
          (await repository.saveLikesAndPortfolioAtomic(likedIds, portfolio, {
            entity: 'likes',
            action,
            payload: payload ?? { totalLiked: likedIds.length },
          })) ?? [];
        refreshHealthFromRepo({ likedIds, portfolio, outbox: nextOutbox });
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refreshHealthFromRepo, repository]
  );

  const persistSaves = useCallback(
    async (savedIds: string[], action = 'LOOK_SAVE_TOGGLED', payload?: unknown) => {
      try {
        const nextOutbox = await repository.saveSavedIdsWithOutbox(savedIds, {
          entity: 'saves',
          action,
          payload: payload ?? { totalSaved: savedIds.length },
        });
        refreshHealthFromRepo({ savedIds, outbox: nextOutbox });
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refreshHealthFromRepo, repository]
  );

  const saveReviewAndUpdateArtistRating = useCallback(
    async (newReview: Review) => {
      try {
        const updated = await repository.addReviewAndUpdateArtistWithOutbox(newReview);
        refreshHealthFromRepo(updated);
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refreshHealthFromRepo, repository]
  );

  const updateAnchorPoint = useCallback(
    async (updatedPoint: ClientAnchorPoint) => {
      try {
        const updated = await repository.updateAnchorPointWithOutbox(updatedPoint);
        refreshHealthFromRepo(updated);
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refreshHealthFromRepo, repository]
  );

  const updateMasterSalon = useCallback(
    async (artistId: string, salonName: string, salonAddress: string, lat: number, lng: number) => {
      try {
        const updated = await repository.updateMasterSalonWithOutbox(
          artistId,
          salonName,
          salonAddress,
          lat,
          lng
        );
        refreshHealthFromRepo(updated);
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refreshHealthFromRepo, repository]
  );

  const persistChats = useCallback(
    async (chats: ChatMessage[], payload?: unknown) => {
      try {
        const nextOutbox = await repository.saveChatsWithOutbox(chats, {
          entity: 'chats',
          action: 'CHAT_MESSAGE_SAVED',
          payload: payload ?? { count: chats.length },
        });
        refreshHealthFromRepo({ chats, outbox: nextOutbox });
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refreshHealthFromRepo, repository]
  );

  const persistAds = useCallback(
    async (ads: SponsoredAd[], payload?: unknown) => {
      try {
        const nextOutbox = await repository.saveAdsWithOutbox(ads, {
          entity: 'ads',
          action: 'AD_CAMPAIGN_CREATED',
          payload: payload ?? { count: ads.length },
        });
        refreshHealthFromRepo({ ads, outbox: nextOutbox });
      } catch (err) {
        refreshHealthFromRepo();
        onStorageErrorRef.current?.(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [refreshHealthFromRepo, repository]
  );

  const persistPasskeys = useCallback(
    async (passkeys: PasskeyCredentialRecord[], action = 'PASSKEY_UPDATED', payload?: unknown) => {
      const nextOutbox = await repository.savePasskeysWithOutbox(passkeys, {
        entity: 'identity',
        action,
        payload: payload ?? { count: passkeys.length },
      });
      refreshHealthFromRepo({ passkeys, outbox: nextOutbox });
    },
    [refreshHealthFromRepo, repository]
  );

  const persistIdentitySession = useCallback(
    async (session: IdentitySession, action = 'IDENTITY_SESSION_UPDATED') => {
      const nextOutbox = await repository.saveIdentitySessionWithOutbox(session, {
        entity: 'identity',
        action,
        payload: {
          authenticated: session.authenticated,
          role: session.role,
          authMethod: session.authMethod,
        },
      });
      refreshHealthFromRepo({ identitySession: session, outbox: nextOutbox });
    },
    [refreshHealthFromRepo, repository]
  );

  const resetAllToSeed = useCallback(
    async (options: { preserveIdentity?: boolean } = {}) => {
      const freshData = await repository.resetToSeed(options);
      dispatch({ type: 'APPLY_RESET', data: freshData });
      return freshData;
    },
    [repository]
  );

  const flushOutboxDemo = useCallback(async () => {
    const flushed = await repository.flushOutboxLocalDemo();
    refreshHealthFromRepo({ outbox: flushed });
    return flushed;
  }, [refreshHealthFromRepo, repository]);

  const exportQuarantinedJson = useCallback(async () => {
    return repository.exportQuarantinedData();
  }, [repository]);

  const dismissWarnings = useCallback(() => {
    dispatch({ type: 'DISMISS_WARNINGS' });
  }, []);

  const artists: Artist[] = state.bootstrapData?.artists ?? [];
  const reviews: Review[] = state.bootstrapData?.reviews ?? [];
  const anchorPoints: ClientAnchorPoint[] = state.bootstrapData?.anchorPoints ?? [];
  const quarantineKeys: string[] = state.bootstrapData?.quarantineKeys ?? [];
  const pendingOutboxCount = state.outbox.filter(entry => entry.status === 'pending_sync').length;

  return {
    bootstrapData: state.bootstrapData,
    resetEpoch: state.resetEpoch,
    externalRevision: state.externalRevision,
    isHydrated: state.bootstrapData !== null,
    artists,
    reviews,
    anchorPoints,
    quarantineKeys,
    storageBackend: state.storageBackend,
    storageHealth: state.storageHealth,
    storageWarnings: state.storageWarnings,
    dismissWarnings,
    outbox: state.outbox,
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
    exportQuarantinedJson,
  };
}
