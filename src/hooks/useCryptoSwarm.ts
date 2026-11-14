// =============================================================================
// [SIM] — PLACEHOLDER / SIMULATION
// This hook encapsulates state and operations for the simulated CryptoCloud P2P Swarm.
// See MANIFEST_CANONICAL_AI_DEVELOPER.md Law 1, 7, 10.
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CryptoCloudState, Appointment, Review, PortfolioItem, ChatMessage } from '../types';
import { cryptoCloudSwarm } from '../simulation/cryptocloud';

export interface CryptoCloudBackupPayload {
  appointments: Appointment[];
  reviews: Review[];
  portfolio: PortfolioItem[];
  chats: ChatMessage[];
}

export function useCryptoSwarm() {
  const [swarmState, setSwarmState] = useState<CryptoCloudState>(() => cryptoCloudSwarm.getState());
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null);

  const peers = swarmState.connectedPeers;

  // Subscribe to simulated BroadcastChannel events on mount
  useEffect(() => {
    const unsubSwarm = cryptoCloudSwarm.subscribe(() => {
      setSwarmState(cryptoCloudSwarm.getState());
    });

    return () => {
      unsubSwarm();
    };
  }, []);

  // Compute number of online peers + local node
  const swarmOnlineCount = useMemo(() => {
    return peers.filter(p => p.status === 'online').length + 1;
  }, [peers]);

  // Export plaintext JSON session snapshot [SIM]
  const handleExportCryptoCloudBackup = useCallback(async (data: CryptoCloudBackupPayload) => {
    setIsBackingUp(true);
    setBackupSuccessMessage(null);
    try {
      const { filename, blob, checksum, isRealSha256 } = await cryptoCloudSwarm.exportSessionSnapshot(data);

      // Trigger client file download
      if (typeof window !== 'undefined') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      const hashKind = isRealSha256 ? 'Web Crypto SHA-256' : '[SIM] Pseudohash (non-HTTPS)';
      setBackupSuccessMessage(
        `[SIM] Exported plaintext JSON snapshot ${filename}. ${hashKind}: ${checksum.slice(0, 16)}...`
      );
      setSwarmState(cryptoCloudSwarm.getState());
    } finally {
      setIsBackingUp(false);
    }
  }, []);

  // Simulate P2P Swarm Network Pulse [SIM]
  const handleSimulatePeerPulse = useCallback(() => {
    cryptoCloudSwarm.simulatePeerPing();
    setSwarmState(cryptoCloudSwarm.getState());
  }, []);

  // Broadcast block helper to encapsulate swarm engine calls
  const broadcastBlock = useCallback(<T>(blockType: string, payload: T) => {
    cryptoCloudSwarm.broadcastBlock(blockType, payload);
    setSwarmState(cryptoCloudSwarm.getState());
  }, []);

  return {
    swarmState,
    peers,
    isBackingUp,
    backupSuccessMessage,
    swarmOnlineCount,
    handleExportCryptoCloudBackup,
    handleSimulatePeerPulse,
    broadcastBlock,
  };
}
