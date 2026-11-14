import React, { useState } from 'react';
import { Radio, Shield, Download, RefreshCw, HardDrive, Lock, Cpu, Server } from 'lucide-react';
import { CryptoCloudState, PeerNode } from '../types';

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
                <span>CRYPTOCLOUD SWARM SIMULATOR</span>
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-950/90 text-red-300 border border-red-500/60 tracking-wider">
                [SIM] SIMULATION MODE
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Cross-Tab BroadcastChannel & Plaintext JSON Export [SIM]
            </h2>
            <div className="my-2 p-2.5 bg-red-950/30 border border-red-500/40 rounded text-[11px] text-red-200 flex items-center gap-2">
              <span className="font-mono font-bold bg-red-900/60 px-1.5 py-0.5 rounded text-red-300 text-[10px]">
                [SIM]
              </span>
              <span>
                [SIM] Математическая симуляция (BroadcastChannel + Web Crypto SHA-256) — не реальный P2P, шифрование или блокчейн (Закон 1, 7, 10).
              </span>
            </div>
            <p className="text-xs text-[#9ca3af] mt-1 max-w-2xl">
              [SIM] Inspect in-browser node telemetry and download a plaintext JSON session snapshot with a SHA-256 checksum for verification.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onSimulatePulse}
              className="px-4 py-2 text-xs font-medium text-white bg-[#15171e] hover:bg-[#1e212b] border border-[#272a33] rounded-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>Ping Demo Peers [SIM]</span>
            </button>

            <button
              onClick={onTriggerBackup}
              disabled={isBackingUp}
              className="px-4 py-2 text-xs font-semibold text-[#0b0c10] bg-[#34d399] hover:bg-[#2fc28b] rounded-md transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isBackingUp ? 'Compiling JSON Snapshot...' : 'Export Plaintext JSON [SIM]'}</span>
            </button>
          </div>
        </div>

        {/* Success toast if downloaded */}
        {backupSuccessMessage && (
          <div className="p-3 bg-[#064e3b]/30 border border-[#34d399]/40 rounded-lg text-xs font-mono text-[#6ee7b7] flex items-center justify-between">
            <span>✓ {backupSuccessMessage}</span>
            <span className="text-[10px] text-[#9ca3af]">Plaintext JSON Export</span>
          </div>
        )}

        {/* Swarm Metrics Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#34d399]" />
                <span>Demo Health [SIM]</span>
              </span>
              <span className="font-mono text-emerald-400">SIMULATED</span>
            </div>
            <p className="font-mono text-2xl font-bold text-white tabular-nums">{swarmState.bufferHealthPct}%</p>
            <p className="text-[11px] text-[#9ca3af]">[SIM] Local session buffer counter</p>
          </div>

          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[#38bdf8]" />
                <span>Session Events [SIM]</span>
              </span>
              <span className="font-mono text-white text-[11px]">Browser Tab</span>
            </div>
            <p className="font-mono text-2xl font-bold text-white tabular-nums">{swarmState.localBufferedChunks} events</p>
            <p className="text-[11px] text-[#9ca3af]">{swarmState.storageUsedKB.toFixed(1)} KB simulated buffer</p>
          </div>

          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Transport Mode</span>
              </span>
              <span className="font-mono text-xs text-red-300">[SIM] PLAINTEXT</span>
            </div>
            <p className="font-mono text-sm font-bold text-white truncate">{swarmState.encryptionMode}</p>
            <p className="text-[11px] text-[#9ca3af]">SHA-256 digest · No encryption yet</p>
          </div>

          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-purple-400" />
                <span>Mock Swarm Nodes [SIM]</span>
              </span>
              <span className="font-mono text-purple-400 text-xs">{peers.length} Seed</span>
            </div>
            <p className="font-mono text-2xl font-bold text-white tabular-nums">{peers.length + 1} Nodes</p>
            <p className="text-[11px] text-[#9ca3af]">BroadcastChannel across same-origin tabs</p>
          </div>
        </div>

        {/* Peer Nodes Table */}
        <div className="p-6 rounded-xl bg-[#12141a] border border-[#272a33] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1f222b]">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#34d399]" />
              <span>Simulated Node Topology [SIM]</span>
            </h3>
            <span className="text-xs font-mono text-[#9ca3af]">Local Node ID: {swarmState.localNodeId}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1f222b] text-[#9ca3af] font-mono text-[11px]">
                  <th className="py-2.5 px-3">NODE CLUSTER [SIM]</th>
                  <th className="py-2.5 px-3">REGION LABEL</th>
                  <th className="py-2.5 px-3">MOCK LATENCY</th>
                  <th className="py-2.5 px-3">CHUNKS</th>
                  <th className="py-2.5 px-3">SCORE</th>
                  <th className="py-2.5 px-3">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f222b] text-white">
                <tr className="bg-[#15171e]/50 font-medium">
                  <td className="py-3 px-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#34d399] animate-pulse" />
                    <span>{swarmState.localNodeId} (This Browser Tab)</span>
                  </td>
                  <td className="py-3 px-3 text-[#9ca3af]">In-Memory BroadcastChannel [SIM]</td>
                  <td className="py-3 px-3 font-mono text-[#34d399]">0 ms (Local)</td>
                  <td className="py-3 px-3 font-mono tabular-nums">{swarmState.localBufferedChunks}</td>
                  <td className="py-3 px-3 font-mono text-[#d4af37]">100%</td>
                  <td className="py-3 px-3 text-[#34d399] font-mono">LOCAL</td>
                </tr>

                {peers.map(peer => (
                  <tr key={peer.id} className="hover:bg-[#161820] transition-colors">
                    <td className="py-3 px-3 flex items-center gap-2 text-[#d1d5db]">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          peer.status === 'online' ? 'bg-[#34d399]' : 'bg-amber-400'
                        }`}
                      />
                      <span>{peer.name}</span>
                    </td>
                    <td className="py-3 px-3 text-[#9ca3af]">{peer.region}</td>
                    <td className="py-3 px-3 font-mono text-[#d1d5db] tabular-nums">{peer.latencyMs} ms</td>
                    <td className="py-3 px-3 font-mono text-[#9ca3af] tabular-nums">{peer.bufferedChunks}</td>
                    <td className="py-3 px-3 font-mono text-[#d4af37] tabular-nums">{peer.reputation}%</td>
                    <td className="py-3 px-3 font-mono text-xs">
                      {peer.status === 'online' ? (
                        <span className="text-[#34d399]">ONLINE [SIM]</span>
                      ) : (
                        <span className="text-amber-400">SYNCING [SIM]</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Snapshot Strategy Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-xl bg-[#12141a] border border-[#272a33] space-y-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#d4af37]" />
              <span>Manual Plaintext JSON Export [SIM]</span>
            </h4>
            <p className="text-xs text-[#9ca3af] leading-relaxed">
              [SIM] Generates a human-readable `.sim.json` snapshot of current in-memory bookings, reviews, gallery items, and chat logs with a SHA-256 checksum. IndexedDB persistence arrives in Stage 2.
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-[#1f222b]">
              <div>
                <p className="text-xs font-medium text-white">Auto-Reminder Toggle (Demo UI)</p>
                <p className="text-[11px] text-[#9ca3af]">Shows export readiness status in UI</p>
              </div>
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={e => setAutoBackupEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#34d399] rounded cursor-pointer"
              />
            </div>

            <div className="text-[11px] font-mono text-[#9ca3af]">
              Last snapshot check: {new Date(swarmState.lastBackupTimestamp).toLocaleString()}
            </div>
          </div>

          <div className="p-6 rounded-xl bg-[#12141a] border border-[#272a33] space-y-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-[#38bdf8]" />
              <span>Same-Origin Tab Sync (BroadcastChannel) [SIM]</span>
            </h4>
            <p className="text-xs text-[#9ca3af] leading-relaxed">
              [SIM] Uses browser `BroadcastChannel` (`onyx_cryptocloud_swarm_v1`) to signal simulated events across tabs on the same device. Multi-device P2P transport is planned for Stage 4–5.
            </p>
            <div className="p-3 bg-[#15171e] rounded-lg border border-red-500/30 text-xs space-y-1">
              <span className="text-red-300 font-mono text-[11px]">TRANSPARENCY NOTICE [SIM]</span>
              <p className="text-[#d1d5db]">
                Public assets are bundled locally in PWA cache. Session data is plaintext in memory until Stage 2 IndexedDB & Stage 3 Passkeys.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
