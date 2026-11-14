import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone, Camera, Bell, HardDrive,
  Check, Share2,
  RefreshCw, Sliders, Play, Square, Zap, Battery, Wifi,
  Volume2, QrCode, Terminal,
} from 'lucide-react';
import { triggerHaptic, HapticType } from '../utils/haptics';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ThemeMode } from '../types';
import { TranslationStrings } from '../i18n/translations';
import { reminderService } from '../services/reminderService';
import { DEMO_CLIENT_PROFILE, getRelativeDateISO } from '../data/initialData';

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
}

interface NavigatorWithHardware extends Navigator {
  getBattery?: () => Promise<BatteryManagerLike>;
  connection?: NetworkInformationLike;
}

interface AndroidExperienceViewProps {
  onOpenBookingModal?: () => void;
  theme: ThemeMode;
  t: TranslationStrings;
}

interface ARPattern {
  id: string;
  name: string;
  accent: string;
  badge: string;
  description: string;
  filterCss: string;
}

const AR_PATTERNS: ARPattern[] = [
  {
    id: 'sagrada-mosaic',
    name: 'Royal Stained Glass Mosaic',
    accent: '#00f3ff',
    badge: 'FACETED JEWEL MOSAIC',
    description: 'Vibrant cobalt, turquoise & ruby fractal shards reflecting sunlight.',
    filterCss: 'hue-rotate(180deg) saturate(200%) contrast(120%)',
  },
  {
    id: 'starry-vortex',
    name: 'Celestial Night Gold Swirl',
    accent: '#fbbf24',
    badge: '24K GOLD FILIGREE',
    description: 'Deep sapphire swirls kissed by luminescent golden relief strokes.',
    filterCss: 'sepia(40%) saturate(220%) hue-rotate(30deg) contrast(115%)',
  },
  {
    id: 'cyber-chrome',
    name: 'Holographic Mirror Chrome',
    accent: '#d946ef',
    badge: 'LIQUID PLATINUM',
    description: 'Liquid mercury surface with shifting iridescent violet interference.',
    filterCss: 'invert(15%) saturate(250%) hue-rotate(270deg)',
  },
  {
    id: 'emerald-dragon',
    name: 'Imperial Emerald & Ceramic Glaze',
    accent: '#10b981',
    badge: 'ARTISAN ENAMEL',
    description: 'Emerald scales, glazed gold ceramic pieces, and ornate serpentine curves.',
    filterCss: 'hue-rotate(85deg) saturate(180%) contrast(110%)',
  },
];

export const AndroidExperienceView: React.FC<AndroidExperienceViewProps> = ({
  onOpenBookingModal,
  theme,
}) => {
  const isDark = theme === 'dark';
  const { isInstalled, install } = usePWAInstall();

  // Telemetry states
  const [batteryLevel, setBatteryLevel] = useState<number | null>(88);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [networkType, setNetworkType] = useState<string>('5G / WiFi');
  const [storageUsedMB, setStorageUsedMB] = useState<number>(14.2);
  const [storageQuotaMB, setStorageQuotaMB] = useState<number>(512);

  // AR Camera States [SIM]
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [selectedPattern, setSelectedPattern] = useState<ARPattern>(AR_PATTERNS[0]);
  const [nailLength, setNailLength] = useState<number>(75);
  const [glowIntensity, setGlowIntensity] = useState<number>(85);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [isShutterFlashing, setIsShutterFlashing] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Haptics test feedback state
  const [lastHapticFired, setLastHapticFired] = useState<string | null>(null);

  // Notifications status
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [pushTestSuccess, setPushTestSuccess] = useState<string | null>(null);

  // Offline cache status
  const [isCaching, setIsCaching] = useState<boolean>(false);
  const [cacheDone, setCacheDone] = useState<boolean>(false);

  // Query hardware specs on mount
  useEffect(() => {
    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithHardware) : null;

    // Battery API
    if (nav && typeof nav.getBattery === 'function') {
      nav.getBattery().then((battery) => {
        setBatteryLevel(Math.round(battery.level * 100));
        setIsCharging(battery.charging);
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
        battery.addEventListener('chargingchange', () => {
          setIsCharging(battery.charging);
        });
      }).catch(() => {});
    }

    // Network API
    if (nav && nav.connection) {
      const conn = nav.connection;
      setNetworkType(`${conn.effectiveType?.toUpperCase() || 'LTE'} (${conn.downlink || 20} Mbps)`);
    }

    // Storage Estimate API
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        if (est.usage && est.quota) {
          setStorageUsedMB(Number((est.usage / (1024 * 1024)).toFixed(1)));
          setStorageQuotaMB(Number((est.quota / (1024 * 1024)).toFixed(0)));
        }
      }).catch(() => {});
    }

    // Cleanup camera when leaving view
    return () => {
      stopCamera();
    };
  }, []);

  // Camera Management
  const startCamera = async () => {
    setStatusNotice(null);
    try {
      triggerHaptic('medium');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatusNotice('WebRTC Camera is not supported on this device/browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setIsCameraActive(true);
    } catch (err) {
      console.warn('Camera stream failed:', err);
      // Fallback to front camera if rear unavailable
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setIsCameraActive(true);
      } catch {
        setStatusNotice('Unable to access camera. Please verify camera permissions in browser settings.');
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Capture AR Snapshot
  const handleTakeSnapshot = () => {
    triggerHaptic('heavy');
    setIsShutterFlashing(true);
    setTimeout(() => setIsShutterFlashing(false), 200);

    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw video feed
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Apply artistic Cyber-Gaudí filter overlay
    ctx.save();
    ctx.strokeStyle = selectedPattern.accent;
    ctx.lineWidth = 4;
    ctx.shadowColor = selectedPattern.accent;
    ctx.shadowBlur = glowIntensity / 4;

    // Draw AR Fingertip Reticles (Stylized Gaudi arcs)
    const baseW = canvas.width;
    const baseH = canvas.height;
    const fingers = [
      { x: baseW * 0.32, y: baseH * 0.42, r: 18 },
      { x: baseW * 0.44, y: baseH * 0.35, r: 20 },
      { x: baseW * 0.56, y: baseH * 0.36, r: 20 },
      { x: baseW * 0.68, y: baseH * 0.44, r: 17 },
    ];

    fingers.forEach((f) => {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (nailLength / 60), 0, Math.PI * 2);
      ctx.stroke();

      // Inner fill with pattern color
      ctx.fillStyle = `${selectedPattern.accent}66`;
      ctx.fill();
    });

    // Watermark
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`NAILIX AR · ${selectedPattern.name.toUpperCase()}`, 20, canvas.height - 24);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    setCapturedPhotoUrl(dataUrl);
    triggerHaptic('success');
  };

  // Android Native Share Sheet
  const handleNativeShare = async () => {
    triggerHaptic('selection');
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Nailix AR Preview [SIM]',
          text: `Check out this manicure preview fitted with ${selectedPattern.name} in Nailix!`,
          url: window.location.href,
        });
      } catch {
        // User cancelled share
      }
    } else {
      navigator.clipboard?.writeText(window.location.href);
      setStatusNotice('Link copied to clipboard! (Web Share API active on Android Chrome)');
    }
  };

  // Haptic Tester
  const testHapticPattern = (type: HapticType, label: string) => {
    triggerHaptic(type);
    setLastHapticFired(label);
    setTimeout(() => setLastHapticFired(null), 1500);
  };

  // Real Android Push / Simulated Reminder Trigger
  const handleTriggerPushNotification = async () => {
    triggerHaptic('selection');
    if (!('Notification' in window)) {
      setPushTestSuccess('Browser Notification API is not available in this context.');
      return;
    }

    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
      setNotificationStatus(perm);
    }

    if (perm === 'granted') {
      try {
        new Notification('Nailix Push Preview [SIM]', {
          body: `[SIM] Appointment reminder preview for ${selectedPattern.name}.`,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'nailix-reminder',
        });
        setPushTestSuccess('[SIM] Browser Notification preview dispatched!');
        triggerHaptic('success');
        setTimeout(() => setPushTestSuccess(null), 4000);
      } catch {
        // Service worker fallback -> simulated in-app toast
        reminderService.dispatch2HourReminder({
          id: 'android-sw-test',
          clientName: DEMO_CLIENT_PROFILE.name,
          clientPhone: DEMO_CLIENT_PROFILE.phone,
          clientEmail: DEMO_CLIENT_PROFILE.email,
          artistId: '',
          artistName: 'Mireia Vila',
          artistAvatar: '',
          serviceId: '',
          serviceName: selectedPattern.name,
          price: 140,
          currency: 'USD',
          date: getRelativeDateISO(0),
          timeSlot: '16:00',
          status: 'confirmed',
          remindersEnabled: true,
          pushReminderScheduled: true,
          smsReminderScheduled: true,
          createdAt: new Date().toISOString(),
        });
        setPushTestSuccess('[SIM] Simulated In-App Notification dispatched!');
      }
    } else {
      setPushTestSuccess('Notifications are blocked in browser settings.');
    }
  };

  // Pre-cache Gallery for Offline Subway/Flight
  const handlePrecacheGallery = async () => {
    triggerHaptic('medium');
    setIsCaching(true);
    if ('caches' in window) {
      try {
        const cache = await caches.open('nailix-offline-art-v1');
        const urlsToCache = [
          '/',
          '/icon.png',
          '/pwa-192x192.png',
          '/pwa-512x512.png',
        ];
        await cache.addAll(urlsToCache);
      } catch (err) {
        console.warn('[PWA] Precache skipped:', err);
      }
    }
    setTimeout(() => {
      setIsCaching(false);
      setCacheDone(true);
      triggerHaptic('success');
      setTimeout(() => setCacheDone(false), 3500);
    }, 1200);
  };

  // Current App URL for QR Code
  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://nailix.art';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(currentUrl)}`;

  return (
    <div className="space-y-8 pb-20 animate-fade-in">

      {/* Android System Cockpit Bar */}
      <div className={`p-4 rounded-2xl border backdrop-blur-xl shadow-xl transition-all ${
        isDark 
          ? 'bg-gradient-to-r from-[#070b16] via-[#0d1224] to-[#080b14] border-cyan-500/30 shadow-cyan-950/20' 
          : 'bg-gradient-to-r from-white via-amber-50/60 to-sky-50/50 border-amber-600/25 shadow-amber-900/10'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl border flex items-center justify-center ${
              isDark 
                ? 'bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border-cyan-400/40 text-[#00f3ff]' 
                : 'bg-amber-100 border-amber-500/50 text-amber-900'
            }`}>
              <Smartphone className="w-6 h-6 animate-pulse" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  isDark ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/40' : 'bg-sky-100 text-sky-900 border border-sky-400/50'
                }`}>
                  PWA / WebAPK Companion &amp; AR [SIM]
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  isInstalled 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/40' 
                    : 'bg-amber-500/20 text-amber-400 border border-amber-400/40'
                }`}>
                  {isInstalled ? 'WebAPK Installed ✓' : 'Standalone PWA Ready'}
                </span>
              </div>
              
              <h1 className={`font-display text-2xl font-black tracking-tight mt-1 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}>
                Nailix Android PWA &amp; AR Suite [SIM]
              </h1>
            </div>
          </div>

          {/* Android Real Hardware Telemetry Indicators */}
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
            {/* Battery */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
              isDark ? 'bg-black/40 border-cyan-500/20 text-cyan-300' : 'bg-white/80 border-slate-300 text-slate-800'
            }`}>
              <Battery className={`w-4 h-4 ${isCharging ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`} />
              <span>{batteryLevel !== null ? `${batteryLevel}%` : '85%'}</span>
              {isCharging && <span className="text-[10px] text-amber-400">⚡</span>}
            </div>

            {/* Network */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
              isDark ? 'bg-black/40 border-cyan-500/20 text-cyan-300' : 'bg-white/80 border-slate-300 text-slate-800'
            }`}>
              <Wifi className="w-4 h-4 text-cyan-400" />
              <span>{networkType}</span>
            </div>

            {/* Storage Quota */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
              isDark ? 'bg-black/40 border-cyan-500/20 text-cyan-300' : 'bg-white/80 border-slate-300 text-slate-800'
            }`}>
              <HardDrive className="w-4 h-4 text-fuchsia-400" />
              <span>{storageUsedMB} MB / {storageQuotaMB} MB</span>
            </div>

            {/* PWA / WebAPK Install Button */}
            <button
              onClick={() => {
                triggerHaptic('medium');
                install();
              }}
              disabled={isInstalled}
              className="btn-vangogh-gold text-xs py-2 px-3 flex items-center gap-1.5 shrink-0"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{isInstalled ? 'WebAPK Installed ✓' : 'Установить WebAPK'}</span>
            </button>
          </div>

        </div>
      </div>

      {/* SECTION 1: Live AR Nail Camera & Virtual Fitting [SIM] */}
      <div className={`p-6 sm:p-8 rounded-2xl border backdrop-blur-xl shadow-2xl relative overflow-hidden ${
        isDark 
          ? 'gaudi-mosaic-card border-[#00f3ff]/30 text-white' 
          : 'bg-white border-amber-600/30 text-slate-900 shadow-amber-950/10'
      }`}>
        
        {/* Shutter Flash Animation Overlay */}
        {isShutterFlashing && (
          <div className="absolute inset-0 z-50 bg-white opacity-80 pointer-events-none transition-opacity duration-150" />
        )}

        {statusNotice && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-mono">
            {statusNotice}
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-cyan-500/20">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-rose-400 font-bold mb-1">
              <Camera className="w-4 h-4 text-[#00f3ff]" />
              <span>[SIM] CANVAS 2D RETICLE OVERLAY · LIVE WEBRTC FEED</span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Virtual AR Nail Overlay [SIM]
            </h2>
            <p className={`text-xs mt-1 max-w-xl ${isDark ? 'text-gray-300' : 'text-slate-600'}`}>
              [SIM] Uses WebRTC camera video with a 2D Canvas reticle overlay (MediaPipe/TFLite 3D hand tracking planned for Stage 6). Align fingers with the guide capsules to capture a local PNG preview.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!isCameraActive ? (
              <button
                onClick={startCamera}
                className="btn-starry-neon text-xs py-2.5 px-5 flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Launch AR Camera</span>
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="px-4 py-2.5 rounded-xl border border-rose-500/50 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Stop Camera</span>
              </button>
            )}

            <button
              onClick={handleNativeShare}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                isDark 
                  ? 'bg-cyan-500/10 border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/20' 
                  : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
              }`}
              title="Share via Android Share Sheet"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Camera Viewport and AR Filters Control */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
          
          {/* Left: Viewport / Camera Canvas */}
          <div className="lg:col-span-7 flex flex-col items-center">
            <div className={`relative w-full aspect-[4/3] rounded-2xl overflow-hidden border-2 flex items-center justify-center ${
              isDark ? 'border-cyan-400/50 bg-black/90 shadow-2xl shadow-cyan-950/50' : 'border-amber-600/40 bg-slate-900 shadow-xl'
            }`}>
              
              {/* Actual Video Feed */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-all ${!isCameraActive ? 'hidden' : ''}`}
                style={{ filter: selectedPattern.filterCss }}
              />

              {/* AR Hand Overlay Reticle (Gaudí Guidelines) */}
              {isCameraActive && (
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
                  
                  {/* Top HUD */}
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-md bg-black/60 border border-cyan-400/50 font-mono text-[10px] text-cyan-300">
                      LIVE AR: {selectedPattern.badge}
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-black/60 border border-amber-400/50 font-mono text-[10px] text-amber-300 flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      <span>{glowIntensity}% GLOW</span>
                    </span>
                  </div>

                  {/* Finger Guides Overlaid on screen */}
                  <div className="w-full flex justify-center items-end pb-8 gap-4 sm:gap-6 opacity-75">
                    {[1, 2, 3, 4].map((fingerNum) => (
                      <div
                        key={fingerNum}
                        className="flex flex-col items-center gap-1 animate-pulse"
                      >
                        <div 
                          className="w-7 sm:w-9 rounded-t-full border-2 border-dashed transition-all"
                          style={{
                            height: `${nailLength * 0.7}px`,
                            borderColor: selectedPattern.accent,
                            backgroundColor: `${selectedPattern.accent}33`,
                            boxShadow: `0 0 ${glowIntensity / 5}px ${selectedPattern.accent}`,
                          }}
                        />
                        <span className="text-[9px] font-mono text-white/70">F{fingerNum}</span>
                      </div>
                    ))}
                  </div>

                  {/* Bottom Guide prompt */}
                  <div className="text-center">
                    <span className="px-3 py-1 rounded-full bg-black/70 text-[11px] font-mono text-white/90 border border-white/20">
                      Align fingers inside the holographic capsules
                    </span>
                  </div>

                </div>
              )}

              {/* Placeholder when camera is inactive */}
              {!isCameraActive && (
                <div className="text-center p-8 space-y-4 max-w-sm">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-white text-base">AR Camera Standby</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Tap "Launch AR Camera" to activate your Android camera with organic Gaudí nail overlay.
                    </p>
                  </div>
                  <button
                    onClick={startCamera}
                    className="btn-starry-neon text-xs py-2 px-5 cursor-pointer"
                  >
                    Start Sensor
                  </button>
                </div>
              )}

              {/* Hidden Canvas for capture processing */}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Camera Controls Toolbar */}
            {isCameraActive && (
              <div className="flex items-center gap-4 mt-4">
                <button
                  onClick={handleTakeSnapshot}
                  className="px-6 py-3 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-display font-bold text-sm shadow-xl shadow-amber-500/25 flex items-center gap-2 cursor-pointer active:scale-95 transition-transform"
                >
                  <Camera className="w-4 h-4" />
                  <span>Snap Photo</span>
                </button>

                <button
                  onClick={() => {
                    triggerHaptic('selection');
                    const nextIndex = (AR_PATTERNS.findIndex(p => p.id === selectedPattern.id) + 1) % AR_PATTERNS.length;
                    setSelectedPattern(AR_PATTERNS[nextIndex]);
                  }}
                  className={`p-3 rounded-full border cursor-pointer ${
                    isDark ? 'bg-cyan-950/60 border-cyan-400/40 text-cyan-300' : 'bg-slate-200 border-slate-300 text-slate-800'
                  }`}
                  title="Next Pattern"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Right: AR Presets & Sliders */}
          <div className="lg:col-span-5 space-y-5">
            
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold tracking-wider text-amber-400 uppercase">
                Select Luxury Ornament Preset
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {AR_PATTERNS.map((p) => {
                  const isSelected = selectedPattern.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        triggerHaptic('selection');
                        setSelectedPattern(p);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? isDark
                            ? 'bg-cyan-500/20 border-cyan-400 shadow-md shadow-cyan-500/20 ring-1 ring-cyan-400'
                            : 'bg-amber-100 border-amber-600 shadow-md ring-1 ring-amber-600'
                          : isDark
                            ? 'bg-[#0a0f1d] border-cyan-500/20 hover:border-cyan-400/40'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span 
                          className="w-3 h-3 rounded-full ring-2 ring-black"
                          style={{ backgroundColor: p.accent }}
                        />
                        <span className="text-[9px] font-mono opacity-80">{p.badge}</span>
                      </div>
                      <h4 className="font-display text-xs font-bold">{p.name}</h4>
                      <p className={`text-[10px] mt-0.5 line-clamp-1 ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>
                        {p.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sliders for Nail Length and Glow */}
            <div className={`p-4 rounded-xl border space-y-4 ${
              isDark ? 'bg-[#0a0f1d] border-cyan-500/20' : 'bg-slate-50 border-slate-200'
            }`}>
              
              {/* Nail Length */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    <span>Nail Extension Scale</span>
                  </span>
                  <span className="font-mono text-cyan-400 font-bold">{nailLength}%</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="120"
                  value={nailLength}
                  onChange={(e) => {
                    setNailLength(Number(e.target.value));
                    triggerHaptic('selection');
                  }}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              {/* Bio-Luminesce Glow */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Mosaic Glow Radiance</span>
                  </span>
                  <span className="font-mono text-amber-400 font-bold">{glowIntensity}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={glowIntensity}
                  onChange={(e) => {
                    setGlowIntensity(Number(e.target.value));
                    triggerHaptic('selection');
                  }}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Captured Photo Result Preview */}
            {capturedPhotoUrl && (
              <div className={`p-4 rounded-xl border space-y-3 animate-fade-in ${
                isDark ? 'bg-gradient-to-br from-cyan-950/30 to-blue-950/40 border-cyan-400/40' : 'bg-white border-slate-300 shadow-md'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-emerald-400 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>AR SNAPSHOT CAPTURED</span>
                  </span>
                  <button
                    onClick={() => setCapturedPhotoUrl(null)}
                    className="text-[11px] text-gray-400 hover:text-white underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>

                <div className="relative rounded-lg overflow-hidden border border-cyan-500/30 aspect-video bg-black">
                  <img
                    src={capturedPhotoUrl}
                    alt="Captured AR Manicure"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={capturedPhotoUrl}
                    download="nailix-ar-manicure.png"
                    onClick={() => triggerHaptic('selection')}
                    className="flex-1 text-center py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-md transition-colors"
                  >
                    Download PNG
                  </a>

                  <button
                    onClick={() => {
                      triggerHaptic('success');
                      if (onOpenBookingModal) onOpenBookingModal();
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 font-bold text-xs shadow-md"
                  >
                    Book with this AR Look
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* SECTION 2 & 3: Android Haptics Engine & Push Reminders Hub */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Android Haptics Playground */}
        <div className={`p-6 rounded-2xl border backdrop-blur-xl shadow-xl space-y-4 ${
          isDark 
            ? 'gaudi-mosaic-card border-cyan-500/30 text-white' 
            : 'bg-white border-amber-600/30 text-slate-900'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base">Android Haptic Engine</h3>
                <p className="text-[11px] text-gray-400">Tactile motor frequency test for Android devices</p>
              </div>
            </div>

            {lastHapticFired && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-400/40 animate-pulse">
                {lastHapticFired}
              </span>
            )}
          </div>

          <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-slate-600'}`}>
            Experience subtle vibration pulses tuned for appointment checkouts, style voting, and booking alerts.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
            <button
              onClick={() => testHapticPattern('selection', '10ms Selection')}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-all active:scale-95 ${
                isDark ? 'bg-[#0d1326] border-cyan-500/30 hover:border-cyan-400' : 'bg-slate-50 border-slate-200 hover:border-slate-400'
              }`}
            >
              <div className="text-[10px] font-mono text-cyan-400 font-bold">10ms</div>
              <div className="text-xs font-bold mt-0.5">Light Tap</div>
            </button>

            <button
              onClick={() => testHapticPattern('medium', '35ms Medium')}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-all active:scale-95 ${
                isDark ? 'bg-[#0d1326] border-cyan-500/30 hover:border-cyan-400' : 'bg-slate-50 border-slate-200 hover:border-slate-400'
              }`}
            >
              <div className="text-[10px] font-mono text-amber-400 font-bold">35ms</div>
              <div className="text-xs font-bold mt-0.5">Medium Pulse</div>
            </button>

            <button
              onClick={() => testHapticPattern('heavy', '60ms Shutter')}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-all active:scale-95 ${
                isDark ? 'bg-[#0d1326] border-cyan-500/30 hover:border-cyan-400' : 'bg-slate-50 border-slate-200 hover:border-slate-400'
              }`}
            >
              <div className="text-[10px] font-mono text-fuchsia-400 font-bold">60ms</div>
              <div className="text-xs font-bold mt-0.5">Camera Shutter</div>
            </button>

            <button
              onClick={() => testHapticPattern('success', 'Chord Success')}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-all active:scale-95 ${
                isDark ? 'bg-[#0d1326] border-emerald-500/30 hover:border-emerald-400' : 'bg-slate-50 border-slate-200 hover:border-slate-400'
              }`}
            >
              <div className="text-[10px] font-mono text-emerald-400 font-bold">Melodic</div>
              <div className="text-xs font-bold mt-0.5">Payment Success</div>
            </button>

            <button
              onClick={() => testHapticPattern('warning', 'Triple Warning')}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-all active:scale-95 ${
                isDark ? 'bg-[#0d1326] border-rose-500/30 hover:border-rose-400' : 'bg-slate-50 border-slate-200 hover:border-slate-400'
              }`}
            >
              <div className="text-[10px] font-mono text-rose-400 font-bold">Alert</div>
              <div className="text-xs font-bold mt-0.5">Jury Flag Warning</div>
            </button>

            <button
              onClick={() => testHapticPattern('gaudiRhythm', 'Fluid Wave')}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-all active:scale-95 ${
                isDark ? 'bg-[#0d1326] border-purple-500/30 hover:border-purple-400' : 'bg-slate-50 border-slate-200 hover:border-slate-400'
              }`}
            >
              <div className="text-[10px] font-mono text-purple-400 font-bold">Poly-Rhythm</div>
              <div className="text-xs font-bold mt-0.5">Fluid Wave</div>
            </button>
          </div>
        </div>

        {/* Android Push Notifications & Reminder Scheduler */}
        <div className={`p-6 rounded-2xl border backdrop-blur-xl shadow-xl space-y-4 ${
          isDark 
            ? 'gaudi-mosaic-card border-cyan-500/30 text-white' 
            : 'bg-white border-amber-600/30 text-slate-900'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base">Notifications &amp; Reminders [SIM]</h3>
                <p className="text-[11px] text-gray-400">Browser notification API + in-app toast simulator</p>
              </div>
            </div>

            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
              notificationStatus === 'granted'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/40'
                : 'bg-amber-500/20 text-amber-400 border-amber-400/40'
            }`}>
              {notificationStatus === 'granted' ? 'Permitted ✓' : 'Permission Pending'}
            </span>
          </div>

          <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-slate-600'}`}>
            [SIM] Preview 24h &amp; 2h appointment reminder alerts locally (no live SMS carrier gateway connected yet).
          </p>

          {pushTestSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono animate-fade-in">
              {pushTestSuccess}
            </div>
          )}

          <div className="space-y-2 pt-1">
            <button
              onClick={handleTriggerPushNotification}
              className="w-full btn-starry-neon text-xs py-2.5 flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Send Test Browser Notification [SIM]</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  triggerHaptic('selection');
                  reminderService.dispatch24HourReminder({
                    id: 'sched-24h',
                    clientName: DEMO_CLIENT_PROFILE.name,
                    clientPhone: DEMO_CLIENT_PROFILE.phone,
                    clientEmail: DEMO_CLIENT_PROFILE.email,
                    artistId: '',
                    artistName: 'Mireia Vila (Eixample)',
                    artistAvatar: '',
                    serviceId: '',
                    serviceName: 'Royal Obsidian Gel & Gold Leaf',
                    price: 150,
                    currency: 'USD',
                    date: getRelativeDateISO(1),
                    timeSlot: '14:30',
                    status: 'confirmed',
                    remindersEnabled: true,
                    pushReminderScheduled: true,
                    smsReminderScheduled: true,
                    createdAt: new Date().toISOString(),
                  });
                  setPushTestSuccess('[SIM] 24-Hour Reminder preview dispatched!');
                }}
                className={`p-2.5 rounded-xl border text-xs font-semibold text-center cursor-pointer transition-all ${
                  isDark ? 'bg-[#0d1326] border-cyan-500/20 hover:border-cyan-400/50' : 'bg-slate-100 border-slate-300'
                }`}
              >
                Simulate 24h Alert [SIM]
              </button>

              <button
                onClick={() => {
                  triggerHaptic('selection');
                  reminderService.dispatch2HourReminder({
                    id: 'sched-2h',
                    clientName: DEMO_CLIENT_PROFILE.name,
                    clientPhone: DEMO_CLIENT_PROFILE.phone,
                    clientEmail: DEMO_CLIENT_PROFILE.email,
                    artistId: '',
                    artistName: 'Mireia Vila (Eixample)',
                    artistAvatar: '',
                    serviceId: '',
                    serviceName: 'Royal Obsidian Gel & Gold Leaf',
                    price: 150,
                    currency: 'USD',
                    date: getRelativeDateISO(0),
                    timeSlot: '16:30',
                    status: 'confirmed',
                    remindersEnabled: true,
                    pushReminderScheduled: true,
                    smsReminderScheduled: true,
                    createdAt: new Date().toISOString(),
                  });
                  setPushTestSuccess('[SIM] 2-Hour Reminder preview dispatched!');
                }}
                className={`p-2.5 rounded-xl border text-xs font-semibold text-center cursor-pointer transition-all ${
                  isDark ? 'bg-[#0d1326] border-cyan-500/20 hover:border-cyan-400/50' : 'bg-slate-100 border-slate-300'
                }`}
              >
                Simulate 2h Alert [SIM]
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* SECTION 4: Android WebAPK & Mobile Pairing QR Code */}
      <div className={`p-6 sm:p-8 rounded-2xl border backdrop-blur-xl shadow-xl ${
        isDark 
          ? 'gaudi-mosaic-card border-cyan-500/30 text-white' 
          : 'bg-white border-amber-600/30 text-slate-900'
      }`}>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          
          <div className="md:col-span-8 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold text-amber-400 uppercase">
                ANDROID TRUSTED WEB ACTIVITY & WEBAPK
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-400/40">
                Package: app.nailix.art
              </span>
            </div>

            <h3 className="font-display text-2xl font-black tracking-tight">
              Pair with Your Android Phone or Install Direct WebAPK
            </h3>

            <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-300' : 'text-slate-600'}`}>
              Scan the QR code below using any Android camera or Google Lens to immediately open the Nailix app directly on your smartphone. When prompted, tap <strong>"Add to Home Screen"</strong> or <strong>"Install Nailix"</strong> for full-screen immersive mode, hardware-accelerated 3D effects, and instant offline caching.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono">
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-black/30 border-cyan-500/20' : 'bg-slate-50 border-slate-200'}`}>
                <div className="text-gray-400">Target OS</div>
                <div className="text-white font-bold mt-0.5">Android 7.0 - 15+</div>
              </div>
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-black/30 border-cyan-500/20' : 'bg-slate-50 border-slate-200'}`}>
                <div className="text-gray-400">Display Mode</div>
                <div className="text-emerald-400 font-bold mt-0.5">Standalone</div>
              </div>
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-black/30 border-cyan-500/20' : 'bg-slate-50 border-slate-200'}`}>
                <div className="text-gray-400">Shortcuts</div>
                <div className="text-cyan-400 font-bold mt-0.5">4 App Icon Actions</div>
              </div>
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-black/30 border-cyan-500/20' : 'bg-slate-50 border-slate-200'}`}>
                <div className="text-gray-400">AssetLinks</div>
                <div className="text-amber-400 font-bold mt-0.5">Pending Key Rotation</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => {
                  triggerHaptic('medium');
                  install();
                }}
                disabled={isInstalled}
                className="btn-vangogh-gold text-xs py-3 px-5 flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <Smartphone className="w-4 h-4" />
                <span>{isInstalled ? 'App Already Installed ✓' : 'Установить как WebAPK'}</span>
              </button>

              <button
                onClick={handlePrecacheGallery}
                disabled={isCaching}
                className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  isDark ? 'bg-cyan-950/40 border-cyan-400/40 text-cyan-300 hover:bg-cyan-950' : 'bg-slate-100 border-slate-300 text-slate-800'
                }`}
              >
                <HardDrive className="w-4 h-4 text-emerald-400" />
                <span>{isCaching ? 'Caching Gallery...' : cacheDone ? 'Cache Synced 100% ✓' : 'Кэшировать арт для метро'}</span>
              </button>
            </div>

            {/* Honest Local APK Build Instructions (K-01) */}
            <div className={`p-4 rounded-xl border text-xs space-y-2 mt-4 ${
              isDark ? 'bg-[#060a14] border-cyan-500/30 text-gray-300' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              <div className="flex items-center gap-2 text-cyan-400 font-mono font-bold text-[11px] uppercase">
                <Terminal className="w-3.5 h-3.5" />
                <span>Локальная сборка APK (вне репозитория / public):</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                <li>Сгенерируйте свой release-ключ согласно <code>docs/KEY_ROTATION_RUNBOOK.md</code> и задайте переменные окружения <code>NAILIX_KEYSTORE_PATH</code>, <code>NAILIX_KEYSTORE_PASS</code>.</li>
                <li>Запустите <code>npm run build &amp;&amp; bash scripts/build-apk.sh</code> — APK соберётся локально в <code>dist-apk/nailix.apk</code> (игнорируется Git).</li>
                <li>Пропишите новый SHA-256 отпечаток сертификата в <code>public/.well-known/assetlinks.json</code> перед публикацией TWA.</li>
              </ol>
              <div className="pt-1 flex flex-wrap items-center gap-3 text-[10px] font-mono text-gray-400 border-t border-cyan-500/20">
                <span>Пакет: <strong className="text-white">app.nailix.art</strong></span>
                <span>Keystore: <strong className="text-amber-400">Env-based (rotated locally)</strong></span>
                <span>Вывод: <strong className="text-cyan-400">dist-apk/nailix.apk</strong></span>
              </div>
            </div>
          </div>

          {/* QR Code Container */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-4 rounded-2xl bg-white/5 border border-cyan-500/30 shadow-inner">
            <div className="p-3 bg-white rounded-xl shadow-xl">
              <img
                src={qrCodeUrl}
                alt="Scan to open Nailix on Android"
                className="w-44 h-44 object-contain"
              />
            </div>
            <span className="text-[10px] font-mono text-cyan-300 mt-2.5 flex items-center gap-1">
              <QrCode className="w-3.5 h-3.5" />
              <span>Scan with Android Camera</span>
            </span>
          </div>

        </div>
      </div>

    </div>
  );
};
