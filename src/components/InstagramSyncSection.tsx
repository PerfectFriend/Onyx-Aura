import React, { useState } from 'react';
import { Instagram, RefreshCw, Check, Bookmark, Heart, Layers, ArrowUpRight } from 'lucide-react';
import { Artist, ServiceCategory } from '../types';

interface InstagramSyncSectionProps {
  artists: Artist[];
  onImportPost: (post: {
    title: string;
    artistId: string;
    artistName: string;
    artistHandle: string;
    artistAvatar: string;
    image: string;
    category: ServiceCategory;
    priceUSD: number;
    durationMinutes: number;
  }) => void;
}

export const InstagramSyncSection: React.FC<InstagramSyncSectionProps> = ({
  artists,
  onImportPost,
}) => {
  const [selectedArtist, setSelectedArtist] = useState<Artist>(artists[0]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncedCount, setSyncedCount] = useState<number>(14);
  const [customHandle, setCustomHandle] = useState<string>(selectedArtist.igHandle);

  const handleSyncNow = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncedCount(prev => prev + 1);

      // Trigger automatic import of latest editorial post to portfolio
      onImportPost({
        title: 'Cyberpunk Platinum French Stilettos (IG Live Sync)',
        artistId: selectedArtist.id,
        artistName: selectedArtist.name,
        artistHandle: selectedArtist.handle,
        artistAvatar: selectedArtist.avatar,
        image: '/assets/images/portfolio_cyber_chrome_1790123880263.jpg',
        category: 'Sculptural 3D Chrome',
        priceUSD: 170,
        durationMinutes: 110,
      });
    }, 1200);
  };

  return (
    <div className="py-10 bg-[#0b0c10]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#1f222b]">
          <div>
            <div className="text-xs font-mono text-[#ec4899] flex items-center gap-2 mb-1">
              <Instagram className="w-3.5 h-3.5" />
              <span>INSTAGRAM PORTFOLIO SYNC [SIM]</span>
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-950/90 text-red-300 border border-red-500/60">
                [SIM] DEMO FEED
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Instagram Portfolio Sync Preview [SIM]
            </h2>
            <p className="text-xs text-[#9ca3af] mt-1 max-w-2xl">
              [SIM] Interactive preview of importing curated sample nail sets into the local session gallery. Live Meta OAuth API is not connected yet.
            </p>
          </div>

          {/* Sync CTA */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-[#d946ef] to-[#ec4899] hover:opacity-95 rounded-md transition-all flex items-center gap-2 shadow-lg shadow-pink-500/10 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Importing Demo Sample [SIM]...' : 'Import Demo IG Set [SIM]'}</span>
            </button>
          </div>
        </div>

        {/* Artist Profile Selector */}
        <div className="flex items-center gap-2 p-1 bg-[#15171e] rounded-lg border border-[#272a33] max-w-fit">
          {artists.map(art => (
            <button
              key={art.id}
              onClick={() => {
                setSelectedArtist(art);
                setCustomHandle(art.igHandle);
              }}
              className={`px-3 py-1.5 text-xs rounded transition-all cursor-pointer ${
                selectedArtist.id === art.id
                  ? 'bg-[#272a33] text-white font-medium shadow-sm'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
            >
              {art.name}
            </button>
          ))}
        </div>

        {/* Instagram Profile Connection Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left: Profile Connection status */}
          <div className="lg:col-span-5 p-6 rounded-xl bg-[#12141a] border border-[#272a33] space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#1f222b]">
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <img
                    src={selectedArtist.avatar}
                    alt={selectedArtist.name}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-[#ec4899]"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute -bottom-1 -right-1 p-1 bg-[#ec4899] rounded-full text-white">
                    <Instagram className="w-2.5 h-2.5" />
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-white">{selectedArtist.name}</h4>
                  <p className="text-xs text-[#ec4899] font-mono">@{customHandle}</p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-mono text-red-300 flex items-center gap-1 justify-end">
                  <Check className="w-3.5 h-3.5" />
                  <span>Demo Feed [SIM]</span>
                </span>
                <p className="text-[10px] text-[#9ca3af]">No live OAuth connected</p>
              </div>
            </div>

            {/* Zero-Pill Social Metrics */}
            <div className="grid grid-cols-3 gap-2 py-2 border-y border-[#1f222b] text-center">
              <div>
                <p className="font-mono text-lg font-bold text-white tabular-nums">
                  {selectedArtist.igFollowers.toLocaleString()}
                </p>
                <p className="text-[10px] text-[#9ca3af]">Seed Followers [SIM]</p>
              </div>
              <div>
                <p className="font-mono text-lg font-bold text-[#ec4899] tabular-nums">
                  {selectedArtist.igEngagementRate}
                </p>
                <p className="text-[10px] text-[#9ca3af]">Seed Engagement [SIM]</p>
              </div>
              <div>
                <p className="font-mono text-lg font-bold text-[#38bdf8] tabular-nums">
                  {syncedCount}
                </p>
                <p className="text-[10px] text-[#9ca3af]">Synced in Session</p>
              </div>
            </div>

            {/* Auto-Sync Configuration */}
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-[#15171e] rounded-lg border border-[#272a33]">
                <div>
                  <p className="font-medium text-white">Auto-Sync New Portfolio Posts</p>
                  <p className="text-[11px] text-[#9ca3af]">Imports hashtag #NailixArt immediately</p>
                </div>
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 accent-[#ec4899] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-[#15171e] rounded-lg border border-[#272a33]">
                <div>
                  <p className="font-medium text-white">Sync Save & Bookmark Counts</p>
                  <p className="text-[11px] text-[#9ca3af]">Pulls real-time Reel reach into reviews</p>
                </div>
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 accent-[#ec4899] rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Right: Synced Instagram Grid preview */}
          <div className="lg:col-span-7 p-6 rounded-xl bg-[#12141a] border border-[#272a33] space-y-4">
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#ec4899]" />
                <span>Synchronized Instagram Media Feed</span>
              </h3>
              <span className="text-[11px] text-[#9ca3af] font-mono">Last fetch: 2 minutes ago</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  id: 'ig-1',
                  img: '/assets/images/portfolio_cyber_chrome_1790123880263.jpg',
                  likes: '4.8k',
                  saves: '2.1k',
                  caption: 'Molten liquid silver chrome coffin shape',
                },
                {
                  id: 'ig-2',
                  img: '/assets/images/portfolio_aurora_glass_1790123870720.jpg',
                  likes: '6.2k',
                  saves: '3.4k',
                  caption: 'Japanese glass aura layered with lilac syrup',
                },
                {
                  id: 'ig-3',
                  img: '/assets/images/hero_editorial_nailart_1790123859239.jpg',
                  likes: '9.4k',
                  saves: '5.1k',
                  caption: 'Editorial crystal platinum couture runway',
                },
              ].map(post => (
                <div key={post.id} className="group relative rounded-lg overflow-hidden border border-[#272a33] aspect-square">
                  <img
                    src={post.img}
                    alt={post.caption}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5 text-white text-[11px]">
                    <p className="line-clamp-2 leading-tight">{post.caption}</p>
                    <div className="flex items-center justify-between font-mono pt-1 text-[10px] text-[#d1d5db]">
                      <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-[#f43f5e]" /> {post.likes}</span>
                      <span className="flex items-center gap-1"><Bookmark className="w-3 h-3 text-[#38bdf8]" /> {post.saves}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-[#15171e] rounded-lg border border-red-500/30 flex items-center justify-between text-xs text-[#9ca3af]">
              <span>[SIM] Static sample preview (live Meta Graph OAuth not configured)</span>
              <a
                href={`https://instagram.com/${customHandle}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#ec4899] hover:underline flex items-center gap-1 font-mono text-[11px]"
              >
                <span>View Live Instagram Profile</span>
                <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
