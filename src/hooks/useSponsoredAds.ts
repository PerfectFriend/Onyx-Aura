import { useState, useCallback, useRef, useEffect } from 'react';
import { SponsoredAd } from '../types';
import { createSeedSnapshot } from '../infrastructure/storage/salonRepository';

export interface UseSponsoredAdsOptions {
  initialAds?: SponsoredAd[];
  externalRevision?: number;
  onBroadcastToSwarm?: (type: string, payload: unknown) => void;
  onPersistAds?: (ads: SponsoredAd[], payload: unknown) => Promise<void> | void;
}

export function useSponsoredAds({
  initialAds,
  externalRevision = 0,
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

  useEffect(() => {
    if (externalRevision > 0 && initialAds) {
      adsRef.current = initialAds;
      setAds(initialAds);
    }
  }, [externalRevision, initialAds]);

  const [isAdManagerOpen, setIsAdManagerOpen] = useState<boolean>(false);

  const openAdManager = useCallback(() => {
    setIsAdManagerOpen(true);
  }, []);

  const closeAdManager = useCallback(() => {
    setIsAdManagerOpen(false);
  }, []);

  const handleCreateAdCampaign = useCallback(
    (newAd: SponsoredAd) => {
      const taggedAd: SponsoredAd = { ...newAd, origin: 'user' };
      const nextAds = [taggedAd, ...adsRef.current];
      adsRef.current = nextAds;
      setAds(nextAds);

      void Promise.resolve(
        onPersistAds?.(nextAds, {
          adId: taggedAd.id,
          title: taggedAd.title,
          brandName: taggedAd.brandName,
        })
      ).catch(err => {
        console.warn('[Ads] Persist failed cleanly:', err);
      });

      onBroadcastToSwarm?.('NEW_SPONSORED_CAMPAIGN', {
        adId: taggedAd.id,
        title: taggedAd.title,
        brandName: taggedAd.brandName,
        target: taggedAd.targetAudience,
      });
    },
    [onBroadcastToSwarm, onPersistAds]
  );

  return {
    ads,
    isAdManagerOpen,
    setIsAdManagerOpen,
    openAdManager,
    closeAdManager,
    handleCreateAdCampaign,
  };
}
