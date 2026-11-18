// =============================================================================
// Stage 4 · Sprint 4.4 — Canonical Server/Client Service Catalog & Deposit Quotes
// - Authoritative USD pricing lookup table shared by backend checkout endpoint
//   and tests so the server NEVER accepts client-submitted `amountUsd` (Q-03).
// - Zero UI or [SIM] imports (Manifest Law 2).
// =============================================================================

import { toMinorUnits } from './payments';

export interface CanonicalServiceCatalogEntry {
  artistId: string;
  artistName: string;
  serviceId: string;
  serviceName: string;
  priceUsd: number;
}

export const ALLOWED_TIP_PERCENTAGES = [0, 15, 18, 22] as const;
export type AllowedTipPercentage = (typeof ALLOWED_TIP_PERCENTAGES)[number];

export const CANONICAL_SERVICE_CATALOG: readonly CanonicalServiceCatalogEntry[] = [
  {
    artistId: 'artist-1',
    artistName: 'Elena Vasiliev',
    serviceId: 'srv-1',
    serviceName: 'Sculptural 3D Liquid Chrome Couture',
    priceUsd: 165,
  },
  {
    artistId: 'artist-1',
    artistName: 'Elena Vasiliev',
    serviceId: 'srv-2',
    serviceName: 'Russian E-File Precision Restructure',
    priceUsd: 110,
  },
  {
    artistId: 'artist-1',
    artistName: 'Elena Vasiliev',
    serviceId: 'srv-3',
    serviceName: 'Baroque Gold Leaf & Obsidian Glass',
    priceUsd: 190,
  },
  {
    artistId: 'artist-2',
    artistName: 'Chloe Chen (陳美華)',
    serviceId: 'srv-4',
    serviceName: 'Japanese Glass Aura & Lilac Gradient',
    priceUsd: 140,
  },
  {
    artistId: 'artist-2',
    artistName: 'Chloe Chen (陳美華)',
    serviceId: 'srv-5',
    serviceName: 'Magnetic Velvet Cat-Eye Mirage',
    priceUsd: 125,
  },
  {
    artistId: 'artist-2',
    artistName: 'Chloe Chen (陳美華)',
    serviceId: 'srv-6',
    serviceName: 'Architectural Polygel Glass Extensions',
    priceUsd: 175,
  },
  {
    artistId: 'artist-3',
    artistName: 'Maya Dupont',
    serviceId: 'srv-7',
    serviceName: 'Editorial Negative Space French Noir',
    priceUsd: 135,
  },
  {
    artistId: 'artist-3',
    artistName: 'Maya Dupont',
    serviceId: 'srv-8',
    serviceName: 'Gothic Obsidian & Liquid Mercury Drops',
    priceUsd: 180,
  },
  {
    artistId: 'artist-4',
    artistName: 'Mateo Rossi',
    serviceId: 'srv-9',
    serviceName: 'Royal Trencadís Mosaic Couture',
    priceUsd: 185,
  },
  {
    artistId: 'artist-4',
    artistName: 'Mateo Rossi',
    serviceId: 'srv-10',
    serviceName: 'Celestial Night Swirl Sculpt',
    priceUsd: 170,
  },
];

export function isAllowedTipPercentage(pct: unknown): pct is AllowedTipPercentage {
  return (
    typeof pct === 'number' &&
    Number.isInteger(pct) &&
    (ALLOWED_TIP_PERCENTAGES as readonly number[]).includes(pct)
  );
}

export interface AuthoritativeDepositQuote {
  artistId: string;
  artistName: string;
  serviceId: string;
  serviceName: string;
  basePriceUsd: number;
  tipPercentage: AllowedTipPercentage;
  tipAmountUsd: number;
  totalUsd: number;
  amountMinor: number;
}

export function resolveAuthoritativeDepositQuote(params: {
  artistId: string;
  serviceId: string;
  tipPercentage?: number;
  catalog?: readonly CanonicalServiceCatalogEntry[];
}):
  | { ok: true; quote: AuthoritativeDepositQuote }
  | { ok: false; error: string } {
  const catalog = params.catalog ?? CANONICAL_SERVICE_CATALOG;
  const entry = catalog.find(
    item => item.artistId === params.artistId && item.serviceId === params.serviceId
  );

  if (!entry) {
    return {
      ok: false,
      error: `Unknown catalog combination (${params.artistId} / ${params.serviceId}).`,
    };
  }

  const tipPct = params.tipPercentage ?? 0;
  if (!isAllowedTipPercentage(tipPct)) {
    return {
      ok: false,
      error: `Invalid tipPercentage (${String(tipPct)}). Allowed values: ${ALLOWED_TIP_PERCENTAGES.join(', ')}.`,
    };
  }

  const tipAmountUsd = Math.round((entry.priceUsd * tipPct) / 100);
  const totalUsd = entry.priceUsd + tipAmountUsd;
  const amountMinor = toMinorUnits(totalUsd);

  return {
    ok: true,
    quote: {
      artistId: entry.artistId,
      artistName: entry.artistName,
      serviceId: entry.serviceId,
      serviceName: entry.serviceName,
      basePriceUsd: entry.priceUsd,
      tipPercentage: tipPct,
      tipAmountUsd,
      totalUsd,
      amountMinor,
    },
  };
}
