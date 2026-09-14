import React, { useState, useEffect, useRef } from 'react';
import {
  LifeBuoy,
  X,
  Plus,
  ArrowLeft,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Search,
  MessageSquare,
  HelpCircle,
  FileText,
  MapPin,
  Bike,
  User,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useBackHandler } from '../../contexts/NativeBackContext';
import {
  IncidentTicket,
  IncidentCategory,
  TicketPriority,
  TicketStatus,
  INCIDENT_CATEGORIES,
  createIncidentTicket,
  subscribeToTickets,
  updateTicketStatus,
} from '../../services/ticketService';
import {
  ChatMessage,
  subscribeToMessages,
  sendChatMessage,
  markChannelAsRead,
  deduplicateMessages,
} from '../../services/chatService';

interface SupportTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTicketId?: string | null;
  defaultRideId?: string;
  defaultVehicleInfo?: string;
}

export const SupportTicketsModal: React.FC<SupportTicketsModalProps> = ({
  isOpen,
  onClose,
  initialTicketId,
  defaultRideId,
  defaultVehicleInfo,
}) => {
  const { currentUser, userProfile, driverProfile, role } = useAuth();
  const toast = useToast();

  const currentUserId = role === 'admin' ? 'admin' : currentUser?.uid || '';
  const currentUserName =
    role === 'admin'
      ? 'E-Shuttle Admin Support'
      : role === 'driver'
      ? driverProfile?.fullName || 'Driver'
      : userProfile?.fullName || 'Passenger';
  const currentUserRole = role || 'customer';

  const [tickets, setTickets] = useState<IncidentTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(initialTicketId || null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Ticket Message Thread State
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [threadInput, setThreadInput] = useState<string>('');
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // New Ticket Form State
  const [category, setCategory] = useState<IncidentCategory>('other');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [subject, setSubject] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [locationAddress, setLocationAddress] = useState<string>('');
  const [vehicleInfo, setVehicleInfo] = useState<string>(defaultVehicleInfo || '');
  const [submittingTicket, setSubmittingTicket] = useState<boolean>(false);

  // Admin notes editing state
  const [adminNotesInput, setAdminNotesInput] = useState<string>('');
  const [savingAdminNotes, setSavingAdminNotes] = useState<boolean>(false);

  // 1. Subscribe to Tickets for the active user/role
  useEffect(() => {
    if (!isOpen || !currentUserId) return;

    const unsub = subscribeToTickets(currentUserId, currentUserRole, (tList) => {
      setTickets(tList);
      // If initialTicketId was given, select it
      if (initialTicketId && !selectedTicketId) {
        setSelectedTicketId(initialTicketId);
      }
    });

    return () => unsub();
  }, [isOpen, currentUserId, currentUserRole, initialTicketId, selectedTicketId]);

  // Selected Ticket object
  const activeTicket = tickets.find((t) => t.id === selectedTicketId) || null;

  // Initialize admin notes when selecting ticket
  useEffect(() => {
    if (activeTicket) {
      setAdminNotesInput(activeTicket.adminNotes || '');
    }
  }, [activeTicket?.id, activeTicket?.adminNotes]);

  // 2. Subscribe to Ticket Chat Channel messages when a ticket is opened
  useEffect(() => {
    if (!activeTicket?.channelId || !isOpen) {
      setThreadMessages([]);
      return;
    }

    markChannelAsRead(activeTicket.channelId, currentUserId, currentUserRole);

    const unsub = subscribeToMessages(activeTicket.channelId, (msgs) => {
      setThreadMessages(deduplicateMessages(msgs));
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    return () => unsub();
  }, [activeTicket?.channelId, currentUserId, currentUserRole, isOpen]);

  if (!isOpen) return null;

  // Filtered Tickets List
  const filteredTickets = tickets.filter((t) => {
    const matchesStatus =
      statusFilter === 'ALL'
        ? true
        : statusFilter === 'open'
        ? t.status === 'open'
        : statusFilter === 'in_progress'
        ? t.status === 'in_progress'
        : statusFilter === 'resolved'
        ? t.status === 'resolved' || t.status === 'closed'
        : true;

    const matchesSearch =
      searchQuery.trim() === ''
        ? true
        : t.ticketNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.reporterName?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  // Handle Form Submit for New Ticket
  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim() || submittingTicket) {
      toast.warning('Please provide both a subject and details for your ticket.');
      return;
    }

    setSubmittingTicket(true);
    try {
      const created = await createIncidentTicket({
        reporterId: currentUserId,
        reporterName: currentUserName,
        reporterRole: currentUserRole,
        category,
        priority,
        subject: subject.trim(),
        description: description.trim(),
        locationAddress: locationAddress.trim() || undefined,
        vehicleInfo: vehicleInfo.trim() || undefined,
        rideId: defaultRideId || undefined,
      });

      toast.success(`Support Ticket #${created.ticketNumber} created successfully!`);
      setSubject('');
      setDescription('');
      setLocationAddress('');
      setIsCreatingNew(false);
      setSelectedTicketId(created.id);
    } catch (err: any) {
      console.error('Failed to create ticket:', err);
      toast.error('Failed to submit ticket. Please try again.');
    } finally {
      setSubmittingTicket(false);
    }
  };

  // Handle Sending Message in Ticket Thread
  const handleSendThreadMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!threadInput.trim() || !activeTicket?.channelId || sendingMessage) return;

    const textToSend = threadInput.trim();
    setThreadInput('');
    setSendingMessage(true);

    try {
      await sendChatMessage(
        activeTicket.channelId,
        currentUserId,
        currentUserName,
        currentUserRole,
        textToSend
      );
    } catch (err) {
      console.error('Failed to send ticket reply:', err);
      toast.error('Failed to post reply.');
    } finally {
      setSendingMessage(false);
    }
  };

  // Handle Status Update (For Admin or User resolving)
  const handleUpdateStatus = async (newStatus: TicketStatus) => {
    if (!activeTicket) return;
    try {
      await updateTicketStatus(activeTicket.id, newStatus, adminNotesInput.trim() || undefined);
      toast.success(`Ticket #${activeTicket.ticketNumber} status updated to ${newStatus.toUpperCase().replace('_', ' ')}.`);
    } catch (err) {
      toast.error('Failed to update ticket status.');
    }
  };

  // Handle Save Admin Notes
  const handleSaveNotes = async () => {
    if (!activeTicket || savingAdminNotes) return;
    setSavingAdminNotes(true);
    try {
      await updateTicketStatus(activeTicket.id, activeTicket.status, adminNotesInput.trim());
      toast.success('Admin notes saved successfully.');
    } catch (err) {
      toast.error('Failed to save admin notes.');
    } finally {
      setSavingAdminNotes(false);
    }
  };

  const getPriorityBadge = (p: TicketPriority) => {
    switch (p) {
      case 'emergency':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-600 text-white animate-pulse">
            🚨 Emergency
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-white">
            High Priority
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#0D47A1] text-white">
            Medium
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-200 text-slate-700">
            Low
          </span>
        );
    }
  };

  const getStatusBadge = (s: TicketStatus) => {
    switch (s) {
      case 'open':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 text-[#0D47A1] border border-[#0D47A1]/30">
            Open
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-300">
            In Progress
          </span>
        );
      case 'resolved':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
            Resolved
          </span>
        );
      case 'closed':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-600 border border-slate-300">
            Closed
          </span>
        );
    }
  };

  // Native mobile back button handling (allows hardware/gesture back on mobile)
  useBackHandler(
    isOpen && Boolean(selectedTicketId || isCreatingNew),
    () => {
      setSelectedTicketId(null);
      setIsCreatingNew(false);
      return true;
    },
    20,
    'support-ticket-detail'
  );

  useBackHandler(
    isOpen && !selectedTicketId && !isCreatingNew,
    () => {
      onClose();
      return true;
    },
    15,
    'support-tickets-modal'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in select-none">
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden h-[92vh] max-h-[750px]">
        {/* Modal Header */}
        <div className="bg-[#0D47A1] text-white px-4 py-3.5 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectedTicketId || isCreatingNew ? (
              <>
                {/* Back button hidden on mobile since mobile devices have native back button/gestures */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTicketId(null);
                    setIsCreatingNew(false);
                  }}
                  className="hidden sm:inline-flex p-1.5 hover:bg-white/10 rounded-xl transition-colors text-white mr-1"
                  title="Back to Tickets"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="sm:hidden w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-white shrink-0 border border-white/20">
                  <LifeBuoy className="w-5 h-5 text-amber-300" />
                </div>
              </>
            ) : (
              <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-white shrink-0 border border-white/20">
                <LifeBuoy className="w-5 h-5 text-amber-300" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-black tracking-tight leading-tight truncate">
                {isCreatingNew
                  ? 'Submit Support Ticket'
                  : activeTicket
                  ? `Ticket #${activeTicket.ticketNumber}`
                  : 'Official Admin Support Desk'}
              </h3>
              <p className="text-[11px] text-blue-100 font-medium truncate">
                {isCreatingNew
                  ? 'Create an official report or help request for dispatch team'
                  : activeTicket
                  ? activeTicket.subject
                  : 'Track and manage your inquiries, incident reports & assistance tickets'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isCreatingNew && !selectedTicketId && (
              <button
                type="button"
                onClick={() => setIsCreatingNew(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl shadow transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>New Ticket</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              title="Close Support Desk"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC]">
          {/* VIEW 1: CREATE NEW TICKET FORM */}
          {isCreatingNew ? (
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <form onSubmit={handleCreateTicketSubmit} className="space-y-4 max-w-xl mx-auto">
                <div className="bg-[#E3F2FD] border border-[#0D47A1]/20 rounded-2xl p-3.5 text-xs text-[#0D47A1] font-medium flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-[#0D47A1] shrink-0 mt-0.5" />
                  <span>
                    Your support ticket will be assigned a unique tracking number and routed directly to the E-Shuttle Admin Dispatch team.
                  </span>
                </div>

                {/* Category Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-[#0D47A1] uppercase tracking-wider block">
                    Issue Category *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(INCIDENT_CATEGORIES) as IncidentCategory[]).map((catKey) => {
                      const item = INCIDENT_CATEGORIES[catKey];
                      const isSelected = category === catKey;
                      return (
                        <button
                          key={catKey}
                          type="button"
                          onClick={() => setCategory(catKey)}
                          className={`p-2.5 rounded-2xl border text-left flex items-center gap-2 transition-all ${
                            isSelected
                              ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md font-bold ring-2 ring-[#0D47A1]/30'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-[#0D47A1]/50 hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-lg shrink-0">{item.icon}</span>
                          <span className="text-xs leading-tight font-bold truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Priority Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-[#0D47A1] uppercase tracking-wider block">
                    Priority Level *
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['low', 'medium', 'high', 'emergency'] as TicketPriority[]).map((p) => {
                      const isSelected = priority === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className={`py-2 px-1 text-center rounded-xl border text-xs font-black uppercase transition-all ${
                            isSelected
                              ? p === 'emergency'
                                ? 'bg-rose-600 text-white border-rose-700 shadow-md ring-2 ring-rose-300'
                                : p === 'high'
                                ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-200'
                                : 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md ring-2 ring-blue-200'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-[#0D47A1] uppercase tracking-wider block">
                    Subject / Short Summary *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Left umbrella at Central Terminal, or Fare discrepancy on Ride #104"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-white border-2 border-slate-200 focus:border-[#0D47A1] rounded-2xl px-3.5 py-2.5 text-xs text-slate-800 font-semibold focus:outline-none transition-colors"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-[#0D47A1] uppercase tracking-wider block">
                    Detailed Description *
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Please explain the issue or what assistance you need in detail..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-white border-2 border-slate-200 focus:border-[#0D47A1] rounded-2xl px-3.5 py-2.5 text-xs text-slate-800 font-medium focus:outline-none transition-colors resize-none"
                  />
                </div>

                {/* Optional Location / Vehicle Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 block flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#0D47A1]" />
                      <span>Station / Location (Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Stop 3 - Market Plaza"
                      value={locationAddress}
                      onChange={(e) => setLocationAddress(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 block flex items-center gap-1">
                      <Bike className="w-3.5 h-3.5 text-[#0D47A1]" />
                      <span>Vehicle / Shuttle Info (Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Shuttle Plate #ESH-04"
                      value={vehicleInfo}
                      onChange={(e) => setVehicleInfo(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(false)}
                    className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingTicket || !subject.trim() || !description.trim()}
                    className="flex-1 py-2.5 px-4 bg-[#0D47A1] hover:bg-[#1565C0] disabled:bg-slate-300 text-white font-black text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    {submittingTicket ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit Support Ticket</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : activeTicket ? (
            /* VIEW 2: TICKET DETAILS & RESPONSE THREAD */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Ticket Overview Card */}
              <div className="bg-white border-b border-slate-200 p-4 shrink-0 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-[#0D47A1] bg-[#E3F2FD] px-2.5 py-1 rounded-lg border border-[#0D47A1]/20">
                      #{activeTicket.ticketNumber}
                    </span>
                    {getPriorityBadge(activeTicket.priority)}
                    {getStatusBadge(activeTicket.status)}
                  </div>

                  {/* Admin or User Status Actions */}
                  {currentUserRole === 'admin' ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500">Status:</span>
                      <select
                        value={activeTicket.status}
                        onChange={(e) => handleUpdateStatus(e.target.value as TicketStatus)}
                        className="bg-slate-50 border-2 border-[#0D47A1] text-[#0D47A1] font-black text-xs rounded-xl px-2.5 py-1 focus:outline-none"
                      >
                        <option value="open">OPEN</option>
                        <option value="in_progress">IN PROGRESS</option>
                        <option value="resolved">RESOLVED</option>
                        <option value="closed">CLOSED</option>
                      </select>
                    </div>
                  ) : (
                    activeTicket.status !== 'resolved' &&
                    activeTicket.status !== 'closed' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus('resolved')}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-black flex items-center gap-1 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Mark as Resolved</span>
                      </button>
                    )
                  )}
                </div>

                {/* Ticket Subject & Category */}
                <div>
                  <h4 className="text-sm font-black text-slate-900 leading-snug">
                    {activeTicket.subject}
                  </h4>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-1 font-medium">
                    <span>
                      Category:{' '}
                      <strong className="text-slate-800">
                        {INCIDENT_CATEGORIES[activeTicket.category]?.label || activeTicket.category}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Reported by:{' '}
                      <strong className="text-slate-800">
                        {activeTicket.reporterName} ({activeTicket.reporterRole})
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Date:{' '}
                      <strong className="text-slate-800">
                        {new Date(activeTicket.createdAt).toLocaleString()}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Original Description */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {activeTicket.description}
                </div>

                {/* Location / Vehicle Info if available */}
                {(activeTicket.locationAddress || activeTicket.vehicleInfo) && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {activeTicket.locationAddress && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg font-medium">
                        <MapPin className="w-3.5 h-3.5 text-[#0D47A1]" />
                        {activeTicket.locationAddress}
                      </span>
                    )}
                    {activeTicket.vehicleInfo && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg font-medium">
                        <Bike className="w-3.5 h-3.5 text-[#0D47A1]" />
                        {activeTicket.vehicleInfo}
                      </span>
                    )}
                  </div>
                )}

                {/* Admin Notes Section */}
                {currentUserRole === 'admin' ? (
                  <div className="pt-1 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-black text-[#0D47A1] uppercase tracking-wider">
                        Dispatch / Admin Resolution Notes
                      </label>
                      <button
                        type="button"
                        onClick={handleSaveNotes}
                        disabled={savingAdminNotes}
                        className="text-[11px] font-black text-[#0D47A1] hover:underline"
                      >
                        {savingAdminNotes ? 'Saving...' : 'Save Notes'}
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Add official resolution notes or dispatch instructions..."
                      value={adminNotesInput}
                      onChange={(e) => setAdminNotesInput(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-none"
                    />
                  </div>
                ) : activeTicket.adminNotes ? (
                  <div className="bg-blue-50 border border-[#0D47A1]/20 rounded-2xl p-2.5 text-xs text-[#0D47A1]">
                    <span className="font-black block text-[10px] uppercase tracking-wider mb-0.5 text-[#0D47A1]/70">
                      Official Admin Note:
                    </span>
                    <p className="font-semibold">{activeTicket.adminNotes}</p>
                  </div>
                ) : null}
              </div>

              {/* Ticket 2-Way Response Thread */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F1F5F9]">
                <div className="text-center my-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-200/80 px-2.5 py-1 rounded-full">
                    Ticket Support Thread
                  </span>
                </div>

                {threadMessages.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 space-y-1">
                    <MessageSquare className="w-6 h-6 mx-auto text-[#0D47A1]/30" />
                    <p className="text-xs font-semibold text-slate-500">No additional replies yet</p>
                    <p className="text-[11px] text-slate-400">
                      Use the box below to ask questions or provide additional updates regarding this ticket.
                    </p>
                  </div>
                ) : (
                  threadMessages.map((msg) => {
                    const isMe =
                      msg.senderId === currentUserId ||
                      (currentUserRole === 'admin' && (msg.senderRole === 'admin' || msg.senderId === 'admin'));

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-0.5 px-1">
                          <span className="font-black text-[#0D47A1]">
                            {msg.senderRole === 'admin' ? '🛡️ Admin Support' : msg.senderName}
                          </span>
                          <span>•</span>
                          <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm font-medium leading-relaxed whitespace-pre-wrap ${
                            isMe
                              ? 'bg-[#0D47A1] text-white rounded-tr-none'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
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

              {/* Message Reply Box */}
              <div className="bg-white border-t border-slate-200 p-3 shrink-0">
                <form onSubmit={handleSendThreadMessage} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Type a response or additional detail..."
                    value={threadInput}
                    onChange={(e) => setThreadInput(e.target.value)}
                    disabled={sendingMessage}
                    className="flex-1 bg-slate-50 border-2 border-slate-200 focus:border-[#0D47A1] rounded-2xl px-3.5 py-2 text-xs text-slate-800 font-medium focus:outline-none transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!threadInput.trim() || sendingMessage}
                    className="p-2.5 bg-[#0D47A1] hover:bg-[#1565C0] disabled:bg-slate-300 text-white rounded-2xl shadow transition-all active:scale-95 shrink-0"
                    title="Send Reply"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          ) : (
            /* VIEW 3: TICKETS LIST DASHBOARD */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Filter Tabs & Search */}
              <div className="bg-white border-b border-slate-200 p-3 shrink-0 space-y-2.5">
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by ticket #, subject, or category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-9 pr-3.5 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-[#0D47A1]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                  {[
                    { id: 'ALL', label: `All (${tickets.length})` },
                    { id: 'open', label: `Open (${tickets.filter((t) => t.status === 'open').length})` },
                    { id: 'in_progress', label: `In Progress (${tickets.filter((t) => t.status === 'in_progress').length})` },
                    { id: 'resolved', label: `Resolved (${tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`px-3 py-1 rounded-full text-xs font-black whitespace-nowrap transition-all ${
                        statusFilter === tab.id
                          ? 'bg-[#0D47A1] text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tickets List */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5">
                {filteredTickets.length === 0 ? (
                  <div className="text-center py-12 px-4 space-y-3">
                    <div className="w-12 h-12 rounded-3xl bg-blue-50 text-[#0D47A1] flex items-center justify-center mx-auto border border-blue-200">
                      <LifeBuoy className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">No Support Tickets Found</h4>
                      <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto mt-1">
                        {searchQuery
                          ? 'No tickets match your search criteria. Try a different query.'
                          : 'You have not submitted any support or incident tickets yet.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCreatingNew(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-xs rounded-2xl shadow-md transition-all active:scale-95 mt-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Submit New Support Ticket</span>
                    </button>
                  </div>
                ) : (
                  filteredTickets.map((ticket) => {
                    const catInfo = INCIDENT_CATEGORIES[ticket.category] || INCIDENT_CATEGORIES.other;

                    return (
                      <div
                        key={ticket.id}
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className="bg-white border-2 border-slate-200 hover:border-[#0D47A1] rounded-2xl p-3.5 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 group"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] font-black text-[#0D47A1] bg-[#E3F2FD] px-2 py-0.5 rounded-lg border border-[#0D47A1]/20">
                              #{ticket.ticketNumber}
                            </span>
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              <span>{catInfo.icon}</span>
                              <span className="truncate">{catInfo.label}</span>
                            </span>
                            {getPriorityBadge(ticket.priority)}
                            {getStatusBadge(ticket.status)}
                          </div>

                          <h4 className="text-xs font-black text-slate-900 leading-snug truncate group-hover:text-[#0D47A1] transition-colors">
                            {ticket.subject}
                          </h4>

                          <p className="text-[11px] text-slate-500 font-medium line-clamp-1 leading-snug">
                            {ticket.description}
                          </p>

                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{new Date(ticket.createdAt).toLocaleDateString()} at {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {currentUserRole === 'admin' && (
                              <>
                                <span>•</span>
                                <span className="font-bold text-slate-600">{ticket.reporterName}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 p-2 text-slate-400 group-hover:text-[#0D47A1] transition-colors">
                          <ChevronRight className="w-5 h-5" />
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
    </div>
  );
};
