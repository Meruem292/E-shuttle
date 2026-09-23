import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ShieldAlert, MessageSquare, LogOut, Clock, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createIncidentTicket } from '../../services/ticketService';
import { getOrCreateChannel } from '../../services/chatService';
import { ChatDrawer } from './ChatDrawer';

interface SuspendedAccountPortalProps {
  onOpenChatWithAdmin?: (channelId?: string) => void;
}

export const SuspendedAccountPortal: React.FC<SuspendedAccountPortalProps> = ({ onOpenChatWithAdmin }) => {
  const { userProfile, driverProfile, role, logout, currentUser } = useAuth();
  const profile = role === 'driver' ? driverProfile : userProfile;
  const toast = useToast();

  const [appealReason, setAppealReason] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [openingChat, setOpeningChat] = useState(false);

  const suspendedUntil = profile?.suspendedUntil;
  const isPermanent = !suspendedUntil || suspendedUntil === 0;
  const expiryDateFormatted = isPermanent ? 'Permanent (Until lifted by Administrator)' : new Date(suspendedUntil).toLocaleString();

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealReason.trim()) {
      toast.error('Please enter your appeal explanation or reason for investigation.');
      return;
    }

    setSubmittingAppeal(true);
    try {
      const reporterId = profile?.uid || currentUser?.uid || 'user';
      const reporterName = profile?.fullName || 'User';
      const reporterRole = role === 'driver' ? 'driver' : 'customer';

      await createIncidentTicket({
        reporterId,
        reporterName,
        reporterRole,
        category: 'other',
        priority: 'high',
        subject: 'Account Suspension Appeal & Investigation Request',
        description: `[SUSPENSION APPEAL]\nReason / Explanation from user:\n${appealReason.trim()}`,
      });

      setAppealSubmitted(true);
      toast.success('Your appeal has been successfully submitted to Platform Administration.');
      setAppealReason('');
    } catch (err: any) {
      console.error('Error submitting appeal:', err);
      toast.error(err?.message || 'Failed to submit appeal');
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const handleOpenChat = async () => {
    setOpeningChat(true);
    try {
      const reporterId = profile?.uid || currentUser?.uid || 'user';
      const reporterName = profile?.fullName || 'User';
      const reporterRole = role === 'driver' ? 'driver' : 'customer';
      const ctype = reporterRole === 'driver' ? 'driver_admin' : 'user_admin';

      const channelId = await getOrCreateChannel(
        ctype,
        { id: reporterId, name: reporterName, role: reporterRole },
        { id: 'admin', name: 'E-Shuttle Admin Support', role: 'admin' },
        undefined,
        `Account Suspension Investigation - ${reporterName}`,
        'Suspension Appeal & Review'
      );

      setActiveChannelId(channelId);
      setIsChatOpen(true);

      if (onOpenChatWithAdmin) {
        onOpenChatWithAdmin(channelId);
      }
    } catch (e) {
      console.error('Error opening support chat:', e);
      toast.error('Failed to open admin support chat.');
    } finally {
      setOpeningChat(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 z-50 absolute inset-0">
      <div className="max-w-xl w-full bg-slate-800 border-2 border-rose-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in duration-300">
        
        {/* Header Badge */}
        <div className="flex items-center gap-3.5 border-b border-slate-700 pb-4">
          <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center shrink-0 border border-rose-500/30">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-rose-400">Account Security Notice</div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">Account Currently Suspended</h1>
            <p className="text-xs text-slate-400 font-medium">{profile?.fullName} • {profile?.email}</p>
          </div>
        </div>

        {/* Suspension Details */}
        <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl p-4 space-y-2.5 text-xs text-rose-200">
          <div className="flex items-center gap-2 font-bold text-rose-300">
            <Clock className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Suspension Expiry:</span>
            <span className="font-mono font-black text-white">{expiryDateFormatted}</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Your account operating privileges (booking rides or receiving dispatches) are temporarily restricted. You may submit a formal appeal or communicate directly with platform administrators via secure investigation chat below.
          </p>
        </div>

          {/* Investigation Chat & Appeal Actions */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleOpenChat}
                disabled={openingChat}
                className="w-full py-3 px-4 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-60"
              >
                <MessageSquare className="w-4 h-4 text-[#90CAF9]" />
                <span>{openingChat ? 'Connecting Chat...' : 'Chat with Admin (Investigation)'}</span>
              </button>
              <button
                type="button"
                onClick={logout}
                className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <LogOut className="w-4 h-4 text-slate-400" />
                <span>Log Out</span>
              </button>
            </div>

            {/* Appeal Submission Form */}
            <div className="bg-slate-900/60 border border-slate-700 rounded-2xl p-4 space-y-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Submit Formal Appeal for Review</span>
              </h2>

              {appealSubmitted ? (
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3.5 flex items-center gap-3 text-emerald-300 text-xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold">Appeal Submitted Successfully</div>
                    <div className="text-[11px] text-emerald-400/80">Our compliance team is reviewing your case. You can discuss details directly in the Admin Investigation Chat.</div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitAppeal} className="space-y-3">
                  <textarea
                    rows={3}
                    value={appealReason}
                    onChange={(e) => setAppealReason(e.target.value)}
                    placeholder="Provide context, explanation, or details regarding why this suspension should be reviewed or lifted..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#0D47A1] transition-colors resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submittingAppeal}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl uppercase tracking-wider flex items-center gap-1.5 shadow-md disabled:opacity-50 active:scale-95 transition-all"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submittingAppeal ? 'Submitting Appeal...' : 'Submit Appeal'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

        </div>

        {/* Real-time Investigation Chat with Admin */}
        <ChatDrawer
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          initialChannelId={activeChannelId || undefined}
          initialTargetUser={{
            id: 'admin',
            name: 'E-Shuttle Admin Support',
            role: 'admin',
          }}
          initialChannelType={role === 'driver' ? 'driver_admin' : 'user_admin'}
        />
      </div>
    );
  };
