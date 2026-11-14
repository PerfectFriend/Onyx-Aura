import { useState, useCallback } from 'react';
import { PortfolioItem } from '../types';
import { INITIAL_PORTFOLIO } from '../data/initialData';

export interface UsePortfolioGalleryOptions {
  initialItems?: PortfolioItem[];
  onSyncPostToSwarm?: (look: PortfolioItem, igPostId: string) => void;
  onNotify?: (title: string, message: string) => void;
}

export interface InstagramImportPayload {
  title: string;
  artistId: string;
  artistName: string;
  artistHandle: string;
  artistAvatar: string;
  image: string;
  category: any;
  priceUSD: number;
  durationMinutes: number;
}

export function usePortfolioGallery({
  initialItems = INITIAL_PORTFOLIO,
  onSyncPostToSwarm,
  onNotify,
}: UsePortfolioGalleryOptions = {}) {
  const [items, setItems] = useState<PortfolioItem[]>(initialItems);
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set(['port-gaudi', 'port-1']));
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(['port-gaudi', 'port-2']));
  const [selectedLightboxItem, setSelectedLightboxItem] = useState<PortfolioItem | null>(null);

  const handleToggleLike = useCallback(
    (id: string) => {
      const isCurrentlyLiked = likedIds.has(id);
      setLikedIds(prev => {
        const next = new Set(prev);
        if (isCurrentlyLiked) next.delete(id);
        else next.add(id);
        return next;
      });

      setItems(prevItems =>
        prevItems.map(item => {
          if (item.id === id) {
            return { ...item, likes: item.likes + (isCurrentlyLiked ? -1 : 1) };
          }
          return item;
        })
      );
    },
    [likedIds]
  );

  const handleToggleSave = useCallback((id: string) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

      setItems(prev => [newLook, ...prev]);

      if (onSyncPostToSwarm) {
        onSyncPostToSwarm(newLook, newLook.igPostId || '');
      }

      if (onNotify) {
        onNotify('Instagram Art Synced', `Imported "${newLook.title}" directly to Nailix P2P Public Gallery.`);
      }
    },
    [onSyncPostToSwarm, onNotify]
  );

  return {
    items,
    setItems,
    likedIds,
    savedIds,
    selectedLightboxItem,
    openLightbox,
    closeLightbox,
    handleToggleLike,
    handleToggleSave,
    handleStartBookingWithLookFromLightbox,
    handleImportInstagramPost,
  };
}
