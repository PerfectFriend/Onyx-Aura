// =============================================================================
// [SIM] — PLACEHOLDER / SIMULATION
// This is NOT production crypto, NOT a real ledger, NOT a real P2P network.
// See MANIFEST_CANONICAL_AI_DEVELOPER.md Law 1, 7, 10.
// Generates local mock block heights and hashes using client-side SHA-256.
// =============================================================================

import { Review } from '../types';
import { computeSHA256 } from './cryptocloud';

export interface LedgerBlock {
  height: number;
  hash: string;
  parentHash: string;
  timestamp: string;
  txCount: number;
  validatorNode: string;
  stateMerkleRoot: string;
}

/**
 * [SIM] Simulated blockchain ledger for review integrity.
 */
export class BlockchainLedger {
  private currentHeight: number = 1849202;
  private lastBlockHash: string = '0x8a91bc7d0e1f23456789abcdef0123456789abcdef0123456789abcdef012345';

  public async createVerifiedReviewBlock(params: {
    artistId: string;
    artistName: string;
    clientName: string;
    clientAddress: string;
    rating: number;
    breakdown: {
      technique: number;
      hygiene: number;
      durability: number;
      precision: number;
    };
    text: string;
    bookingTxId: string;
  }): Promise<Review> {
    this.currentHeight += 1;
    const parentHash = this.lastBlockHash;
    const rawData = `${this.currentHeight}:${parentHash}:${params.artistId}:${params.clientAddress}:${params.rating}:${params.text}:${params.bookingTxId}`;
    const blockHash = await computeSHA256(rawData);
    this.lastBlockHash = blockHash;

    const newReview: Review = {
      id: `rev-${Date.now()}`,
      artistId: params.artistId,
      artistName: params.artistName,
      clientName: params.clientName,
      clientAddress: params.clientAddress,
      rating: params.rating,
      breakdown: params.breakdown,
      text: params.text,
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      blockHeight: this.currentHeight,
      blockHash,
      parentHash,
      verifiedBookingTx: params.bookingTxId,
      verifiedInPerson: true,
    };

    return newReview;
  }

  public getChainHeight(): number {
    return this.currentHeight;
  }

  public getLatestHash(): string {
    return this.lastBlockHash;
  }
}

export const blockchainLedger = new BlockchainLedger();
