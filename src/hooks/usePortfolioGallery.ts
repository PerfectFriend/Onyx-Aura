import { useState, useCallback, useRef, useEffect } from 'react';
import { PortfolioItem, ServiceCategory } from '../types';
import { createSeedSnapshot } from '../infrastructure/storage/salonRepository';

export interface UsePortfolioGalleryOptions {
  initialItems?: PortfolioItem[];
  onSyncPostToSwarm?: (look: PortfolioItem, igPostId: string) => void;
  onNotify?: (title: string, message: string) => void;
  onPersistPortfolio?: (items: PortfolioItem[], action: string, payload: unknown) => void;
  onPersistLikes?: (likedIds: string[], items: PortfolioItem[], action: string, payload: unknown) => void;
  onPersistSaves?: (savedIds: string[], action: string, payload: unknown) => void;
}

export interface InstagramImportPayload {
  title: string;
  artistId: string;
  artistName: string;
  artistHandle: string;
  artistAvatar: string;
  image: string;
  category: ServiceCategory;
  priceUSD: number;
  durationMinutes: number;
}

export function usePortfolioGallery({
  initialItems,
  onSyncPostToSwarm,
  onNotify,
  onPersistPortfolio,
  onPersistLikes,
  onPersistSaves,
}: UsePortfolioGalleryOptions = {}) {
  const [items, setItems] = useState<PortfolioItem[]>(
    () => initialItems ?? createSeedSnapshot().portfolio
  );
  const [likedIds, setLikedIds] = useState<Set<string>>(
    () => new Set(createSeedSnapshot().likedIds)
  );
  const [savedIds, setSavedIds] = useState<Set<string>>(
    () => new Set(createSeedSnapshot().savedIds)
  );
  const [selectedLightboxItem, setSelectedLightboxItem] = useState<PortfolioItem | null>(null);

  const itemsRef = useRef<PortfolioItem[]>(items);
  const likedIdsRef = useRef<Set<string>>(likedIds);
  const savedIdsRef = useRef<Set<string>>(savedIds);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    likedIdsRef.current = likedIds;
  }, [likedIds]);

  useEffect(() => {
    savedIdsRef.current = savedIds;
  }, [savedIds]);

  // Atomic, race-free like toggle + persistence (resolves K-14)
  const handleToggleLike = useCallback(
    (id: string) => {
      const nextLiked = new Set(likedIdsRef.current);
      const isCurrentlyLiked = nextLiked.has(id);
      if (isCurrentlyLiked) {
        nextLiked.delete(id);
      } else {
        nextLiked.add(id);
      }

      const nextItems = itemsRef.current.map(item =>
        item.id === id
          ? { ...item, likes: Math.max(0, item.likes + (isCurrentlyLiked ? -1 : 1)) }
          : item
      );

      likedIdsRef.current = nextLiked;
      itemsRef.current = nextItems;
      setLikedIds(nextLiked);
      setItems(nextItems);

      onPersistLikes?.(
        Array.from(nextLiked),
        nextItems,
        isCurrentlyLiked ? 'LOOK_UNLIKED' : 'LOOK_LIKED',
        { lookId: id }
      );
    },
    [onPersistLikes]
  );

  const handleToggleSave = useCallback(
    (id: string) => {
      const nextSaved = new Set(savedIdsRef.current);
      const isCurrentlySaved = nextSaved.has(id);
      if (isCurrentlySaved) {
        nextSaved.delete(id);
      } else {
        nextSaved.add(id);
      }

      savedIdsRef.current = nextSaved;
      setSavedIds(nextSaved);

      onPersistSaves?.(
        Array.from(nextSaved),
        isCurrentlySaved ? 'LOOK_UNSAVED' : 'LOOK_SAVED',
        { lookId: id }
      );
    },
    [onPersistSaves]
  );

  const openLightbox = useCallback((item: PortfolioItem) => {
    setSelectedLightboxItem(item);
  }, []);

  const closeLightbox = useCallback(() => {
    setSelectedLightboxItem(null);
  }, []);

  const handleStartBookingWithLookFromLightbox = useCallback(
    (look: PortfolioItem, onBook: (look: PortfolioItem) => void) => {
      setSelectedLightboxItem(null);
      onBook(look);
    },
    []
  );

  const handleImportInstagramPost = useCallback(
    (post: InstagramImportPayload) => {
      const uniqueSuffix =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID().slice(0, 8).toUpperCase()
          : `${Date.now()}`;

      const newLook: PortfolioItem = {
        id: `port-ig-${uniqueSuffix}`,
        title: post.title,
        artistId: post.artistId,
        artistName: post.artistName,
        artistHandle: post.artistHandle,
        artistAvatar: post.artistAvatar,
        category: post.category,
        image: post.image,
        likes: 0,
        saves: 0,
        date: 'Just now [SIM]',
        description: `[SIM] Demo sample imported from @${post.artistHandle} preview feed and saved locally.`,
        materials: ['Gel Polish (Demo Sample)', 'Chrome Pigment (Demo Sample)'],
        durationMinutes: post.durationMinutes,
        priceUSD: post.priceUSD,
        igPostId: `ig_sim_${uniqueSuffix}`,
        contentHash: `0xSIM_IG_${uniqueSuffix}`,
      };

      const nextItems = [newLook, ...itemsRef.current];
      itemsRef.current = nextItems;
      setItems(nextItems);

      onPersistPortfolio?.(nextItems, 'INSTAGRAM_IMPORT_SAVED', {
        lookId: newLook.id,
        igPostId: newLook.igPostId,
      });

      onSyncPostToSwarm?.(newLook, newLook.igPostId || '');

      onNotify?.(
        '[SIM] Demo Instagram Set Imported',
        `Added demo look "${newLook.title}" and saved it to your local IndexedDB gallery.`
      );
    },
    [onNotify, onPersistPortfolio, onSyncPostToSwarm]
  );

  return {
    items,
    setItems,
    likedIds,
    setLikedIds,
    savedIds,
    setSavedIds,
    selectedLightboxItem,
    openLightbox,
    closeLightbox,
    handleToggleLike,
    handleToggleSave,
    handleStartBookingWithLookFromLightbox,
    handleImportInstagramPost,
  };
}
