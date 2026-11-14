import { useState, useCallback } from 'react';
import { SponsoredAd } from '../types';
import { INITIAL_SPONSORED_ADS } from '../data/advertisements';

export interface UseSponsoredAdsOptions {
  initialAds?: SponsoredAd[];
  onBroadcastToSwarm?: (type: string, payload: unknown) => void;
}

export function useSponsoredAds({
  initialAds = INITIAL_SPONSORED_ADS,
  onBroadcastToSwarm,
}: UseSponsoredAdsOptions = {}) {
  const [ads, setAds] = useState<SponsoredAd[]>(initialAds);
  const [isAdManagerOpen, setIsAdManagerOpen] = useState<boolean>(false);

  const openAdManager = useCallback(() => {
    setIsAdManagerOpen(true);
  }, []);

  const closeAdManager = useCallback(() => {
    setIsAdManagerOpen(false);
  }, []);

  const handleCreateAdCampaign = useCallback(
    (newAd: SponsoredAd) => {
      setAds(prev => [newAd, ...prev]);

      if (onBroadcastToSwarm) {
        onBroadcastToSwarm('NEW_SPONSORED_CAMPAIGN', {
          adId: newAd.id,
          title: newAd.title,
          brandName: newAd.brandName,
          target: newAd.targetAudience,
        });
      }
    },
    [onBroadcastToSwarm]
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
