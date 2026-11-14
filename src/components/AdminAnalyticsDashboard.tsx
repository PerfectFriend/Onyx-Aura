import React, { useState } from 'react';
import {
  TrendingUp, DollarSign, Calendar, Users, Download, FileText, CheckCircle2,
  ShieldCheck, Sparkles
} from 'lucide-react';
import { Appointment, Artist } from '../types';
import { CalendarSyncButtons } from './CalendarSyncButtons';
import { downloadAllAppointmentsIcs } from '../utils/calendarSync';

interface AdminAnalyticsDashboardProps {
  appointments: Appointment[];
  artists: Artist[];
  onReleaseEscrow: (appointmentId: string) => void;
  onTriggerReminder: (appointment: Appointment, type: '24h' | '2h') => void;
}

export const AdminAnalyticsDashboard: React.FC<AdminAnalyticsDashboardProps> = ({
  appointments,
  artists,
  onReleaseEscrow,
  onTriggerReminder,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Compute key analytics
  const totalGrossVolume = appointments.reduce((sum, apt) => sum + apt.price, 0) + 12840; // Base + current
  const totalCompleted = appointments.filter(a => a.status === 'completed').length + 84;
  const escrowLockedCount = appointments.filter(a => a.status === 'escrow_locked').length;
  const avgTicket = Math.round(totalGrossVolume / (totalCompleted + escrowLockedCount || 1));
  const retentionRate = 89.4;

  const filteredAppointments = filterStatus === 'all'
    ? appointments
    : appointments.filter(a => a.status === filterStatus);

  // Generate downloadable CSV Financial Audit Report
  const handleExportCSV = () => {
    const headers = [
      'Appointment ID',
      'Client Name',
      'Client Contact',
      'Master Artist',
      'Haute Service',
      'Date',
      'Time',
      'Gross Amount (USD)',
      'Payment Currency',
      'Escrow Status',
      'Escrow Tx Hash',
      'Created Timestamp'
    ];

    const rows = appointments.map(apt => [
      apt.id,
      `"${apt.clientName}"`,
      `"${apt.clientPhone}"`,
      `"${apt.artistName}"`,
      `"${apt.serviceName}"`,
      apt.date,
      apt.timeSlot,
      apt.price,
      apt.currency,
      apt.status,
      apt.escrowTxHash || 'N/A',
      apt.createdAt,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `onyx_financial_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate Printable Detailed Financial Statement
  const handleExportStatement = () => {
    const win = window.open('', '_blank');
    if (!win) return;

    const reportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Nailix Financial Statement - ${new Date().toLocaleDateString()}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #111; }
          h1 { margin-bottom: 4px; font-size: 24px; }
          .header-meta { font-size: 13px; color: #666; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
          th, td { border-bottom: 1px solid #ddd; padding: 10px 8px; text-align: left; }
          th { background: #f8f9fa; font-weight: 600; }
          .amount { text-align: right; font-family: monospace; }
          .summary-card { background: #f8f9fa; padding: 16px; border-radius: 6px; margin-bottom: 24px; display: flex; gap: 32px; }
        </style>
      </head>
      <body>
        <h1>ONYX & AURA · STUDIO SESSION REPORT [DEMO / LOCAL_ONLY]</h1>
        <div class="header-meta">
          Local Session Booking & Deposit Simulation [SIM] · Generated on ${new Date().toLocaleString()}
        </div>

        <div class="summary-card">
          <div>
            <strong>Gross Studio Volume:</strong>
            <div>$${totalGrossVolume.toLocaleString()} USD</div>
          </div>
          <div>
            <strong>Active Escrow Deposits:</strong>
            <div>${escrowLockedCount} Appointments</div>
          </div>
          <div>
            <strong>Client Retention:</strong>
            <div>${retentionRate}%</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Client</th>
              <th>Artist</th>
              <th>Service</th>
              <th>Date</th>
              <th>Status</th>
              <th class="amount">Gross Amount</th>
            </tr>
          </thead>
          <tbody>
            ${appointments.map(a => `
              <tr>
                <td>${a.id}</td>
                <td>${a.clientName}</td>
                <td>${a.artistName}</td>
                <td>${a.serviceName}</td>
                <td>${a.date} ${a.timeSlot}</td>
                <td>${a.status.toUpperCase()}</td>
                <td class="amount">$${a.price}.00 ${a.currency}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="margin-top: 30px; font-size: 11px; color: #888;">
          [SIM] Demo report generated from in-memory session appointments. Not an official accounting or payment ledger.
        </div>
      </body>
      </html>
    `;

    win.document.write(reportHTML);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 400);
  };

  return (
    <div className="py-10 bg-[#0b0c10]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#1f222b]">
          <div>
            <div className="text-xs font-mono text-[#d4af37] flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>BUSINESS PERFORMANCE & FINANCIAL INTELLIGENCE</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Studio Analytics & Deposit Simulation [LOCAL_ONLY · SIM]
            </h2>
            <p className="text-xs text-[#9ca3af] mt-1 max-w-2xl">
              Review session booking figures (seed baseline + live demo actions), test in-app reminder previews [SIM], and export real RFC 5545 `.ics` or CSV reports.
            </p>
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportStatement}
              className="px-4 py-2 text-xs font-medium text-white bg-[#15171e] hover:bg-[#1e212b] border border-[#272a33] rounded-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>Print Financial Audit</span>
            </button>

            <button
              onClick={() => downloadAllAppointmentsIcs(appointments, artists)}
              className="px-4 py-2 text-xs font-semibold text-[#d4af37] bg-[#d4af37]/10 hover:bg-[#d4af37]/20 border border-[#d4af37]/30 rounded-md transition-all flex items-center gap-2 cursor-pointer"
              title="Download all appointments as standardized RFC 5545 iCalendar (.ics)"
            >
              <Calendar className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Export Calendar (.ICS)</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="px-4 py-2 text-xs font-semibold text-[#0b0c10] bg-[#d4af37] hover:bg-[#e6c158] rounded-md transition-all flex items-center gap-2 shadow-lg shadow-[#d4af37]/10 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Custom Report (CSV)</span>
            </button>
          </div>
        </div>

        {/* Analytics High-Level Metrics (Zero-Pill Tabular Figures) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-[#34d399]" />
                <span>Gross Studio Volume</span>
              </span>
              <span className="font-mono text-[#34d399]">+18.4%</span>
            </div>
            <p className="font-mono text-2xl font-bold text-white tabular-nums">
              ${totalGrossVolume.toLocaleString()} USD
            </p>
            <p className="text-[11px] text-[#9ca3af]">Equivalent to ~4.24 ETH / 58.1 SOL</p>
          </div>

          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#38bdf8]" />
                <span>Escrow Locked Bookings</span>
              </span>
              <span className="font-mono text-[#38bdf8] text-[11px]">Pending Release</span>
            </div>
            <p className="font-mono text-2xl font-bold text-white tabular-nums">
              {escrowLockedCount} Active
            </p>
            <p className="text-[11px] text-[#9ca3af]">[SIM] Local session deposit preview</p>
          </div>

          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#ec4899]" />
                <span>Client Retention Rate</span>
              </span>
              <span className="font-mono text-[#ec4899] text-xs">High Retention</span>
            </div>
            <p className="font-mono text-2xl font-bold text-white tabular-nums">
              {retentionRate}%
            </p>
            <p className="text-[11px] text-[#9ca3af]">Average re-booking cycle: 26 days</p>
          </div>

          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-2">
            <div className="flex items-center justify-between text-[#9ca3af] text-xs">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Average Ticket Size</span>
              </span>
              <span className="font-mono text-[#d4af37] text-xs">Couture Tier</span>
            </div>
            <p className="font-mono text-2xl font-bold text-white tabular-nums">
              ${avgTicket} USD
            </p>
            <p className="text-[11px] text-[#9ca3af]">Includes custom 3D art & tip</p>
          </div>
        </div>

        {/* Appointment Ledger & Escrow Release Control */}
        <div className="p-6 rounded-xl bg-[#12141a] border border-[#272a33] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#1f222b]">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#d4af37]" />
              <span>Session Appointments & Deposit Preview [SIM]</span>
            </h3>

            {/* Filter controls & ICS export */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => downloadAllAppointmentsIcs(filteredAppointments, artists)}
                className="flex items-center gap-1.5 px-3 py-1 bg-[#d4af37]/15 hover:bg-[#d4af37]/25 text-[#d4af37] border border-[#d4af37]/30 text-xs font-mono rounded transition-colors cursor-pointer mr-1"
                title="Download appointments as standardized .ics file"
              >
                <Download className="w-3 h-3" />
                <span>Export ICS ({filteredAppointments.length})</span>
              </button>

              {['all', 'escrow_locked', 'confirmed', 'completed'].map(st => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1 text-xs rounded transition-all cursor-pointer ${
                    filterStatus === st
                      ? 'bg-[#272a33] text-white font-medium'
                      : 'text-[#9ca3af] hover:text-white'
                  }`}
                >
                  {st === 'all' ? 'All Bookings' : st.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1f222b] text-[#9ca3af] font-mono text-[11px]">
                  <th className="py-2.5 px-3">CLIENT & CONTACT</th>
                  <th className="py-2.5 px-3">MASTER ARTIST</th>
                  <th className="py-2.5 px-3">SERVICE / TECHNIQUE</th>
                  <th className="py-2.5 px-3">SCHEDULED TIME</th>
                  <th className="py-2.5 px-3">PRICE / ESCROW</th>
                  <th className="py-2.5 px-3">CALENDAR SYNC</th>
                  <th className="py-2.5 px-3">REMINDER ACTIONS</th>
                  <th className="py-2.5 px-3">ESCROW SETTLEMENT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f222b] text-white">
                {filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-[#9ca3af]">
                      No appointments matching this filter.
                    </td>
                  </tr>
                ) : (
                  filteredAppointments.map(apt => (
                    <tr key={apt.id} className="hover:bg-[#161820] transition-colors">
                      {/* Client */}
                      <td className="py-3 px-3">
                        <p className="font-semibold text-white">{apt.clientName}</p>
                        <p className="text-[11px] text-[#9ca3af] font-mono">{apt.clientPhone}</p>
                      </td>

                      {/* Artist */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <img
                            src={apt.artistAvatar}
                            alt={apt.artistName}
                            className="w-6 h-6 rounded-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
                            }}
                          />
                          <span>{apt.artistName}</span>
                        </div>
                      </td>

                      {/* Service */}
                      <td className="py-3 px-3">
                        <p className="text-white text-xs">{apt.serviceName}</p>
                        {apt.referenceLookTitle && (
                          <p className="text-[10px] text-[#d4af37] truncate max-w-[180px]">
                            Ref: {apt.referenceLookTitle}
                          </p>
                        )}
                      </td>

                      {/* Scheduled */}
                      <td className="py-3 px-3 font-mono text-xs">
                        <p className="text-white">{apt.date}</p>
                        <p className="text-[#9ca3af] text-[11px]">{apt.timeSlot}</p>
                      </td>

                      {/* Price */}
                      <td className="py-3 px-3 font-mono">
                        <p className="font-bold text-white tabular-nums">${apt.price} USD</p>
                        <p className="text-[10px] text-[#34d399]">{apt.cryptoEquivalent || apt.currency}</p>
                      </td>

                      {/* Calendar Sync */}
                      <td className="py-3 px-3">
                        <CalendarSyncButtons
                          appointment={apt}
                          artist={artists.find(a => a.id === apt.artistId)}
                          variant="compact"
                        />
                      </td>

                      {/* Reminder Actions */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onTriggerReminder(apt, '24h')}
                            className="px-2 py-1 bg-[#1a1b24] hover:bg-[#272a33] text-[10px] text-[#38bdf8] font-mono rounded border border-[#272a33] cursor-pointer"
                            title="Dispatch 24H simulated push and SMS reminder"
                          >
                            Send 24h
                          </button>
                          <button
                            onClick={() => onTriggerReminder(apt, '2h')}
                            className="px-2 py-1 bg-[#1a1b24] hover:bg-[#272a33] text-[10px] text-[#d4af37] font-mono rounded border border-[#272a33] cursor-pointer"
                            title="Dispatch 2H simulated push and SMS preview"
                          >
                            Send 2h
                          </button>
                        </div>
                      </td>

                      {/* Escrow Settlement */}
                      <td className="py-3 px-3">
                        {apt.status === 'completed' ? (
                          <span className="text-[#34d399] font-mono text-[11px] flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Released to Artist</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => onReleaseEscrow(apt.id)}
                            className="px-3 py-1 bg-[#34d399]/20 hover:bg-[#34d399]/30 text-[#34d399] border border-[#34d399]/30 rounded text-[11px] font-mono font-medium transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Release Escrow Funds
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trending Techniques & Revenue Drivers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Top Revenue Techniques</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Sculptural 3D Liquid Chrome</span>
                <span className="font-mono text-[#d4af37]">$6,840</span>
              </div>
              <div className="flex justify-between">
                <span>Japanese Glass Aura & Syrups</span>
                <span className="font-mono text-white">$4,920</span>
              </div>
              <div className="flex justify-between">
                <span>Russian E-File Architecture</span>
                <span className="font-mono text-white">$3,180</span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Currency Settlement Mix</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>USDC (Stablecoin)</span>
                <span className="font-mono text-[#38bdf8]">48.2%</span>
              </div>
              <div className="flex justify-between">
                <span>Fiat (Credit Card / USD)</span>
                <span className="font-mono text-white">32.6%</span>
              </div>
              <div className="flex justify-between">
                <span>Ethereum & Solana</span>
                <span className="font-mono text-[#ec4899]">19.2%</span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[#12141a] border border-red-500/30 space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Demo SLA Targets [SIM]</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Simulated Dispute Rate [SIM]</span>
                <span className="font-mono text-[#34d399]">0.02% (Demo)</span>
              </div>
              <div className="flex justify-between">
                <span>Reminder Mode [SIM]</span>
                <span className="font-mono text-white">In-App Toast Preview</span>
              </div>
              <div className="flex justify-between">
                <span>Session Sync [SIM]</span>
                <span className="font-mono text-[#34d399]">BroadcastChannel</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
