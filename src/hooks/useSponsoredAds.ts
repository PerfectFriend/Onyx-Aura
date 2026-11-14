import { useState, useCallback, useRef, useEffect } from 'react';
import { SponsoredAd } from '../types';
import { createSeedSnapshot } from '../infrastructure/storage/salonRepository';

export interface UseSponsoredAdsOptions {
  initialAds?: SponsoredAd[];
  onBroadcastToSwarm?: (type: string, payload: unknown) => void;
  onPersistAds?: (ads: SponsoredAd[], payload: unknown) => void;
}

export function useSponsoredAds({
  initialAds,
  onBroadcastToSwarm,
  onPersistAds,
}: UseSponsoredAdsOptions = {}) {
  const [ads, setAds] = useState<SponsoredAd[]>(
    () => initialAds ?? createSeedSnapshot().ads
  );
  const adsRef = useRef<SponsoredAd[]>(ads);

  useEffect(() => {
    adsRef.current = ads;
  }, [ads]);

  const [isAdManagerOpen, setIsAdManagerOpen] = useState<boolean>(false);

  const openAdManager = useCallback(() => {
    setIsAdManagerOpen(true);
  }, []);

  const closeAdManager = useCallback(() => {
    setIsAdManagerOpen(false);
  }, []);

  const handleCreateAdCampaign = useCallback(
    (newAd: SponsoredAd) => {
      const nextAds = [newAd, ...adsRef.current];
      adsRef.current = nextAds;
      setAds(nextAds);

      onPersistAds?.(nextAds, {
        adId: newAd.id,
        title: newAd.title,
        brandName: newAd.brandName,
      });

      onBroadcastToSwarm?.('NEW_SPONSORED_CAMPAIGN', {
        adId: newAd.id,
        title: newAd.title,
        brandName: newAd.brandName,
        target: newAd.targetAudience,
      });
    },
    [onBroadcastToSwarm, onPersistAds]
  );

  return {
    ads,
    setAds,
    isAdManagerOpen,
    setIsAdManagerOpen,
    openAdManager,
    closeAdManager,
    handleCreateAdCampaign,
  };
}
