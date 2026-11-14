import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage, Artist, UserRole } from '../types';
import { DEMO_CLIENT_PROFILE } from '../data/initialData';
import { createSeedSnapshot } from '../infrastructure/storage/salonRepository';

export interface UseChatConciergeOptions {
  userRole: UserRole;
  artists: Artist[];
  initialMessages?: ChatMessage[];
  onBroadcastToSwarm?: (type: string, payload: unknown) => void;
  onPersistChats?: (next: ChatMessage[], payload: unknown) => void;
}

export function useChatConcierge({
  userRole,
  artists,
  initialMessages,
  onBroadcastToSwarm,
  onPersistChats,
}: UseChatConciergeOptions) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(
    () => initialMessages ?? createSeedSnapshot().chats
  );
  const chatMessagesRef = useRef<ChatMessage[]>(chatMessages);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(1);
  const [activeThreadId, setActiveThreadId] = useState<string>(() => artists[0]?.id || 'artist-1');

  const openChat = useCallback((artistOrId?: Artist | string) => {
    if (artistOrId) {
      const targetId = typeof artistOrId === 'string' ? artistOrId : artistOrId.id;
      if (targetId) {
        setActiveThreadId(targetId);
      }
    }
    setIsChatOpen(true);
    setUnreadChatCount(0);
  }, []);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  const handleSendMessage = useCallback(
    (text: string, threadId: string, quoteAttachment?: ChatMessage['quoteAttachment']) => {
      const activeArt = artists.find(a => a.id === threadId);
      const uniqueId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `msg-${crypto.randomUUID()}`
          : `msg-${Date.now()}`;

      const newMsg: ChatMessage = {
        id: uniqueId,
        threadId,
        senderId: userRole === 'client' ? 'client-me' : threadId,
        senderName: userRole === 'client' ? DEMO_CLIENT_PROFILE.name : activeArt?.name || 'Master Artist',
        senderRole: userRole,
        recipientId: activeArt?.id || threadId,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        quoteAttachment,
      };

      const nextMessages = [...chatMessagesRef.current, newMsg];
      chatMessagesRef.current = nextMessages;
      setChatMessages(nextMessages);

      onPersistChats?.(nextMessages, {
        threadId,
        msgId: newMsg.id,
      });

      // [SIM] Broadcast chat message event via injected swarm facade (not encrypted)
      onBroadcastToSwarm?.('CHAT_MESSAGE_BUFFERED', {
        threadId,
        msgId: newMsg.id,
      });
    },
    [artists, onBroadcastToSwarm, onPersistChats, userRole]
  );

  return {
    chatMessages,
    setChatMessages,
    isChatOpen,
    setIsChatOpen,
    unreadChatCount,
    setUnreadChatCount,
    activeThreadId,
    setActiveThreadId,
    openChat,
    closeChat,
    handleSendMessage,
  };
}
