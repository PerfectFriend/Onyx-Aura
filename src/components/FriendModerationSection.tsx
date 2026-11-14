import React, { useState } from 'react';
import {
  Users, ShieldAlert, CheckCircle2, AlertTriangle,
  UserPlus, Award, ThumbsUp, ThumbsDown
} from 'lucide-react';
import { TranslationStrings } from '../i18n/translations';

export interface FriendJuror {
  id: string;
  name: string;
  avatar: string;
  handle: string;
  trustScore: number;
  votesCast: number;
  status: 'active' | 'invited';
}

export interface ModerationCase {
  id: string;
  artworkTitle: string;
  authorName: string;
  authorAvatar: string;
  artworkImage: string;
  reportReason: string;
  reportCategory: 'ai_suspicion' | 'stolen_art' | 'sanitation_dispute' | 'inappropriate';
  friendVotesFor: number;
  friendVotesAgainst: number;
  requiredQuorum: number;
  status: 'pending' | 'resolved_approved' | 'resolved_rejected';
  userHasVoted?: 'approved' | 'rejected';
}

const INITIAL_FRIENDS: FriendJuror[] = [
  {
    id: 'fr-1',
    name: 'Elena V. (Елена Васильева)',
    avatar: '/assets/images/avatar_master_artist_1790123890131.jpg',
    handle: '@elena_art',
    trustScore: 98,
    votesCast: 42,
    status: 'active',
  },
  {
    id: 'fr-2',
    name: 'Chloe Chen (陳美華)',
    avatar: '/assets/images/artist_chloe_chen.jpg',
    handle: '@chloe_chen',
    trustScore: 96,
    votesCast: 37,
    status: 'active',
  },
  {
    id: 'fr-3',
    name: 'Mateo Rossi (Barcelona)',
    avatar: '/assets/images/artist_mateo_rossi.jpg',
    handle: '@mateo_mosaic',
    trustScore: 94,
    votesCast: 29,
    status: 'active',
  },
  {
    id: 'fr-4',
    name: 'Aoi Tanaka (田中葵)',
    avatar: '/assets/images/juror_sofia.jpg',
    handle: '@aoi_nails',
    trustScore: 99,
    votesCast: 51,
    status: 'active',
  },
];

const INITIAL_CASES: ModerationCase[] = [
  {
    id: 'case-101',
    artworkTitle: 'Imperial Chrome Dragon Claws',
    authorName: 'Sora Nova',
    authorAvatar: '/assets/images/artist_chloe_chen.jpg',
    artworkImage: '/assets/images/portfolio_cyber_chrome_1790123880263.jpg',
    reportReason: 'User reported suspicion of 3D computer graphics instead of real physical nail sculpting.',
    reportCategory: 'ai_suspicion',
    friendVotesFor: 2,
    friendVotesAgainst: 0,
    requiredQuorum: 3,
    status: 'pending',
  },
  {
    id: 'case-102',
    artworkTitle: 'Stained Glass Royal Mosaic Coffin',
    authorName: 'Valerie Thorne',
    authorAvatar: '/assets/images/artist_maya_dupont.jpg',
    artworkImage: '/assets/images/portfolio_gaudi_mosaic_nails_1790126128212.jpg',
    reportReason: 'Check for authentic cuticle work and original hand-painted porcelain tiles.',
    reportCategory: 'stolen_art',
    friendVotesFor: 2,
    friendVotesAgainst: 1,
    requiredQuorum: 3,
    status: 'pending',
  },
];

interface FriendModerationSectionProps {
  t: TranslationStrings;
}

export const FriendModerationSection: React.FC<FriendModerationSectionProps> = ({ t }) => {
  const [friends, setFriends] = useState<FriendJuror[]>(INITIAL_FRIENDS);
  const [cases, setCases] = useState<ModerationCase[]>(INITIAL_CASES);
  const [inviteInput, setInviteInput] = useState<string>('');
  const [showInviteSuccess, setShowInviteSuccess] = useState<boolean>(false);

  // Invite a new friend to user's jury circle [SIM]
  const handleInviteFriend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteInput.trim()) return;

    const uniqueId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 8)
        : `${Date.now()}`;

    const newFriend: FriendJuror = {
      id: `fr-${uniqueId}`,
      name: inviteInput.trim(),
      avatar: '/assets/images/juror_user.jpg',
      handle: `@${inviteInput.trim().toLowerCase().replace(/\s+/g, '_')}`,
      trustScore: 90,
      votesCast: 0,
      status: 'active',
    };

    setFriends(prev => [...prev, newFriend]);
    setInviteInput('');
    setShowInviteSuccess(true);
    setTimeout(() => setShowInviteSuccess(false), 4000);
  };

  // Cast vote on a moderation case
  const handleVote = (caseId: string, decision: 'approved' | 'rejected') => {
    setCases(prev => prev.map(c => {
      if (c.id !== caseId || c.userHasVoted) return c;

      const newFor = decision === 'approved' ? c.friendVotesFor + 1 : c.friendVotesFor;
      const newAgainst = decision === 'rejected' ? c.friendVotesAgainst + 1 : c.friendVotesAgainst;
      
      let nextStatus = c.status;
      if (newFor >= c.requiredQuorum) nextStatus = 'resolved_approved';
      else if (newAgainst >= c.requiredQuorum) nextStatus = 'resolved_rejected';

      return {
        ...c,
        friendVotesFor: newFor,
        friendVotesAgainst: newAgainst,
        status: nextStatus,
        userHasVoted: decision,
      };
    }));
  };

  return (
    <div className="py-12 bg-starry-canvas relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-cyan-500/20">
          <div>
            <div className="text-xs font-mono text-cyan-400 flex flex-wrap items-center gap-2 mb-1.5">
              <span className="p-1 rounded-md bg-cyan-400/20 text-cyan-300">
                <Users className="w-3.5 h-3.5" />
              </span>
              <span className="uppercase tracking-wider">WEB-OF-TRUST · FRIEND JURY DAO</span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-950/90 text-red-300 border border-red-500/60 tracking-wider">
                [SIM] DAO SIMULATION
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {t.moderationTitle}
            </h2>
            <div className="my-2 p-2.5 bg-red-950/30 border border-red-500/40 rounded text-[11px] text-red-200 flex items-center gap-2">
              <span className="font-mono font-bold bg-red-900/60 px-1.5 py-0.5 rounded text-red-300 text-[10px]">[SIM]</span>
              <span>Симуляция консенсуса жюри (локальный React State). P2P-синхронизация голосов запланирована на Этапе 5 (Закон 1, 7, 10).</span>
            </div>
            <p className="text-xs text-gray-300 mt-1 max-w-2xl leading-relaxed">
              {t.moderationSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="gaudi-organic-tag flex items-center gap-1.5 text-amber-300 border-amber-400/30">
              <Award className="w-3.5 h-3.5" />
              <span>{t.juryEarnReward}</span>
            </span>
          </div>
        </div>

        {/* Top: My Circle of Trusted Friends */}
        <div className="gaudi-mosaic-card p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
                <span>My Trusted Friend Circle (Круг Друзей)</span>
                <span className="text-xs font-mono text-cyan-400">({friends.length} Jurors)</span>
              </h3>
              <p className="text-xs text-gray-300">
                [SIM] These sample trusted masters and friends model a jury quorum in local session state.
              </p>
            </div>

            {/* Invite Form */}
            <form onSubmit={handleInviteFriend} className="flex items-center gap-2">
              <input
                type="text"
                value={inviteInput}
                onChange={e => setInviteInput(e.target.value)}
                placeholder="Friend name or @handle..."
                className="px-3 py-2 text-xs rounded-lg bg-[#070913] border border-cyan-500/30 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 w-48 sm:w-56"
              />
              <button
                type="submit"
                className="btn-vangogh-gold text-xs py-2 px-3 whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5 mr-1" />
                <span>Invite</span>
              </button>
            </form>
          </div>

          {showInviteSuccess && (
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Friend invited to your Web-of-Trust Jury Circle with voting rights!</span>
            </div>
          )}

          {/* Friends Carousel / Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {friends.map(fr => (
              <div
                key={fr.id}
                className="p-4 rounded-xl bg-[#0a0d18] border border-cyan-500/20 hover:border-cyan-400/50 transition-all space-y-3"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={fr.avatar}
                    alt={fr.name}
                    className="w-11 h-11 rounded-full object-cover ring-2 ring-cyan-400/30"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.src = '/assets/images/juror_sofia.jpg';
                    }}
                  />
                  <div className="truncate">
                    <p className="text-xs font-bold text-white truncate">{fr.name}</p>
                    <p className="text-[11px] text-fuchsia-400 font-mono">{fr.handle}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono pt-2 border-t border-cyan-500/10 text-gray-300">
                  <span>Trust Score: <span className="text-cyan-300 font-bold">{fr.trustScore}%</span></span>
                  <span>Votes: <span className="text-amber-300 font-bold">{fr.votesCast}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Moderation Cases (Friend Consensus Queue) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <span>{t.activeCases}</span>
            </h3>
            <span className="text-xs font-mono text-cyan-400">{t.friendsQuorum}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cases.map(c => {
              const quorumProgress = Math.min(100, ((c.friendVotesFor + c.friendVotesAgainst) / c.requiredQuorum) * 100);
              const isResolved = c.status !== 'pending';

              return (
                <div
                  key={c.id}
                  className="gaudi-mosaic-card p-6 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Author & Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={c.authorAvatar}
                          alt={c.authorName}
                          className="w-8 h-8 rounded-full object-cover border border-cyan-400/40"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = '/assets/images/artist_chloe_chen.jpg';
                          }}
                        />
                        <div>
                          <p className="text-xs font-bold text-white">{c.artworkTitle}</p>
                          <p className="text-[10px] text-gray-400">By {c.authorName}</p>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase ${
                        c.status === 'resolved_approved' 
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : c.status === 'resolved_rejected'
                          ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                      }`}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Artwork Preview */}
                    <div className="relative rounded-xl overflow-hidden aspect-video border border-cyan-500/30 group">
                      <img
                        src={c.artworkImage}
                        alt={c.artworkTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.src = '/assets/images/portfolio_gaudi_mosaic_nails_1790126128212.jpg';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                        <p className="text-[11px] text-amber-200 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="line-clamp-2">{c.reportReason}</span>
                        </p>
                      </div>
                    </div>

                    {/* Quorum Progress Bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-gray-300">Friend Votes: {c.friendVotesFor} Authentic / {c.friendVotesAgainst} Flagged</span>
                        <span className="text-cyan-400">{c.friendVotesFor + c.friendVotesAgainst}/{c.requiredQuorum} Required</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#070913] overflow-hidden border border-cyan-500/20">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-400 transition-all duration-500"
                          style={{ width: `${quorumProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Voting Actions */}
                  <div className="pt-3 border-t border-cyan-500/20">
                    {c.userHasVoted ? (
                      <div className="text-center py-2 text-xs font-mono text-cyan-300 bg-cyan-950/40 rounded-lg border border-cyan-400/30">
                        ✓ You cast your friend vote: {c.userHasVoted === 'approved' ? 'Authentic Handcraft' : 'Violation'}
                      </div>
                    ) : isResolved ? (
                      <div className="text-center py-2 text-xs font-mono text-gray-400">
                        Case resolved by friend consensus.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => handleVote(c.id, 'approved')}
                          className="btn-vangogh-gold text-xs py-2 flex items-center justify-center gap-1.5"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <span>{t.voteAuthentic}</span>
                        </button>
                        <button
                          onClick={() => handleVote(c.id, 'rejected')}
                          className="btn-starry-neon text-xs py-2 flex items-center justify-center gap-1.5 border-rose-500/40 text-rose-200"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                          <span>{t.voteFlag}</span>
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};
