import React from 'react';
import { ShieldCheck, CheckCircle2, Star, Calendar, MessageSquare, Instagram, MapPin, Sparkles } from 'lucide-react';
import { Artist } from '../types';

interface ArtistsViewProps {
  artists: Artist[];
  onSelectArtistToBook: (artist: Artist) => void;
  onOpenChatWithArtist: (artist: Artist) => void;
}

export const ArtistsView: React.FC<ArtistsViewProps> = ({
  artists,
  onSelectArtistToBook,
  onOpenChatWithArtist,
}) => {
  return (
    <div className="py-12 bg-starry-canvas relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Header */}
        <div className="pb-6 border-b border-cyan-500/20">
          <div className="text-xs font-mono text-cyan-400 mb-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>ACCREDITED NAIL ARTISANS · WEB-OF-TRUST GUILD</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Verified Master Sculptors & Technicians
          </h2>
          <p className="text-xs text-gray-300 mt-1 max-w-2xl leading-relaxed">
            Every artist on Nailix is backed by Friend Circle consensus verification, on-chain staked $NAIL integrity deposits, and cryptographic portfolio reviews.
          </p>
        </div>

        {/* Artists Grid with Luxury Ornament Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {artists.map((artist) => (
            <div
              key={artist.id}
              className="gaudi-mosaic-card p-6 flex flex-col justify-between space-y-6 hover:border-cyan-400 hover:shadow-cyan-500/10 transition-all duration-300"
            >
              <div className="space-y-4">
                {/* Artist Header Info */}
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <img
                      src={artist.avatar}
                      alt={artist.name}
                      className="w-16 h-16 rounded-2xl object-cover ring-2 ring-cyan-400/50 shadow-md"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
                      }}
                    />
                    <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-cyan-500 text-black">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-display text-base font-bold text-white truncate">
                        {artist.name}
                      </h3>
                    </div>
                    <p className="text-xs text-fuchsia-400 font-mono">@{artist.handle}</p>
                    <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-cyan-400" />
                      <span>{artist.location}</span>
                    </p>
                  </div>
                </div>

                {/* Bio */}
                <p className="text-xs text-gray-300 leading-relaxed line-clamp-3">
                  {artist.bio}
                </p>

                {/* Guild Reputation Metrics */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-[#090c17] border border-cyan-500/20 text-center font-mono">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">Trust</p>
                    <p className="text-xs font-bold text-cyan-300">{artist.reputationScore}%</p>
                  </div>
                  <div className="border-x border-cyan-500/20">
                    <p className="text-[10px] text-gray-400 uppercase">Rating</p>
                    <p className="text-xs font-bold text-amber-300 flex items-center justify-center gap-0.5">
                      <Star className="w-3 h-3 fill-current" />
                      <span>{artist.rating}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">Staked</p>
                    <p className="text-xs font-bold text-emerald-400">{(artist.stakedNAIL / 1000).toFixed(0)}k $NAIL</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2 border-t border-cyan-500/20">
                <button
                  onClick={() => onSelectArtistToBook(artist)}
                  className="btn-vangogh-gold text-xs py-2 px-3 flex-1 flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Book Master</span>
                </button>

                <button
                  onClick={() => onOpenChatWithArtist(artist)}
                  className="btn-starry-neon text-xs py-2 px-3 flex items-center justify-center gap-1.5"
                  title="Encrypted Consultation"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-300" />
                  <span className="hidden sm:inline">Consult</span>
                </button>
              </div>

            </div>
          ))}
        </div>

      </div>
    </div>
  );
};
