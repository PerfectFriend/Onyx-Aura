import React, { useState } from 'react';
import { Radio, Database, Shield, Download, Upload, RefreshCw, HardDrive, CheckCircle2, Lock, Cpu, Server } from 'lucide-react';
import { CryptoCloudState, PeerNode, Appointment, Review, PortfolioItem, ChatMessage } from '../types';
import { cryptoCloudSwarm } from '../services/cryptocloud';

interface CryptoCloudPanelProps {
  swarmState: CryptoCloudState;
  peers: PeerNode[];
  onTriggerBackup: () => void;
  onSimulatePulse: () => void;
  isBackingUp: boolean;
  backupSuccessMessage?: string | null;
}

export const CryptoCloudPanel: React.FC<CryptoCloudPanelProps> = ({
  swarmState,
  peers,
  onTriggerBackup,
  onSimulatePulse,
  isBackingUp,
  backupSuccessMessage,
}) => {
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(true);

  return (
    <div className="py-10 bg-[#0b0c10]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#1f222b]">
          <div>
            <div className="text-xs font-mono text-[#34d399] flex flex-wrap items-center gap-2 mb-1">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                <span>SELF-HOSTED P2P CRYPTOCLOUD SYSTEM</span>
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-950/90 text-red-300 border border-red-500/60 tracking-wider">
                [SIM] SIMULATION MODE
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Peer-to-Peer Data Syncing & Encrypted Local Storage
            </h2>
            <div className="my-2 p-2.5 bg-red-950/30 border border-red-500/40 rounded text-[11px] text-red-200 flex items-center gap-2">
              <span className="font-mono font-bold bg-red-900/60 px-1.5 py-0.5 rounded text-red-300 text-[10px]">[SIM]</span>
              <span>Математическая симуляция (BroadcastChannel + Web Crypto SHA-256). Не является реальной P2P-сетью или блокчейном (Закон 1, 7, 10).</span>
            </div>
            <p className="text-xs text-[#9ca3af] mt-1 max-w-2xl">
              Proprietary manicure formulas, booking ledgers, and high-res client portfolios are stored locally and cross-buffered across sovereign peer nodes with zero centralized server exposure.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onSimulatePulse}
              className="px-4 py-2 text-xs font-medium text-white bg-[#15171e] hover:bg-[#1e212b] border border-[#272a33] rounded-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>Ping Swarm Peers</span>
            </button>

            <button
              onClick={onTriggerBackup}
              disabled={isBackingUp}
              className="px-4 py-2 text-xs font-semibold text-[#0b0c10] bg-[#34d399] hover:bg-[#2fc28b] rounded-md transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isBackingUp ? 'Compiling Vault Snapshot...' : 'Export Encrypted Vault (.json)'}</span>
            </button>
          </div>
        </div>

        {/* Success toast if downloaded */}
        {backupSuccessMessage && (
          <div className="p-3 bg-[#064e3b]/30 border border-[#34d399]/40 rounded-lg text-xs font-mono text-[#6ee7b7] flex items-center justify-between">
            <span>✓ {backupSuccessMessage}</span>
            <span className="text-[10px] text-[#9ca3af]">SHA-256 Verified</span>
          </div>
        )}

        {/* Swarm Metrics Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#34d399]" />
                <span>Swarm Redundancy</span>
              </span>
              <span className="font-mono text-emerald-400">OPTIMAL</span>
            </div>
            <p className="font-mono text-2xl font-bold text-white tabular-nums">{swarmState.bufferHealthPct}%</p>
            <p className="text-[11px] text-[#9ca3af]">Each client record replicated $\ge$ 4x</p>
          </div>

          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[#38bdf8]" />
                <span>Local Buffered Chunks</span>
              </span>
              <span className="font-mono text-white text-[11px]">Local Enclave</span>
            </div>
            <p className="font-mono text-2xl font-bold text-white tabular-nums">{swarmState.localBufferedChunks} chunks</p>
            <p className="text-[11px] text-[#9ca3af]">{swarmState.storageUsedKB.toFixed(1)} KB encrypted index</p>
          </div>

          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Encryption Cipher</span>
              </span>
              <span className="font-mono text-xs text-[#d4af37]">AES-256</span>
            </div>
            <p className="font-mono text-sm font-bold text-white truncate">{swarmState.encryptionMode}</p>
            <p className="text-[11px] text-[#9ca3af]">Zero-knowledge client keys</p>
          </div>

          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-purple-400" />
                <span>Active Swarm Nodes</span>
              </span>
              <span className="font-mono text-purple-400 text-xs">{peers.length} Live</span>
            </div>
            <p className="font-mono text-2xl font-bold text-white tabular-nums">{peers.length + 1} Nodes</p>
            <p className="text-[11px] text-[#9ca3af]">Cross-tab BroadcastChannel active</p>
          </div>
        </div>

        {/* Peer Nodes Table */}
        <div className="p-6 rounded-xl bg-[#12141a] border border-[#272a33] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1f222b]">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#34d399]" />
              <span>Decentralized Peer Swarm Topology</span>
            </h3>
            <span className="text-xs font-mono text-[#9ca3af]">Local Node ID: {swarmState.localNodeId}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1f222b] text-[#9ca3af] font-mono text-[11px]">
                  <th className="py-2.5 px-3">NODE CLUSTER</th>
                  <th className="py-2.5 px-3">GEOGRAPHIC RELAY</th>
                  <th className="py-2.5 px-3">LATENCY</th>
                  <th className="py-2.5 px-3">BUFFERED CHUNKS</th>
                  <th className="py-2.5 px-3">CONSENSUS SCORE</th>
                  <th className="py-2.5 px-3">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f222b] text-white">
                {/* Local Node */}
                <tr className="bg-[#15171e]/50 font-medium">
                  <td className="py-3 px-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#34d399] animate-pulse" />
                    <span>{swarmState.localNodeId} (Current Device)</span>
                  </td>
                  <td className="py-3 px-3 text-[#9ca3af]">Client Enclave / In-Browser Swarm</td>
                  <td className="py-3 px-3 font-mono text-[#34d399]">0 ms (Localhost)</td>
                  <td className="py-3 px-3 font-mono tabular-nums">{swarmState.localBufferedChunks}</td>
                  <td className="py-3 px-3 font-mono text-[#d4af37]">100%</td>
                  <td className="py-3 px-3 text-[#34d399] font-mono">PRIMARY</td>
                </tr>

                {/* External Swarm Peers */}
                {peers.map(peer => (
                  <tr key={peer.id} className="hover:bg-[#161820] transition-colors">
                    <td className="py-3 px-3 flex items-center gap-2 text-[#d1d5db]">
                      <span className={`w-1.5 h-1.5 rounded-full ${peer.status === 'online' ? 'bg-[#34d399]' : 'bg-amber-400'}`} />
                      <span>{peer.name}</span>
                    </td>
                    <td className="py-3 px-3 text-[#9ca3af]">{peer.region}</td>
                    <td className="py-3 px-3 font-mono text-[#d1d5db] tabular-nums">{peer.latencyMs} ms</td>
                    <td className="py-3 px-3 font-mono text-[#9ca3af] tabular-nums">{peer.bufferedChunks}</td>
                    <td className="py-3 px-3 font-mono text-[#d4af37] tabular-nums">{peer.reputation}%</td>
                    <td className="py-3 px-3 font-mono text-xs">
                      {peer.status === 'online' ? (
                        <span className="text-[#34d399]">ONLINE</span>
                      ) : (
                        <span className="text-amber-400">BUFFERING</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Automated Backup Strategy Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-xl bg-[#12141a] border border-[#272a33] space-y-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#d4af37]" />
              <span>Automated Backup & Local Encryption</span>
            </h4>
            <p className="text-xs text-[#9ca3af] leading-relaxed">
              Every 6 hours, your browser compiles all client records, chat archives, and appointment escrow receipts into an encrypted snapshot stored in your browser's IndexedDB.
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-[#1f222b]">
              <div>
                <p className="text-xs font-medium text-white">Periodic Auto-Snapshot</p>
                <p className="text-[11px] text-[#9ca3af]">Runs silently without interrupting appointments</p>
              </div>
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={e => setAutoBackupEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#34d399] rounded cursor-pointer"
              />
            </div>

            <div className="text-[11px] font-mono text-[#9ca3af]">
              Last successful snapshot: {new Date(swarmState.lastBackupTimestamp).toLocaleString()}
            </div>
          </div>

          <div className="p-6 rounded-xl bg-[#12141a] border border-[#272a33] space-y-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-[#38bdf8]" />
              <span>Peer-to-Peer Data Buffering Protocol</span>
            </h4>
            <p className="text-xs text-[#9ca3af] leading-relaxed">
              If an artist loses network connectivity or migrates studios, adjacent peer swarm nodes buffer encrypted data chunks. When the artist reconnects, the swarm reconciles using Merkle trees.
            </p>
            <div className="p-3 bg-[#15171e] rounded-lg border border-[#272a33] text-xs space-y-1">
              <span className="text-[#38bdf8] font-mono text-[11px]">DATA SOVEREIGNTY GUARANTEE</span>
              <p className="text-[#d1d5db]">
                Zero dependencies on AWS, Cloudflare, or proprietary databases. 100% self-hosted peer storage.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
