import React, { useState } from 'react';
import {
  AlertTriangle,
  X,
  Send,
  MapPin,
  Bike,
  ShieldAlert,
  CheckCircle,
  FileText,
  MessageSquare,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  createIncidentTicket,
  IncidentCategory,
  TicketPriority,
  INCIDENT_CATEGORIES,
  openSupportTicketsModal,
  getOrCreateTicketChatChannel,
  IncidentTicket,
  TripSnapshotInfo,
} from '../../services/ticketService';

interface ReportIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRideId?: string;
  defaultVehicleInfo?: string;
  tripSnapshot?: TripSnapshotInfo;
  onSuccessCreated?: (channelId: string) => void;
}

export const ReportIncidentModal: React.FC<ReportIncidentModalProps> = ({
  isOpen,
  onClose,
  defaultRideId,
  defaultVehicleInfo,
  tripSnapshot,
  onSuccessCreated,
}) => {
  const { currentUser, userProfile, driverProfile, role } = useAuth();

  const currentUserId = currentUser?.uid || (role === 'admin' ? 'admin' : '');
  const currentUserName =
    role === 'admin'
      ? 'Dispatch Admin'
      : role === 'driver'
      ? driverProfile?.fullName || 'Driver'
      : userProfile?.fullName || 'User';
  const currentUserRole: 'customer' | 'driver' | 'admin' =
    role === 'admin' ? 'admin' : role === 'driver' ? 'driver' : 'customer';

  const initialLocation = tripSnapshot
    ? `${tripSnapshot.pickupAddress || ''} ➔ ${tripSnapshot.destinationAddress || ''}`.trim()
    : '';

  const [category, setCategory] = useState<IncidentCategory>('other');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [subject, setSubject] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [locationAddress, setLocationAddress] = useState<string>(initialLocation);
  const [vehicleInfo, setVehicleInfo] = useState<string>(
    tripSnapshot?.driverVehicleInfo || defaultVehicleInfo || ''
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [createdTicket, setCreatedTicket] = useState<IncidentTicket | null>(null);
  const [isOpeningChat, setIsOpeningChat] = useState<boolean>(false);
  const [showTripDetails, setShowTripDetails] = useState<boolean>(false);

  // Sync state if tripSnapshot changes
  React.useEffect(() => {
    if (tripSnapshot) {
      if (!locationAddress) {
        setLocationAddress(`${tripSnapshot.pickupAddress || ''} ➔ ${tripSnapshot.destinationAddress || ''}`.trim());
      }
      if (!vehicleInfo && tripSnapshot.driverVehicleInfo) {
        setVehicleInfo(tripSnapshot.driverVehicleInfo);
      }
    }
  }, [tripSnapshot]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim() || submitting) return;

    setSubmitting(true);
    try {
      const ticket = await createIncidentTicket({
        reporterId: currentUserId,
        reporterName: currentUserName,
        reporterRole: currentUserRole,
        category,
        priority,
        subject,
        description,
        locationAddress: locationAddress || undefined,
        vehicleInfo: vehicleInfo || undefined,
        rideId: tripSnapshot?.bookingId || defaultRideId || undefined,
        tripSnapshot: tripSnapshot || undefined,
      });

      setCreatedTicket(ticket);
      setSubmitting(false);
    } catch (err) {
      console.error('Failed to create incident report:', err);
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    const tId = createdTicket?.id;
    setCreatedTicket(null);
    setSubject('');
    setDescription('');
    setLocationAddress('');
    onClose();
    if (tId) {
      openSupportTicketsModal(tId);
    }
  };

  const handleFollowUpChat = async () => {
    if (!createdTicket) return;
    setIsOpeningChat(true);
    try {
      const channelId = await getOrCreateTicketChatChannel(createdTicket);
      setCreatedTicket(null);
      setSubject('');
      setDescription('');
      setLocationAddress('');
      onClose();
      if (onSuccessCreated) {
        onSuccessCreated(channelId);
      }
    } catch (err) {
      console.error('Failed to start chat for ticket:', err);
    } finally {
      setIsOpeningChat(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in select-none">
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-[#0D47A1] text-white px-4 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500 flex items-center justify-center text-white shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black">Report Incident / Support Issue</h2>
              <p className="text-[10px] text-blue-100 font-bold">
                Official report sent directly to E-Shuttle Admin Dispatch
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setCreatedTicket(null);
              onClose();
            }}
            className="p-1.5 hover:bg-white/20 rounded-xl transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        {createdTicket ? (
          <div className="p-6 text-center space-y-4 overflow-y-auto">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 border-2 border-emerald-500 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
              <CheckCircle className="w-9 h-9" />
            </div>

            <div className="space-y-1">
              <span className="px-3 py-1 bg-blue-100 text-[#0D47A1] font-black text-xs rounded-full uppercase">
                Status: Under Review
              </span>
              <h3 className="text-base font-black text-[#0D47A1] pt-2">
                Report #{createdTicket.ticketNumber} Logged
              </h3>
              <p className="text-xs text-slate-600 font-medium">
                Admin Dispatch has been alerted to review your incident. You can track this report anytime in your Support Desk.
              </p>
            </div>

            <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-3.5 text-left text-xs space-y-1.5">
              <div className="flex justify-between items-center text-[11px] font-bold text-slate-500">
                <span>Category: <strong className="text-slate-800">{INCIDENT_CATEGORIES[createdTicket.category]?.label || createdTicket.category}</strong></span>
                <span className="uppercase text-[#0D47A1] font-black">{createdTicket.priority} Priority</span>
              </div>
              <div className="font-bold text-slate-900">{createdTicket.subject}</div>
              <p className="text-slate-600 text-[11px] line-clamp-2">{createdTicket.description}</p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleDone}
                title="Track ticket in support desk"
                className="w-full py-3 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-xs shadow-md uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <ClipboardList className="w-4 h-4" />
                <span>Track Ticket</span>
              </button>

              <button
                type="button"
                onClick={handleFollowUpChat}
                disabled={isOpeningChat}
                title="Open direct chat with support admin"
                className="w-full py-2.5 bg-white hover:bg-slate-50 border-2 border-[#0D47A1] text-[#0D47A1] rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                {isOpeningChat ? (
                  <div className="w-4 h-4 border-2 border-[#0D47A1] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    <span>Chat Admin</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-3.5 text-xs">
            {/* Linked Trip Snapshot Card if reporting from Trip History */}
            {tripSnapshot && (
              <div className="bg-[#E3F2FD] border border-[#0D47A1]/40 rounded-2xl p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Bike className="w-3.5 h-3.5 text-[#0D47A1]" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#0D47A1]">
                      Trip Record
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                      tripSnapshot.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {tripSnapshot.status || 'Trip'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowTripDetails(!showTripDetails)}
                      className="text-[10px] font-bold text-[#0D47A1] hover:underline"
                    >
                      {showTripDetails ? 'Less Info' : 'More Info'}
                    </button>
                  </div>
                </div>

                <div className="text-xs text-[#0D47A1] flex items-center gap-1.5 font-bold">
                  <span className="truncate">{tripSnapshot.pickupAddress || 'Pickup'}</span>
                  <span className="shrink-0 text-slate-400 font-normal">➔</span>
                  <span className="truncate">{tripSnapshot.destinationAddress || 'Drop-off'}</span>
                </div>

                {showTripDetails && (
                  <div className="pt-2 border-t border-[#0D47A1]/20 text-[11px] text-slate-600 grid grid-cols-2 gap-2 animate-in fade-in">
                    {tripSnapshot.driverName && (
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Driver</span>
                        <span className="font-bold text-slate-800">{tripSnapshot.driverName}</span>
                      </div>
                    )}
                    {tripSnapshot.customerName && (
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Passenger</span>
                        <span className="font-bold text-slate-800">{tripSnapshot.customerName}</span>
                      </div>
                    )}
                    {tripSnapshot.driverVehicleInfo && (
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Unit</span>
                        <span className="font-bold text-slate-800">{tripSnapshot.driverVehicleInfo}</span>
                      </div>
                    )}
                    {tripSnapshot.distanceKm && (
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Distance</span>
                        <span className="font-bold text-slate-800">{tripSnapshot.distanceKm} km</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Category Grid */}
            <div>
              <label className="block text-[11px] font-black text-[#0D47A1] uppercase mb-1.5">
                Incident Category *
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(INCIDENT_CATEGORIES) as IncidentCategory[]).map((catKey) => {
                  const info = INCIDENT_CATEGORIES[catKey];
                  const isSelected = category === catKey;
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => setCategory(catKey)}
                      className={`p-2 rounded-xl text-left border-2 transition-all flex items-center gap-2 ${
                        isSelected
                          ? 'border-[#0D47A1] bg-[#E3F2FD] font-black text-[#0D47A1] shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-base shrink-0">{info.icon}</span>
                      <span className="text-[11px] truncate">{info.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Priority Selector */}
            <div>
              <label className="block text-[11px] font-black text-[#0D47A1] uppercase mb-1.5">
                Urgency Priority *
              </label>
              <div className="flex items-center gap-2">
                {[
                  { id: 'low', label: 'Low', color: 'bg-blue-100 text-blue-800' },
                  { id: 'medium', label: 'Medium', color: 'bg-amber-100 text-amber-800' },
                  { id: 'high', label: 'High', color: 'bg-orange-100 text-orange-800' },
                  { id: 'emergency', label: '🚨 Emergency', color: 'bg-rose-600 text-white font-black' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPriority(p.id as TicketPriority)}
                    className={`flex-1 py-1.5 px-2 rounded-xl font-black text-[10px] uppercase border-2 transition-all ${
                      priority === p.id
                        ? 'border-[#0D47A1] shadow-sm ring-2 ring-[#0D47A1]/20 ' + p.color
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject Input */}
            <div>
              <label className="block text-[11px] font-black text-[#0D47A1] uppercase mb-1">
                Summary / Subject *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Left bag on e-shuttle / Driver reckless speed"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl px-3 py-2 font-bold text-[#0D47A1] focus:bg-white focus:outline-none"
              />
            </div>

            {/* Detailed Description */}
            <div>
              <label className="block text-[11px] font-black text-[#0D47A1] uppercase mb-1">
                Detailed Description *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Describe what happened, time of incident, and any details to assist dispatch..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-3 font-semibold text-[#0D47A1] focus:bg-white focus:outline-none"
              />
            </div>

            {/* Optional Location & Shuttle details */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#0D47A1]" /> Location (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. City College Station"
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-[#0D47A1] font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1 flex items-center gap-1">
                  <Bike className="w-3 h-3 text-[#0D47A1]" /> Unit # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shuttle Unit 03"
                  value={vehicleInfo}
                  onChange={(e) => setVehicleInfo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-[#0D47A1] font-bold"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2 border-t border-slate-200">
              <button
                type="submit"
                disabled={!subject.trim() || !description.trim() || submitting}
                title="Submit report directly to admin dispatch"
                className="w-full py-3 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-xs shadow-lg uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 transition-transform active:scale-95"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit Report</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
