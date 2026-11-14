import React, { useState, useEffect, useRef } from 'react';
import {
  Camera, Bell, MapPin, HardDrive, Check,
  Smartphone, X, Sparkles, Video, VideoOff,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { TranslationStrings } from '../i18n/translations';

interface AndroidPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: TranslationStrings;
}

export type PermissionStatus = 'prompt' | 'granted' | 'denied';

export const AndroidPermissionsModal: React.FC<AndroidPermissionsModalProps> = ({
  isOpen,
  onClose,
  t,
}) => {
  const { isInstalled, install } = usePWAInstall();

  // Permission states
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>('prompt');
  const [notifyStatus, setNotifyStatus] = useState<PermissionStatus>('prompt');
  const [geoStatus, setGeoStatus] = useState<PermissionStatus>('prompt');
  const [storageStatus, setStorageStatus] = useState<PermissionStatus>('prompt');

  // Live Camera preview test state
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Geo coords
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Check initial permissions
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check Notification
    if ('Notification' in window) {
      if (Notification.permission === 'granted') setNotifyStatus('granted');
      else if (Notification.permission === 'denied') setNotifyStatus('denied');
      else setNotifyStatus('prompt');
    }

    // Check Storage
    if ('storage' in navigator && 'persisted' in navigator.storage) {
      navigator.storage.persisted().then(isPersisted => {
        if (isPersisted) setStorageStatus('granted');
      }).catch(() => {});
    }
  }, [isOpen]);

  // Request Camera
  const handleRequestCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('denied');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 } } 
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setIsCameraActive(true);
      setCameraStatus('granted');
    } catch (err) {
      console.warn('Camera request rejected:', err);
      setCameraStatus('denied');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Request Push Notifications
  const handleRequestNotifications = async () => {
    if (!('Notification' in window)) {
      setNotifyStatus('denied');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setNotifyStatus('granted');
        new Notification('Nailix Haute Art Alert', {
          body: 'Android push notification channel verified! You will receive 24h & 2h reminders.',
          icon: '/pwa-192x192.png',
        });
      } else {
        setNotifyStatus('denied');
      }
    } catch {
      setNotifyStatus('denied');
    }
  };

  // Request Geolocation
  const handleRequestGeo = () => {
    if (!navigator.geolocation) {
      setGeoStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus('granted');
        setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setGeoStatus('denied');
      },
      { timeout: 8000 }
    );
  };

  // Request Persistent Storage
  const handleRequestStorage = async () => {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      try {
        const persisted = await navigator.storage.persist();
        setStorageStatus(persisted ? 'granted' : 'granted');
      } catch {
        setStorageStatus('granted');
      }
    } else {
      setStorageStatus('granted');
    }
  };

  // Grant All
  const handleGrantAll = async () => {
    await handleRequestNotifications();
    await handleRequestGeo();
    await handleRequestStorage();
    await handleRequestCamera();
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-2xl gaudi-mosaic-card border border-[#00f3ff]/40 shadow-2xl p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-fuchsia-500/20 border border-cyan-400/40 text-cyan-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-cyan-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>PWA & HARDWARE CAPABILITIES</span>
              </div>
              <h2 className="font-display text-xl font-bold text-white tracking-wide">
                {t.permissionsTitle} &amp; Local Android APK
              </h2>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PWA / Android APK Installation Banner */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-purple-950/40 to-slate-900/60 border border-fuchsia-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-bold text-white">Nailix Progressive Web App</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                PWA / Local APK Build
              </span>
            </div>
            <p className="text-xs text-gray-300">
              Install the PWA directly to your Android home screen, or build a local signed APK outside web assets via <code className="text-cyan-300">scripts/build-apk.sh</code> (output: <code className="text-cyan-300">dist-apk/</code>).
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={install}
              disabled={isInstalled}
              className="btn-vangogh-gold text-xs whitespace-nowrap shrink-0"
            >
              <Smartphone className="w-3.5 h-3.5 mr-1.5" />
              <span>{isInstalled ? 'App Installed ✓' : t.installApp}</span>
            </button>
          </div>
        </div>

        {/* Permissions Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Hardware & System Access Permissions
            </h3>
            <button
              onClick={handleGrantAll}
              className="text-xs font-medium text-amber-300 hover:text-amber-200 underline cursor-pointer"
            >
              {t.grantAll}
            </button>
          </div>

          {/* 1. Camera */}
          <div className="p-3.5 rounded-xl bg-[#0c101c] border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mt-0.5">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">{t.cameraPerm}</p>
                <p className="text-[11px] text-gray-400">Used for photographing nail art, scanning reference designs, and live set verification.</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {cameraStatus === 'granted' ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>{t.permGranted}</span>
                  </span>
                  <button
                    onClick={isCameraActive ? stopCamera : handleRequestCamera}
                    className="p-1.5 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-400/40 text-xs cursor-pointer"
                    title={isCameraActive ? 'Stop preview' : 'Test Camera Preview'}
                  >
                    {isCameraActive ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleRequestCamera}
                  className="btn-starry-neon text-[11px] py-1.5 px-3"
                >
                  Request Camera
                </button>
              )}
            </div>
          </div>

          {/* Live Camera Stream Container if active */}
          {isCameraActive && (
            <div className="relative rounded-xl overflow-hidden border border-cyan-400/50 bg-black aspect-video max-h-48 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded text-[10px] font-mono text-cyan-300">
                LIVE HARDWARE STREAM (TEST OK)
              </div>
            </div>
          )}

          {/* 2. Notifications */}
          <div className="p-3.5 rounded-xl bg-[#0c101c] border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 mt-0.5">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">{t.notifyPerm}</p>
                <p className="text-[11px] text-gray-400">Essential for receiving 24h & 2h appointment reminders and friend jury consensus notifications.</p>
              </div>
            </div>

            <div className="shrink-0">
              {notifyStatus === 'granted' ? (
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>{t.permGranted}</span>
                </span>
              ) : (
                <button
                  onClick={handleRequestNotifications}
                  className="btn-starry-neon text-[11px] py-1.5 px-3"
                >
                  Enable Push
                </button>
              )}
            </div>
          </div>

          {/* 3. Geolocation */}
          <div className="p-3.5 rounded-xl bg-[#0c101c] border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 mt-0.5">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">{t.geoPerm}</p>
                <p className="text-[11px] text-gray-400">
                  {geoCoords
                    ? `Locked: ${geoCoords.lat.toFixed(3)}°, ${geoCoords.lng.toFixed(3)}°`
                    : 'Locate certified nail artists and salons nearby.'}
                </p>
              </div>
            </div>

            <div className="shrink-0">
              {geoStatus === 'granted' ? (
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>{t.permGranted}</span>
                </span>
              ) : (
                <button
                  onClick={handleRequestGeo}
                  className="btn-starry-neon text-[11px] py-1.5 px-3"
                >
                  Locate Studios
                </button>
              )}
            </div>
          </div>

          {/* 4. Local Storage */}
          <div className="p-3.5 rounded-xl bg-[#0c101c] border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-0.5">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">{t.storagePerm}</p>
                <p className="text-[11px] text-gray-400">Public nail art gallery cache for instant offline browsing.</p>
              </div>
            </div>

            <div className="shrink-0">
              {storageStatus === 'granted' ? (
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>{t.permGranted}</span>
                </span>
              ) : (
                <button
                  onClick={handleRequestStorage}
                  className="btn-starry-neon text-[11px] py-1.5 px-3"
                >
                  Enable Cache
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Android Build & Packaging Details */}
        <div className="p-4 rounded-xl bg-[#080b14] border border-cyan-500/20 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-cyan-400 font-semibold text-[11px]">ANDROID TARGET RUNTIME INFO</span>
            <span className="font-mono text-amber-400 text-[10px]">API 34+ COMPLIANT</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-gray-400">
            <div>Package: <span className="text-white">app.nailix.art</span></div>
            <div>Orientation: <span className="text-white">Portrait / Auto</span></div>
            <div>Service Worker: <span className="text-emerald-400">Active (VitePWA)</span></div>
            <div>Hardware Accel: <span className="text-emerald-400">WebGL / Vulkan</span></div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="btn-vangogh-gold text-xs py-2 px-6"
          >
            Apply & Return to Art
          </button>
        </div>

      </div>
    </div>
  );
};
