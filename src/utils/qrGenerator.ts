// =============================================================================
// Backlog N-10 Fix — 100% Local Offline QR Code Generator
// - Replaces external `https://api.qrserver.com` requests so the current page URL
//   (including any query parameters) never leaks over the network and offline PWA
//   pairing renders instantaneously without third-party image domains in CSP.
// =============================================================================

import QRCode from 'qrcode';

export async function generateLocalQrDataUrl(text: string): Promise<string> {
  const normalized = text.trim() || 'https://nailix.art';
  return QRCode.toDataURL(normalized, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

export async function generateLocalQrSvg(text: string): Promise<string> {
  const normalized = text.trim() || 'https://nailix.art';
  return QRCode.toString(normalized, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
