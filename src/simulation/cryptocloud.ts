// =============================================================================
// [SIM] — PLACEHOLDER / SIMULATION
// This is NOT production crypto, NOT a real ledger, NOT a real P2P network.
// See MANIFEST_CANONICAL_AI_DEVELOPER.md Law 1, 7, 10.
// Uses local Web Crypto SHA-256 and BroadcastChannel across same-origin tabs.
// =============================================================================

import { CryptoCloudState, PeerNode, Appointment, Review, PortfolioItem, ChatMessage } from '../types';
import { INITIAL_PEERS } from '../data/initialData';

const SWARM_CHANNEL_NAME = 'onyx_cryptocloud_swarm_v1';

/**
 * Web Crypto SHA-256 helper with explicit fallback signaling (K-03).
 */
export async function computeSHA256Detailed(message: string): Promise<{ hash: string; isRealSha256: boolean }> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return {
        hash: '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join(''),
        isRealSha256: true,
      };
    } catch {
      // Fallback below
    }
  }
  // Explicit 32-bit pseudohash fallback when Web Crypto subtle is unavailable (e.g. non-HTTPS local IP)
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return {
    hash: '0xSIM_PSEUDO_' + Math.abs(hash).toString(16).padStart(16, '0'),
    isRealSha256: false,
  };
}

/**
 * Convenience string wrapper over computeSHA256Detailed.
 */
export async function computeSHA256(message: string): Promise<string> {
  const { hash } = await computeSHA256Detailed(message);
  return hash;
}

/**
 * [SIM] In-browser simulated P2P engine.
 * Emulates node discovery, peer broadcast and sync via BroadcastChannel.
 */
export class CryptoCloudEngine {
  private channel: BroadcastChannel | null = null;
  private listeners: ((event: { type: string; payload: unknown }) => void)[] = [];
  private state: CryptoCloudState;

  constructor() {
    const randomNodeSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.state = {
      localNodeId: `NODE-LOCAL-${randomNodeSuffix}`,
      connectedPeers: INITIAL_PEERS,
      bufferHealthPct: 99.8,
      totalSyncedBlocks: 1849202,
      localBufferedChunks: 412,
      storageUsedKB: 842.6,
      encryptionMode: 'Local Session JSON [SIM]',
      autoBackupIntervalHours: 6,
      lastBackupTimestamp: new Date().toISOString(),
    };

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(SWARM_CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          this.handleIncomingPeerMessage(event.data);
        };
      } catch (err) {
        console.warn('[SIM] BroadcastChannel unavailable, running single-node mode', err);
      }
    }
  }

  public getState(): CryptoCloudState {
    return { ...this.state };
  }

  public subscribe(cb: (event: { type: string; payload: unknown }) => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  public destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners = [];
  }

  private emit(event: { type: string; payload: unknown }) {
    this.listeners.forEach(cb => {
      try {
        cb(event);
      } catch (e) {
        console.error('[SIM] Error in crypto swarm listener', e);
      }
    });
  }

  private handleIncomingPeerMessage(data: { type: string; payload: unknown; senderNode: string }) {
    if (data.senderNode === this.state.localNodeId) return;

    // Simulate peer buffer sync
    this.state.localBufferedChunks += 1;
    this.state.storageUsedKB += 1.4;
    this.emit({ type: 'PEER_SYNC_RECEIVED', payload: data });
  }

  public broadcastBlock<T>(type: string, payload: T) {
    const packet = {
      type,
      payload,
      senderNode: this.state.localNodeId,
      timestamp: Date.now(),
    };

    if (this.channel) {
      this.channel.postMessage(packet);
    }

    this.state.localBufferedChunks += 1;
    this.state.totalSyncedBlocks += 1;
    this.emit({ type: 'BLOCK_BROADCAST', payload });
  }

  // [SIM] Export a plaintext session JSON snapshot with integrity checksum (no encryption)
  public async exportSessionSnapshot(data: {
    appointments: Appointment[];
    reviews: Review[];
    portfolio: PortfolioItem[];
    chats: ChatMessage[];
  }): Promise<{ filename: string; blob: Blob; checksum: string; isRealSha256: boolean }> {
    const snapshot = {
      system: 'Nailix Session Snapshot [SIMULATED]',
      notice: '[SIM] Plaintext JSON export for demo inspection. Not encrypted.',
      generatedAt: new Date().toISOString(),
      nodeId: this.state.localNodeId,
      architecture: 'Hybrid: Open Public Nail Art Gallery + Local Session State Snapshot [SIM]',
      payload: {
        publicArtGallery: data.portfolio,
        clientBookings: data.appointments,
        demoReviews: data.reviews,
        sessionChatsPlaintext: data.chats,
      },
    };

    const serialized = JSON.stringify(snapshot, null, 2);
    const { hash: checksum, isRealSha256 } = await computeSHA256Detailed(serialized);
    const enriched = JSON.stringify(
      { ...snapshot, integrityChecksum: checksum, isRealSha256 },
      null,
      2
    );

    const blob = new Blob([enriched], { type: 'application/json' });
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `nailix_session_snapshot_${dateStr}_${this.state.localNodeId.toLowerCase()}.sim.json`;

    this.state.lastBackupTimestamp = new Date().toISOString();
    return { filename, blob, checksum, isRealSha256 };
  }

  // Simulated peer swarm pulse
  public simulatePeerPing(): PeerNode[] {
    this.state.connectedPeers = this.state.connectedPeers.map(peer => {
      const jitter = (Math.random() - 0.5) * 4;
      return {
        ...peer,
        latencyMs: Math.max(8, Math.round(peer.latencyMs + jitter)),
        bufferedChunks: peer.bufferedChunks + Math.floor(Math.random() * 3),
        status: Math.random() > 0.03 ? 'online' : 'syncing',
      };
    });
    return [...this.state.connectedPeers];
  }
}

export const cryptoCloudSwarm = new CryptoCloudEngine();
