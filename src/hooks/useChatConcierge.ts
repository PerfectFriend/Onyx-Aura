import { useState, useCallback } from 'react';
import { ChatMessage, Artist, UserRole } from '../types';
import { INITIAL_CHATS } from '../data/initialData';
import { cryptoCloudSwarm } from '../simulation/cryptocloud';

export interface UseChatConciergeOptions {
  userRole: UserRole;
  artists: Artist[];
  initialMessages?: ChatMessage[];
}

export function useChatConcierge({
  userRole,
  artists,
  initialMessages = INITIAL_CHATS,
}: UseChatConciergeOptions) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialMessages);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(1);

  const openChat = useCallback((artistOrId?: Artist | string) => {
    setIsChatOpen(true);
    setUnreadChatCount(0);
    // If an artist or ID is provided, it can be used for selecting the active thread
    if (artistOrId) {
      // artistOrId can be logged or used to switch active thread if needed
    }
  }, []);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  const handleSendMessage = useCallback(
    (text: string, threadId: string, quoteAttachment?: ChatMessage['quoteAttachment']) => {
      const activeArt = artists.find(a => a.id === threadId) || artists[0];
      const newMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        threadId,
        senderId: userRole === 'client' ? 'client-me' : threadId,
        senderName: userRole === 'client' ? 'Genevieve Vance' : activeArt.name,
        senderRole: userRole,
        recipientId: activeArt.id,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        quoteAttachment,
      };

      setChatMessages(prev => [...prev, newMsg]);

      // [SIM] Broadcast encrypted chat chunk to CryptoCloud peer buffer
      cryptoCloudSwarm.broadcastBlock('CHAT_MESSAGE_BUFFERED', {
        threadId,
        msgId: newMsg.id,
      });
    },
    [artists, userRole]
  );

  return {
    chatMessages,
    setChatMessages,
    isChatOpen,
    setIsChatOpen,
    unreadChatCount,
    setUnreadChatCount,
    openChat,
    closeChat,
    handleSendMessage,
  };
}
