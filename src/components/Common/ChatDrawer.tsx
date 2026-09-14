import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  X,
  ArrowLeft,
  Headphones,
  User,
  Shield,
  Bike,
  Sparkles,
  CheckCheck,
  Search,
  PlusCircle,
  AlertTriangle,
  ShieldAlert,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBackHandler } from '../../contexts/NativeBackContext';
import {
  ChatChannel,
  ChatMessage,
  ChatChannelType,
  subscribeToMessages,
  subscribeToUserChannels,
  sendChatMessage,
  getOrCreateChannel,
  markChannelAsRead,
  deduplicateMessages,
} from '../../services/chatService';
import {
  IncidentTicket,
  subscribeToTickets,
  INCIDENT_CATEGORIES,
} from '../../services/ticketService';
import { ReportIncidentModal } from './ReportIncidentModal';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialChannelId?: string | null;
  initialTargetUser?: { id: string; name: string; role: 'customer' | 'driver' | 'admin' };
  initialBookingId?: string;
  initialChannelType?: ChatChannelType;
  onOpenSupportTickets?: () => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  initialChannelId,
  initialTargetUser,
  initialBookingId,
  initialChannelType,
  onOpenSupportTickets,
}) => {
  const { currentUser, userProfile, driverProfile, role } = useAuth();

  const currentUserId = role === 'admin' ? 'admin' : (currentUser?.uid || '');
  const currentUserName =
    role === 'admin'
      ? 'E-Shuttle Admin'
      : role === 'driver'
      ? driverProfile?.fullName || 'E-Shuttle Driver'
      : userProfile?.fullName || 'Valued Passenger';
  const currentUserRole = role || 'customer';

  // Navigation State
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(initialChannelId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Handle auto-opening direct channels when target user is provided
  useEffect(() => {
    if (!isOpen) return;

    if (initialChannelId) {
      setActiveChannelId(initialChannelId);
    } else if (initialTargetUser) {
      const type = initialChannelType || (initialTargetUser.role === 'admin' ? 'user_admin' : 'user_driver');
      getOrCreateChannel(
        type,
        { id: currentUserId, name: currentUserName, role: currentUserRole },
        initialTargetUser,
        initialBookingId
      ).then((cid) => {
        setActiveChannelId(cid);
      });
    }
  }, [isOpen, initialChannelId, initialTargetUser, initialChannelType, initialBookingId, currentUserRole, currentUserId, currentUserName]);

  // 2. Subscribe to User Channels
  useEffect(() => {
    if (!currentUserId || !isOpen) return;

    const unsubChannels = subscribeToUserChannels(currentUserId, currentUserRole, (chans) => {
      // Filter out auto-generated support channels if user is viewing ride chats
      setChannels(chans);
    });

    return () => {
      unsubChannels();
    };
  }, [currentUserId, currentUserRole, isOpen]);

  // 3. Subscribe to Active Channel Messages & Mark Read
  useEffect(() => {
    if (!activeChannelId || !isOpen) {
      setMessages([]);
      return;
    }

    markChannelAsRead(activeChannelId, currentUserId, currentUserRole);

    const unsubMessages = subscribeToMessages(activeChannelId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    return () => unsubMessages();
  }, [activeChannelId, currentUserId, isOpen]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  if (!isOpen) return null;

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  // Handle Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!inputText.trim() || !activeChannelId || sending) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await sendChatMessage(
        activeChannelId,
        currentUserId,
        currentUserName,
        currentUserRole,
        textToSend
      );
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  // Quick suggestion chips based on user role
  const quickChips =
    currentUserRole === 'driver'
      ? ['On my way to pickup station', 'Arrived at pickup location', 'Traffic delay ahead', 'Please come to the stop']
      : currentUserRole === 'customer'
      ? ["Where is my shuttle?", "I'm waiting at the station", 'Can you wait 2 mins?', 'Thank you!']
      : ['Please stand by', 'Checking shuttle location now', 'Updated ride status'];

  // Filter channels
  const filteredChannels = channels.filter((c) => {
    const titleMatch = (c.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    const msgMatch = (c.lastMessage || '').toLowerCase().includes(searchQuery.toLowerCase());
    return titleMatch || msgMatch;
  });

  // Native mobile back button handler (allows hardware/gesture back button on mobile)
  useBackHandler(
    isOpen && Boolean(activeChannelId),
    () => {
      setActiveChannelId(null);
      return true;
    },
    20,
    'chat-channel'
  );

  useBackHandler(
    isOpen && !activeChannelId,
    () => {
      onClose();
      return true;
    },
    15,
    'chat-drawer'
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in select-none">
        <div className="bg-white border-2 border-[#0D47A1] rounded-t-3xl sm:rounded-3xl w-full max-w-lg h-[85vh] sm:h-[650px] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom">
          {/* Drawer Header */}
          <div className="bg-[#0D47A1] text-white px-4 py-3.5 flex items-center justify-between shrink-0 shadow-md">
            <div className="flex items-center gap-2.5 min-w-0">
              {activeChannelId ? (
                <>
                  {/* Back button hidden on mobile since mobile devices have native back button/gestures */}
                  <button
                    type="button"
                    onClick={() => setActiveChannelId(null)}
                    className="hidden sm:inline-flex p-1.5 hover:bg-white/10 rounded-xl transition-colors shrink-0"
                    title="Back to conversations"
                  >
                    <ArrowLeft className="w-5 h-5 text-white" />
                  </button>
                  <div className="sm:hidden w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                </>
              ) : (
                <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
              )}

              <div className="min-w-0">
                <h2 className="text-sm font-black truncate">
                  {activeChannel
                    ? activeChannel.title || 'Live Ride Chat'
                    : 'Ride & Driver Messages'}
                </h2>
                <p className="text-[11px] text-blue-100 font-medium truncate">
                  {activeChannel
                    ? activeChannel.subtitle || '2-Way Live Chat'
                    : `${filteredChannels.length} active conversations`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded-xl transition-colors text-white shrink-0"
              title="Close chat drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Dedicated Admin Support Ticket Notice Banner */}
          {!activeChannelId && (
            <div className="bg-[#E3F2FD] border-b border-[#0D47A1]/20 p-3 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#0D47A1] text-white flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-amber-300" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-[#0D47A1] leading-tight truncate">
                    Looking for Admin Support?
                  </h4>
                  <p className="text-[10px] text-slate-600 font-semibold truncate">
                    Submit or track official issues & incident tickets
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onOpenSupportTickets) {
                    onClose();
                    onOpenSupportTickets();
                  }
                }}
                className="px-3 py-1.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white text-[11px] font-black rounded-xl shadow transition-all active:scale-95 shrink-0"
              >
                Support Tickets →
              </button>
            </div>
          )}

          {/* =========================================================================
              VIEW 1: ACTIVE CHAT CONVERSATION
             ========================================================================= */}
          {activeChannelId ? (
            <div className="flex-1 flex flex-col bg-[#F8FAFC] overflow-hidden">
              {/* Messages Feed Scroll View */}
              <div className="flex-1 p-3.5 overflow-y-auto space-y-3">
                {/* Channel Security Banner */}
                <div className="bg-[#E3F2FD] border border-[#0D47A1]/20 rounded-2xl p-2.5 text-center text-[10px] font-bold text-[#0D47A1] flex items-center justify-center gap-1.5 shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-[#0D47A1]" />
                  <span>Direct 2-Way Channel between Passenger & Driver</span>
                </div>

                {deduplicateMessages(messages).length === 0 ? (
                  <div className="text-center py-12 text-slate-400 space-y-2">
                    <MessageSquare className="w-8 h-8 mx-auto text-[#0D47A1]/30" />
                    <p className="text-xs font-bold text-slate-500">No messages yet</p>
                    <p className="text-[10px]">Type a message below to coordinate with your driver/passenger.</p>
                  </div>
                ) : (
                  deduplicateMessages(messages).map((msg) => {
                    const isMe =
                      msg.senderId === currentUserId ||
                      (currentUserRole === 'admin' && (msg.senderRole === 'admin' || msg.senderId === 'admin'));
                    const isDriver = msg.senderRole === 'driver';
                    const isAdmin = msg.senderRole === 'admin';

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                      >
                        {/* Sender Info Label */}
                        <div className="flex items-center gap-1 text-[9px] font-extrabold text-slate-500 px-1">
                          {isAdmin ? (
                            <span className="bg-[#0D47A1] text-white px-1.5 py-0.2 rounded font-black flex items-center gap-0.5">
                              <Shield className="w-2.5 h-2.5" /> ADMIN
                            </span>
                          ) : isDriver ? (
                            <span className="bg-emerald-700 text-white px-1.5 py-0.2 rounded font-black flex items-center gap-0.5">
                              <Bike className="w-2.5 h-2.5" /> DRIVER
                            </span>
                          ) : (
                            <span className="text-slate-600 font-black">{msg.senderName}</span>
                          )}
                          <span>•</span>
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {/* Message Bubble */}
                        <div
                          className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs font-semibold shadow-sm leading-relaxed whitespace-pre-line ${
                            isMe
                              ? 'bg-[#0D47A1] text-white rounded-br-none'
                              : isAdmin
                              ? 'bg-[#E3F2FD] text-[#0D47A1] border-2 border-[#0D47A1] rounded-bl-none font-bold'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Suggestion Chips */}
              <div className="bg-white border-t border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {quickChips.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setInputText(chip)}
                    className="px-2.5 py-1 bg-[#E3F2FD] hover:bg-[#0D47A1] hover:text-white text-[#0D47A1] border border-[#0D47A1]/30 rounded-full text-[10px] font-bold shrink-0 transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Message Input Bar */}
              <form
                onSubmit={handleSendMessage}
                className="bg-white p-3 border-t-2 border-[#0D47A1] flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Type your message..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-2xl px-3.5 py-2 text-xs font-bold text-[#0D47A1] focus:outline-none focus:bg-white"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || sending}
                  className="bg-[#0D47A1] hover:bg-[#1565C0] text-white p-2.5 rounded-2xl shadow-md disabled:opacity-40 transition-transform active:scale-95 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          ) : (
            /* =========================================================================
                VIEW 2: CONVERSATIONS INBOX LIST
               ========================================================================= */
            <div className="flex-1 flex flex-col bg-[#F8FAFC] overflow-hidden">
              {/* Search Bar */}
              <div className="bg-white p-3 border-b border-slate-200">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search ride conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#0D47A1] font-bold focus:outline-none focus:border-[#0D47A1]"
                  />
                </div>
              </div>

              {/* Inbox Item Content Feed */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2">
                {filteredChannels.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 space-y-2">
                    <MessageSquare className="w-8 h-8 mx-auto text-[#0D47A1]/30" />
                    <p className="text-xs font-bold text-slate-500">No ride chats yet</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Direct chats with your driver or passenger will appear here when an active ride is underway.
                    </p>
                  </div>
                ) : (
                  filteredChannels.map((c) => {
                    const unread =
                      (c.unreadCounts?.[currentUserId] || 0) +
                      (currentUserRole === 'admin' && currentUser?.uid && currentUser.uid !== 'admin'
                        ? c.unreadCounts?.[currentUser.uid] || 0
                        : 0);

                    return (
                      <div
                        key={c.id}
                        onClick={() => setActiveChannelId(c.id)}
                        className={`p-3 bg-white border-2 rounded-2xl cursor-pointer transition-all hover:border-[#0D47A1] flex items-center justify-between gap-3 shadow-sm ${
                          unread > 0 ? 'border-[#0D47A1] bg-[#E3F2FD]/40' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center font-black text-white shrink-0 shadow-sm">
                            <Bike className="w-5 h-5" />
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-xs font-black text-[#0D47A1] truncate">
                              {c.title || 'Ride Chat'}
                            </h4>
                            <p className="text-[11px] font-bold text-slate-600 truncate mt-0.5">
                              {c.lastMessage || 'Channel active'}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end shrink-0 gap-1">
                          <span className="text-[9px] font-extrabold text-slate-400">
                            {c.updatedAt
                              ? new Date(c.updatedAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>
                          {unread > 0 && (
                            <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                              {unread}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
