// =============================================================================
// [SIM] — PLACEHOLDER / SIMULATION
// This hook encapsulates state and operations for the simulated CryptoCloud P2P Swarm.
// See MANIFEST_CANONICAL_AI_DEVELOPER.md Law 1, 7, 10.
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CryptoCloudState, PeerNode, Appointment, Review, PortfolioItem, ChatMessage } from '../types';
import { INITIAL_PEERS } from '../data/initialData';
import { cryptoCloudSwarm } from '../simulation/cryptocloud';

export interface CryptoCloudBackupPayload {
  appointments: Appointment[];
  reviews: Review[];
  portfolio: PortfolioItem[];
  chats: ChatMessage[];
}

export function useCryptoSwarm() {
  const [swarmState, setSwarmState] = useState<CryptoCloudState>(() => cryptoCloudSwarm.getState());
  const [peers, setPeers] = useState<PeerNode[]>(INITIAL_PEERS);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null);

  // Subscribe to swarm events (peer pulses, broadcast blocks) on mount
  useEffect(() => {
    const unsubSwarm = cryptoCloudSwarm.subscribe((event) => {
      const state = cryptoCloudSwarm.getState();
      setSwarmState(state);
      if (event.type === 'PEER_PULSE') {
        setPeers(state.connectedPeers);
      }
    });

    return () => {
      unsubSwarm();
    };
  }, []);

  // Compute number of online peers + local node
  const swarmOnlineCount = useMemo(() => {
    return peers.filter(p => p.status === 'online').length + 1;
  }, [peers]);

  // Export encrypted backup snapshot [SIM]
  const handleExportCryptoCloudBackup = useCallback(async (data: CryptoCloudBackupPayload) => {
    setIsBackingUp(true);
    setBackupSuccessMessage(null);
    try {
      const { filename, blob, checksum } = await cryptoCloudSwarm.exportCryptographicBackup(data);

      // Trigger client file download
      if (typeof window !== 'undefined') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setBackupSuccessMessage(`Successfully saved ${filename}. Checksum: ${checksum.slice(0, 16)}...`);
      setSwarmState(cryptoCloudSwarm.getState());
    } finally {
      setIsBackingUp(false);
    }
  }, []);

  // Simulate P2P Swarm Network Pulse [SIM]
  const handleSimulatePeerPulse = useCallback(() => {
    const updatedPeers = cryptoCloudSwarm.simulatePeerPing();
    setPeers(updatedPeers);
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
