import React, { useState, useMemo } from 'react';
import { 
  MapPin, 
  Home, 
  Briefcase, 
  Navigation, 
  Calendar, 
  MessageSquare, 
  Star, 
  Clock, 
  Building2, 
  Edit3, 
  Check, 
  Compass, 
  Crosshair,
} from 'lucide-react';
import { Artist, ClientAnchorPoint, ThemeMode } from '../types';
import { calculateDistanceKm, formatTravelEstimate } from '../services/geoDistance';
import { TranslationStrings } from '../i18n/translations';

interface ClientLocationMapProps {
  artists: Artist[];
  anchorPoints: ClientAnchorPoint[];
  onUpdateAnchorPoint: (point: ClientAnchorPoint) => void;
  onSelectArtistToBook: (artist: Artist) => void;
  onOpenChatWithArtist: (artist: Artist) => void;
  userRole: 'client' | 'master';
  onUpdateMasterSalon?: (artistId: string, salonName: string, salonAddress: string, lat: number, lng: number) => void;
  theme: ThemeMode;
  t: TranslationStrings;
}

export const ClientLocationMap: React.FC<ClientLocationMapProps> = ({
  artists,
  anchorPoints,
  onUpdateAnchorPoint,
  onSelectArtistToBook,
  onOpenChatWithArtist,
  userRole,
  onUpdateMasterSalon,
  theme,
}) => {
  const [selectedAnchorId, setSelectedAnchorId] = useState<'home' | 'work' | 'custom'>('home');
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [isEditingAnchor, setIsEditingAnchor] = useState<boolean>(false);
  const [editAddress, setEditAddress] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  
  // Master salon editing state
  const [isEditingSalon, setIsEditingSalon] = useState<boolean>(false);
  const [salonMasterId, setSalonMasterId] = useState<string>(artists[0]?.id || 'artist-1');
  const [salonNameInput, setSalonNameInput] = useState<string>(artists[0]?.salonName || 'Atelier Vasiliev');
  const [salonAddressInput, setSalonAddressInput] = useState<string>(artists[0]?.salonAddress || 'Carrer de Provença 261');

  const isDark = theme === 'dark';

  // Currently active anchor point
  const currentAnchor = anchorPoints.find(p => p.id === selectedAnchorId) || anchorPoints[0];

  // Compute distances from current anchor to all artists and sort ascending
  const sortedArtists = useMemo(() => {
    return artists.map(artist => {
      const artCoords = artist.coordinates || { lat: 41.395, lng: 2.162 };
      const distKm = calculateDistanceKm(
        currentAnchor.coordinates.lat,
        currentAnchor.coordinates.lng,
        artCoords.lat,
        artCoords.lng
      );
      const travel = formatTravelEstimate(distKm);
      return {
        ...artist,
        distanceKm: distKm,
        travel,
      };
    }).sort((a, b) => a.distanceKm - b.distanceKm);
  }, [artists, currentAnchor]);

  // Map coordinate bounds for the stylized district canvas (Barcelona center)
  // Lat: ~41.385 to 41.410, Lng: ~2.140 to 2.185
  const mapBounds = {
    minLat: 41.383,
    maxLat: 41.412,
    minLng: 2.135,
    maxLng: 2.185,
  };

  // Convert GPS (lat, lng) to percentage (x, y) on the canvas
  const getCanvasCoords = (lat: number, lng: number) => {
    const x = ((lng - mapBounds.minLng) / (mapBounds.maxLng - mapBounds.minLng)) * 100;
    // Invert Y because latitude goes north (up), while CSS Y goes down
    const y = ((mapBounds.maxLat - lat) / (mapBounds.maxLat - mapBounds.minLat)) * 100;
    return {
      x: Math.min(94, Math.max(6, x)),
      y: Math.min(94, Math.max(6, y)),
    };
  };

  // Handle map click to reposition current anchor point
  const handleMapCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    // Convert canvas percent back to GPS
    const newLng = mapBounds.minLng + clickX * (mapBounds.maxLng - mapBounds.minLng);
    const newLat = mapBounds.maxLat - clickY * (mapBounds.maxLat - mapBounds.minLat);

    const updated: ClientAnchorPoint = {
      ...currentAnchor,
      address: `Selected Pin (${newLat.toFixed(4)}, ${newLng.toFixed(4)})`,
      coordinates: {
        lat: Number(newLat.toFixed(4)),
        lng: Number(newLng.toFixed(4)),
      },
    };

    onUpdateAnchorPoint(updated);
  };

  const handleSaveAnchorEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAddress.trim()) return;

    // Slight coordinate jitter simulation for custom addresses
    const jitterLat = (Math.random() - 0.5) * 0.008;
    const jitterLng = (Math.random() - 0.5) * 0.008;

    const updated: ClientAnchorPoint = {
      ...currentAnchor,
      name: editName.trim() || currentAnchor.name,
      address: editAddress.trim(),
      coordinates: {
        lat: Number((currentAnchor.coordinates.lat + jitterLat).toFixed(4)),
        lng: Number((currentAnchor.coordinates.lng + jitterLng).toFixed(4)),
      },
    };

    onUpdateAnchorPoint(updated);
    setIsEditingAnchor(false);
  };

  const handleSaveMasterSalon = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateMasterSalon) {
      const art = artists.find(a => a.id === salonMasterId);
      const lat = art?.coordinates?.lat || 41.395;
      const lng = art?.coordinates?.lng || 2.162;
      onUpdateMasterSalon(salonMasterId, salonNameInput, salonAddressInput, lat, lng);
    }
    setIsEditingSalon(false);
  };

  const anchorCoords = getCanvasCoords(currentAnchor.coordinates.lat, currentAnchor.coordinates.lng);

  return (
    <section className="py-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
      
      {/* Header with Cyber-Gaudí Ornament Ribbon */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-cyan-500/20">
        <div>
          <div className="text-xs font-mono text-cyan-400 flex items-center gap-2 mb-1.5">
            <span className="p-1 rounded-md bg-cyan-400/20 text-cyan-300">
              <Compass className="w-3.5 h-3.5" />
            </span>
            <span>HYPER-LOCAL GEO RADAR · ATELIERS & ART SALONS</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Nail Masters Sorted by Proximity
          </h2>
          <p className="text-xs opacity-75 mt-1 max-w-2xl leading-relaxed">
            Choose your anchor location (Home, Work, or Custom Pin). Nailix computes real-time walking and driving distance to each verified master’s salon.
          </p>
        </div>

        {/* Master Salon Address Editor Button */}
        {userRole === 'master' && (
          <button
            onClick={() => setIsEditingSalon(true)}
            className="btn-vangogh-gold text-xs py-2 px-4 flex items-center gap-2 self-start md:self-end"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Update My Salon Address</span>
          </button>
        )}
      </div>

      {/* Anchor Selection Ribbon */}
      <div className="gaudi-mosaic-card p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5" />
            <span>Select Your Frequent Anchor Location:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {anchorPoints.map(point => {
              const isActive = point.id === selectedAnchorId;
              const IconComp = point.id === 'home' ? Home : point.id === 'work' ? Briefcase : MapPin;

              return (
                <button
                  key={point.id}
                  onClick={() => setSelectedAnchorId(point.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500 via-blue-600 to-fuchsia-600 text-white shadow-lg shadow-cyan-500/25 ring-2 ring-cyan-300'
                      : isDark
                      ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 shadow-sm'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{point.name} ({point.label})</span>
                </button>
              );
            })}

            <button
              onClick={() => {
                setEditName(currentAnchor.name);
                setEditAddress(currentAnchor.address);
                setIsEditingAnchor(true);
              }}
              className={`px-3 py-2 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer border ${
                isDark 
                  ? 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 shadow-sm font-medium'
              }`}
              title="Edit Address / Coordinates"
            >
              <Edit3 className={`w-3.5 h-3.5 ${isDark ? 'text-cyan-400' : 'text-amber-700'}`} />
              <span>Edit Address</span>
            </button>
          </div>
        </div>

        {/* Active Anchor Summary */}
        <div className="text-left md:text-right text-xs">
          <p className={`text-[10px] uppercase font-mono ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>Current Reference Anchor</p>
          <p className={`font-semibold truncate max-w-xs ${isDark ? 'text-cyan-300' : 'text-sky-800 font-bold'}`}>{currentAnchor.address}</p>
          <p className={`text-[10px] font-mono ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
            Click map canvas anytime to reposition this anchor pin
          </p>
        </div>
      </div>

      {/* Edit Anchor Address Modal Form */}
      {isEditingAnchor && (
        <form 
          onSubmit={handleSaveAnchorEdit} 
          className="gaudi-mosaic-card p-5 border-2 border-cyan-400/50 space-y-4"
        >
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <h4 className="font-display text-sm font-bold text-white flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-amber-300" />
              <span>Configure Anchor Spot: {currentAnchor.name}</span>
            </h4>
            <button
              type="button"
              onClick={() => setIsEditingAnchor(false)}
              className="text-xs text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-gray-300 mb-1">Spot Name / Label</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="e.g. Home, Office, Gym, Studio"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/20 text-white"
              />
            </div>
            <div>
              <label className="block text-gray-300 mb-1">Street Address or District</label>
              <input
                type="text"
                value={editAddress}
                onChange={e => setEditAddress(e.target.value)}
                placeholder="e.g. Passeig de Gràcia 45, Eixample"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/20 text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="submit"
              className="btn-vangogh-gold text-xs py-1.5 px-4 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save & Reposition</span>
            </button>
          </div>
        </form>
      )}

      {/* Edit Master Salon Address Modal Form */}
      {isEditingSalon && (
        <form 
          onSubmit={handleSaveMasterSalon} 
          className="gaudi-mosaic-card p-5 border-2 border-amber-400/50 space-y-4"
        >
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <h4 className="font-display text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-300" />
              <span>Master Salon Profile & Address Registry</span>
            </h4>
            <button
              type="button"
              onClick={() => setIsEditingSalon(false)}
              className="text-xs text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-gray-300 mb-1">Master Account</label>
              <select
                value={salonMasterId}
                onChange={e => {
                  setSalonMasterId(e.target.value);
                  const art = artists.find(a => a.id === e.target.value);
                  if (art) {
                    setSalonNameInput(art.salonName || '');
                    setSalonAddressInput(art.salonAddress || '');
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/20 text-white"
              >
                {artists.map(art => (
                  <option key={art.id} value={art.id} className="bg-[#0b0c10]">
                    {art.name} (@{art.handle})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-300 mb-1">Salon Name</label>
              <input
                type="text"
                value={salonNameInput}
                onChange={e => setSalonNameInput(e.target.value)}
                placeholder="e.g. Atelier Vasiliev Couture"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/20 text-white"
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-1">Salon Street Address</label>
              <input
                type="text"
                value={salonAddressInput}
                onChange={e => setSalonAddressInput(e.target.value)}
                placeholder="e.g. Carrer de Provença 261, Eixample"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/20 text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="submit"
              className="btn-vangogh-gold text-xs py-1.5 px-4 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Publish Salon Address to Radar</span>
            </button>
          </div>
        </form>
      )}

      {/* Main Map + Proximity List Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Interactive Stylized Gaudí District Map Canvas (7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className={`font-mono font-semibold flex items-center gap-1.5 ${isDark ? 'text-cyan-400' : 'text-sky-800'}`}>
              <Navigation className="w-3.5 h-3.5" />
              <span>Interactive District Radar (Click to Move Anchor)</span>
            </span>
            <span className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>
              Center: Eixample · Sagrada Família · Gràcia
            </span>
          </div>

          <div 
            onClick={handleMapCanvasClick}
            className={`relative w-full aspect-[4/3] rounded-2xl overflow-hidden border-2 shadow-2xl cursor-crosshair group select-none ${
              isDark ? 'border-cyan-400/40 shadow-cyan-950/30' : 'border-amber-500/40 shadow-amber-900/10'
            }`}
            style={{
              background: isDark 
                ? 'linear-gradient(135deg, #090c16 0%, #0d1222 50%, #080b14 100%)' 
                : 'linear-gradient(135deg, #fefce8 0%, #fffbeb 50%, #f1f5f9 100%)',
            }}
          >
            {/* Gaudí Trencadís Mosaic District Lines Texture Overlay */}
            <div 
              className="absolute inset-0 opacity-15 pointer-events-none bg-cover bg-center"
              style={{ backgroundImage: `url('/assets/images/frame_ornament_border_1790127030568.jpg')` }}
            />

            {/* Stylized Street Grid Lines */}
            <svg className="absolute inset-0 w-full h-full opacity-25 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.8" className={isDark ? "text-cyan-400" : "text-sky-600"} />
                </pattern>
                <pattern id="diagonalStreet" width="120" height="120" patternUnits="userSpaceOnUse">
                  <path d="M 0 120 L 120 0" fill="none" stroke="currentColor" strokeWidth="1.5" className={isDark ? "text-amber-400" : "text-amber-600"} />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              <rect width="100%" height="100%" fill="url(#diagonalStreet)" />
            </svg>

            {/* District Labels */}
            <div className={`absolute top-4 left-6 text-[10px] font-mono tracking-widest uppercase pointer-events-none font-bold ${
              isDark ? 'text-cyan-400/70' : 'text-sky-800/80'
            }`}>
              Gràcia District
            </div>
            <div className={`absolute top-1/2 left-8 text-[10px] font-mono tracking-widest uppercase pointer-events-none font-bold ${
              isDark ? 'text-amber-400/70' : 'text-amber-800/80'
            }`}>
              Eixample Modernista
            </div>
            <div className={`absolute top-1/3 right-8 text-[10px] font-mono tracking-widest uppercase pointer-events-none font-bold ${
              isDark ? 'text-fuchsia-400/70' : 'text-purple-800/80'
            }`}>
              Sagrada Família
            </div>
            <div className={`absolute bottom-4 right-10 text-[10px] font-mono tracking-widest uppercase pointer-events-none font-bold ${
              isDark ? 'text-emerald-400/70' : 'text-emerald-800/80'
            }`}>
              Passeig de Gràcia
            </div>

            {/* Radar Pulse Circles Around Client Anchor */}
            <div
              className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${anchorCoords.x}%`, top: `${anchorCoords.y}%` }}
            >
              <div className="w-24 h-24 rounded-full border border-cyan-400/30 animate-ping" />
              <div className="absolute inset-0 w-44 h-44 -top-10 -left-10 rounded-full border border-cyan-500/20" />
            </div>

            {/* Client Anchor Pin */}
            <div
              className="absolute z-20 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
              style={{ left: `${anchorCoords.x}%`, top: `${anchorCoords.y}%` }}
            >
              <div className="px-2 py-0.5 rounded-full bg-cyan-500 text-black text-[10px] font-bold font-mono shadow-md mb-1 whitespace-nowrap">
                {currentAnchor.name} (YOU)
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center ring-4 ring-cyan-300 shadow-xl">
                {selectedAnchorId === 'home' ? (
                  <Home className="w-4 h-4" />
                ) : selectedAnchorId === 'work' ? (
                  <Briefcase className="w-4 h-4" />
                ) : (
                  <MapPin className="w-4 h-4" />
                )}
              </div>
            </div>

            {/* Master Salon Pins on Map */}
            {sortedArtists.map((artist, idx) => {
              const artCoords = artist.coordinates || { lat: 41.395, lng: 2.162 };
              const pos = getCanvasCoords(artCoords.lat, artCoords.lng);
              const isSelected = artist.id === (selectedArtistId || sortedArtists[0]?.id);
              const isClosest = idx === 0;

              return (
                <div
                  key={artist.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedArtistId(artist.id);
                  }}
                  className={`absolute z-10 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer transition-all duration-300 hover:scale-115 ${
                    isSelected ? 'z-30 scale-110' : ''
                  }`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  {/* Floating Distance Badge above salon pin */}
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shadow-lg mb-1 whitespace-nowrap border ${
                    isSelected
                      ? 'bg-amber-400 text-black border-amber-300'
                      : isClosest
                      ? 'bg-cyan-500 text-black border-cyan-300'
                      : 'bg-black/80 text-white border-white/20'
                  }`}>
                    {artist.travel.walkMinutes}m walk · {artist.distanceKm}km
                  </div>

                  {/* Salon Avatar Pin */}
                  <div className="relative">
                    <img
                      src={artist.avatar}
                      alt={artist.name}
                      className={`w-9 h-9 rounded-full object-cover shadow-2xl transition-all ${
                        isSelected
                          ? 'ring-4 ring-amber-400'
                          : isClosest
                          ? 'ring-3 ring-cyan-400'
                          : 'ring-2 ring-white/60'
                      }`}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
                      }}
                    />
                    <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-emerald-500 text-white">
                      <Star className="w-2.5 h-2.5 fill-current" />
                    </div>
                  </div>

                  {/* Salon Name Label */}
                  <span className="text-[10px] font-semibold text-white bg-black/75 px-1.5 py-0.5 rounded mt-0.5 truncate max-w-[100px]">
                    {artist.salonName?.split(' ')[0] || artist.name.split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-gray-400 text-center font-mono">
            💡 Tip: Click anywhere on the map grid to update your {currentAnchor.name} location coordinates.
          </p>
        </div>

        {/* Proximity Sorted List of Salons (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-amber-400 font-bold">
              Closest Masters to {currentAnchor.name} ({sortedArtists.length})
            </span>
            <span className="text-[11px] text-gray-400 font-mono">
              Auto-Calculated Radius
            </span>
          </div>

          <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
            {sortedArtists.map((artist, index) => {
              const isSelected = artist.id === (selectedArtistId || sortedArtists[0]?.id);
              const isClosest = index === 0;

              return (
                <div
                  key={artist.id}
                  onClick={() => setSelectedArtistId(artist.id)}
                  className={`gaudi-mosaic-card p-4 transition-all duration-300 cursor-pointer ${
                    isSelected
                      ? isDark
                        ? 'border-2 border-amber-400 shadow-xl shadow-amber-500/10'
                        : 'border-2 border-amber-600 shadow-lg shadow-amber-900/15 bg-amber-50/80'
                      : isClosest
                      ? isDark ? 'border-cyan-400/50' : 'border-sky-500/60'
                      : isDark ? 'hover:border-white/30' : 'hover:border-amber-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={artist.avatar}
                        alt={artist.name}
                        className="w-12 h-12 rounded-xl object-cover ring-2 ring-cyan-400/40 shadow-md shrink-0"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
                        }}
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-display text-sm font-bold text-white">
                            {artist.name}
                          </h4>
                          {isClosest && (
                            <span className="px-1.5 py-0.2 rounded bg-cyan-500 text-black text-[9px] font-bold font-mono">
                              CLOSEST
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-amber-300">
                          {artist.salonName || 'Private Nail Atelier'}
                        </p>
                        <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span className="truncate max-w-[200px]">{artist.salonAddress || artist.location}</span>
                        </p>
                      </div>
                    </div>

                    {/* Proximity Badge */}
                    <div className="text-right shrink-0">
                      <div className="font-mono text-xs font-bold text-cyan-300">
                        {artist.distanceKm} km
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono">
                        🚶 {artist.travel.walkMinutes} mins
                      </div>
                    </div>
                  </div>

                  {/* Working Hours & Rating */}
                  <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 text-gray-300 text-[11px]">
                      <span className="flex items-center gap-1 text-amber-300 font-semibold">
                        <Star className="w-3 h-3 fill-current" />
                        <span>{artist.rating}</span>
                      </span>
                      <span className="flex items-center gap-1 text-gray-400 font-mono">
                        <Clock className="w-3 h-3 text-cyan-400" />
                        <span>{artist.workingHours || '10:00 - 20:00'}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenChatWithArtist(artist);
                        }}
                        className={`p-1.5 rounded-lg transition-colors border ${
                          isDark 
                            ? 'bg-white/10 hover:bg-white/20 text-gray-200 border-transparent' 
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 shadow-sm'
                        }`}
                        title="Chat & Consult"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectArtistToBook(artist);
                        }}
                        className="btn-vangogh-gold text-xs py-1 px-3 flex items-center gap-1 shadow-sm"
                      >
                        <Calendar className="w-3 h-3" />
                        <span>Book</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </section>
  );
};
