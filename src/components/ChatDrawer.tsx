import React, { useState, useEffect } from 'react';
import { X, Send, MessageSquare } from 'lucide-react';
import { ChatMessage, Artist } from '../types';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string, threadId: string, quote?: ChatMessage['quoteAttachment']) => void;
  artists: Artist[];
  activeThreadId?: string;
  onSelectThread?: (threadId: string) => void;
  userRole: 'client' | 'master';
  onBookService: (artist: Artist, serviceName: string, price: number) => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  artists,
  activeThreadId,
  onSelectThread,
  userRole,
  onBookService,
}) => {
  if (!isOpen) return null;

  return (
    <ChatDrawerContent
      onClose={onClose}
      messages={messages}
      onSendMessage={onSendMessage}
      artists={artists}
      activeThreadId={activeThreadId}
      onSelectThread={onSelectThread}
      userRole={userRole}
      onBookService={onBookService}
    />
  );
};

type ChatDrawerContentProps = Omit<ChatDrawerProps, 'isOpen'>;

const ChatDrawerContent: React.FC<ChatDrawerContentProps> = ({
  onClose,
  messages,
  onSendMessage,
  artists,
  activeThreadId,
  onSelectThread,
  userRole,
  onBookService,
}) => {
  const [selectedThreadId, setSelectedThreadId] = useState<string>(
    activeThreadId || artists[0]?.id || 'artist-1'
  );
  const [inputText, setInputText] = useState<string>('');
  const [includeQuote, setIncludeQuote] = useState<boolean>(false);

  useEffect(() => {
    if (activeThreadId && activeThreadId !== selectedThreadId) {
      setSelectedThreadId(activeThreadId);
    }
  }, [activeThreadId, selectedThreadId]);

  const handleSelectThread = (artistId: string) => {
    setSelectedThreadId(artistId);
    onSelectThread?.(artistId);
  };

  const activeArtist = artists.find(a => a.id === selectedThreadId) || artists[0];
  const threadMessages = messages.filter(m => m.threadId === selectedThreadId);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    let quoteAttachment: ChatMessage['quoteAttachment'] = undefined;
    if (includeQuote && userRole === 'master' && activeArtist?.services[0]) {
      const srv = activeArtist.services[0];
      quoteAttachment = {
        serviceName: srv.name,
        price: srv.priceUSD,
        currency: 'USDC',
        durationMinutes: srv.durationMinutes,
      };
    }

    onSendMessage(inputText, selectedThreadId, quoteAttachment);
    setInputText('');
    setIncludeQuote(false);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#101218] border-l border-[#272a33] shadow-2xl flex flex-col">
      {/* Drawer Header */}
      <div className="p-4 border-b border-red-500/30 flex items-center justify-between bg-[#070912]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-950/80 text-red-300 border border-red-500/40">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-bold text-white">Studio Consultations</h3>
              <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-red-950 text-red-300 border border-red-500/50">
                [SIM]
              </span>
            </div>
            <p className="text-[11px] text-red-300 font-mono">
              [SIM] Local session chat · Not encrypted (Stage 4 adds WebRTC)
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close chat"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Honest Simulation Notice */}
      <div className="px-4 py-2 bg-red-950/30 border-b border-red-500/30 text-[11px] font-mono text-red-200 flex items-center justify-between">
        <span>[SIM] Messages stay in browser session memory & local tab BroadcastChannel. Plaintext JSON in demo mode.</span>
      </div>

      {/* Artist Thread Switcher */}
      <div className="p-2.5 bg-[#14161d] border-b border-[#1f222b] flex items-center gap-2 overflow-x-auto">
        {artists.map(art => {
          const isActive = art.id === selectedThreadId;
          return (
            <button
              key={art.id}
              onClick={() => handleSelectThread(art.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#272a33] text-white font-medium'
                  : 'text-[#9ca3af] hover:text-white hover:bg-[#191b22]'
              }`}
            >
              <img
                src={art.avatar}
                alt={art.name}
                className="w-5 h-5 rounded-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
                }}
              />
              <span>{art.name.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {threadMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#9ca3af]">
            <p className="text-xs">No previous consultation with {activeArtist?.name}.</p>
            <p className="text-[11px] text-[#6b7280] mt-1">Send a message or quote preview to test session chat [SIM].</p>
          </div>
        ) : (
          threadMessages.map(msg => {
            const isMe = userRole === 'client' ? msg.senderRole === 'client' : msg.senderRole === 'master';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-[#9ca3af] mb-1 font-mono">
                  <span>{msg.senderName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{msg.timestamp}</span>
                </div>

                <div
                  className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed space-y-2 ${
                    isMe
                      ? 'bg-[#d4af37] text-[#0b0c10] font-medium rounded-tr-none'
                      : 'bg-[#15171e] text-white border border-[#272a33] rounded-tl-none'
                  }`}
                >
                  <p>{msg.text}</p>

                  {msg.inspirationImg && (
                    <div className="rounded-lg overflow-hidden border border-black/20 my-1">
                      <img
                        src={msg.inspirationImg}
                        alt="Inspiration reference"
                        className="w-full h-32 object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.src = '/assets/images/portfolio_cyber_chrome_1790123880263.jpg';
                        }}
                      />
                    </div>
                  )}

                  {msg.quoteAttachment && (
                    <div className="p-2.5 rounded-lg bg-black/25 border border-white/10 space-y-2 text-white">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-[#38bdf8]">STUDIO QUOTE [SIM]</span>
                        <span className="font-bold">${msg.quoteAttachment.price} {msg.quoteAttachment.currency}</span>
                      </div>
                      <p className="font-semibold text-xs">{msg.quoteAttachment.serviceName}</p>
                      <p className="text-[10px] opacity-80">{msg.quoteAttachment.durationMinutes} mins session</p>

                      {userRole === 'client' && (
                        <button
                          onClick={() => {
                            if (activeArtist && msg.quoteAttachment) {
                              onBookService(activeArtist, msg.quoteAttachment.serviceName, msg.quoteAttachment.price);
                              onClose();
                            }
                          }}
                          className="w-full py-1.5 px-3 bg-white text-black font-semibold text-[11px] rounded hover:bg-[#e6c158] transition-colors cursor-pointer"
                        >
                          Book Quoted Slot [SIM]
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={handleSend} className="p-3 bg-[#0e1015] border-t border-[#1f222b] space-y-2">
        {userRole === 'master' && (
          <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
            <input
              type="checkbox"
              id="includeQuote"
              checked={includeQuote}
              onChange={e => setIncludeQuote(e.target.checked)}
              className="w-3.5 h-3.5 accent-[#d4af37] rounded cursor-pointer"
            />
            <label htmlFor="includeQuote" className="cursor-pointer text-[11px]">
              Attach standard booking quote ({activeArtist?.services[0]?.name})
            </label>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder={`Message ${activeArtist?.name || 'artist'}...`}
            className="flex-1 px-3 py-2 text-xs bg-[#15171e] border border-[#272a33] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:border-[#d4af37]"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2 bg-[#d4af37] text-[#0b0c10] rounded-lg hover:bg-[#e6c158] transition-colors disabled:opacity-40 cursor-pointer"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
