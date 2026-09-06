import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Cpu,
  UserCheck,
  AlertTriangle,
  Clock,
  BookOpen,
  Compass,
  Bus,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Navigation,
} from 'lucide-react';
import { useBackHandler } from '../../contexts/NativeBackContext';

interface AdminTutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tabName: string) => void;
  initialStepIndex?: number;
}

type GuideRole = 'admin' | 'passenger' | 'driver';

interface SimpleStep {
  id: string;
  stepNumber: number;
  title: string;
  purpose: string;
  badge: string;
  icon: React.ReactNode;
  colorTheme: string;
  targetTab?: string;
  targetTabLabel?: string;
  points: { title: string; desc: string }[];
  quickTip: string;
}

export const AdminTutorialModal: React.FC<AdminTutorialModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  initialStepIndex = 0,
}) => {
  const [selectedRole, setSelectedRole] = useState<GuideRole>('admin');
  const [currentStep, setCurrentStep] = useState<number>(initialStepIndex);

  useBackHandler(
    isOpen,
    () => {
      onClose();
      return true;
    },
    30,
    'admin-tutorial-modal'
  );

  useEffect(() => {
    if (initialStepIndex >= 0) {
      setCurrentStep(initialStepIndex);
    }
  }, [initialStepIndex, isOpen]);

  if (!isOpen) return null;

  // 1. ADMIN GUIDE (5 direct, simple steps)
  const adminSteps: SimpleStep[] = [
    {
      id: 'step-map',
      stepNumber: 1,
      title: 'Live Map & Active Rides',
      purpose: 'See where e-shuttles are moving and watch passenger ride requests in real-time.',
      badge: 'Step 1 of 5',
      icon: <Compass className="w-6 h-6 text-[#0D47A1]" />,
      colorTheme: 'bg-blue-50 border-blue-200 text-[#0D47A1]',
      targetTab: 'dashboard',
      targetTabLabel: 'Open Live Map',
      points: [
        {
          title: 'Track Shuttles Live',
          desc: 'Watch active e-shuttles roam along Tagaytay routes with real-time GPS locations.',
        },
        {
          title: 'View Passenger Requests',
          desc: 'Incoming ride bookings from commuters appear instantly on the map with their pickup stop.',
        },
        {
          title: 'Inspect Shuttle Details',
          desc: 'Click on any shuttle marker to see its plate number, driver, and current passenger count.',
        },
      ],
      quickTip: 'The map updates automatically with live GPS without needing to refresh your page.',
    },
    {
      id: 'step-drivers',
      stepNumber: 2,
      title: 'Drivers & RFID Tap Cards',
      purpose: 'Review authorized drivers, check their licenses, and pair contactless RFID cards.',
      badge: 'Step 2 of 5',
      icon: <UserCheck className="w-6 h-6 text-emerald-600" />,
      colorTheme: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      targetTab: 'drivers',
      targetTabLabel: 'Manage Drivers',
      points: [
        {
          title: 'Review New Drivers',
          desc: 'Check new driver registrations and inspect their uploaded Land Transportation Office (LTO) driver’s license.',
        },
        {
          title: 'Pair RFID Cards',
          desc: 'Click "Pair RFID" to link a physical card UID so drivers can tap-in to start their shift.',
        },
        {
          title: 'Approve or Suspend',
          desc: 'Switch driver status to Approved to allow them to accept passenger trips on the road.',
        },
      ],
      quickTip: 'Our automatic license scanner helps verify official LTO credentials when reviewing documents.',
    },
    {
      id: 'step-stations',
      stepNumber: 3,
      title: 'Stops & Stations',
      purpose: 'Manage designated passenger pickup and drop-off points along Tagaytay roads.',
      badge: 'Step 3 of 5',
      icon: <MapPin className="w-6 h-6 text-indigo-600" />,
      colorTheme: 'bg-indigo-50 border-indigo-200 text-indigo-800',
      targetTab: 'stations',
      targetTabLabel: 'Manage Stations',
      points: [
        {
          title: 'Browse Station Network',
          desc: 'View designated stops such as City Hall, Olivarez Plaza, Tagaytay National High School, and more.',
        },
        {
          title: 'Add New Stop',
          desc: 'Click "+ Add Station" to create a new pickup location so passengers can select it when requesting rides.',
        },
        {
          title: 'Adjust Pin Location',
          desc: 'Position stop markers accurately on the road to make pickup and boarding predictable.',
        },
      ],
      quickTip: 'Keep stations near safe, well-lit sidewalks and official loading bays.',
    },
    {
      id: 'step-incidents',
      stepNumber: 4,
      title: 'Passenger Safety & Help',
      purpose: 'Respond quickly to passenger emergency SOS alerts and support inquiries.',
      badge: 'Step 4 of 5',
      icon: <AlertTriangle className="w-6 h-6 text-rose-600" />,
      colorTheme: 'bg-rose-50 border-rose-200 text-rose-800',
      targetTab: 'incidents',
      targetTabLabel: 'View Incidents & Support',
      points: [
        {
          title: 'Emergency Alerts',
          desc: 'Urgent passenger SOS reports appear immediately with GPS coordinates and contact numbers.',
        },
        {
          title: 'Provide Fast Support',
          desc: 'Contact the rider or driver right away to assist with lost items, delays, or emergency help.',
        },
        {
          title: 'Resolve Tickets',
          desc: 'Once resolved, update the ticket status to keep your support queue clear and organized.',
        },
      ],
      quickTip: 'Safety is our highest priority—check open tickets regularly during peak hours.',
    },
    {
      id: 'step-logs',
      stepNumber: 5,
      title: 'Activity History',
      purpose: 'Keep a clear, orderly record of recent updates, approvals, and system changes.',
      badge: 'Step 5 of 5',
      icon: <Clock className="w-6 h-6 text-amber-600" />,
      colorTheme: 'bg-amber-50 border-amber-200 text-amber-800',
      targetTab: 'logs',
      targetTabLabel: 'View Activity Logs',
      points: [
        {
          title: 'Recent Team Actions',
          desc: 'See who approved a driver, added a station stop, or adjusted operational settings.',
        },
        {
          title: 'Quick Search',
          desc: 'Search by driver name, station name, or action to find any past update easily.',
        },
        {
          title: 'Export Records',
          desc: 'Download clean activity reports anytime for city transport documentation.',
        },
      ],
      quickTip: 'Activity history helps your administrative team stay aligned and coordinated.',
    },
  ];

  // 2. PASSENGER GUIDE (3 simple steps)
  const passengerSteps: SimpleStep[] = [
    {
      id: 'p-step-1',
      stepNumber: 1,
      title: 'Choose Your Pickup & Drop-off',
      purpose: 'Select where you are and where you want to go in Tagaytay.',
      badge: 'Passenger Step 1',
      icon: <MapPin className="w-6 h-6 text-[#0D47A1]" />,
      colorTheme: 'bg-blue-50 border-blue-200 text-[#0D47A1]',
      points: [
        {
          title: 'Pick a Station Stop',
          desc: 'Choose from official landmark stops like City Hall, Olivarez, or school terminals.',
        },
        {
          title: 'Set Number of Passengers',
          desc: 'Specify how many seats you need so the driver knows your group size.',
        },
      ],
      quickTip: 'Stops are conveniently located along main travel corridors.',
    },
    {
      id: 'p-step-2',
      stepNumber: 2,
      title: 'Request Free Shuttle Ride',
      purpose: 'Tagaytay E-Shuttle is 100% free of charge for all commuters.',
      badge: 'Passenger Step 2',
      icon: <Bus className="w-6 h-6 text-emerald-600" />,
      colorTheme: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      points: [
        {
          title: 'Zero Fare Required',
          desc: 'No payment or card required. The e-shuttle is an eco-friendly community service.',
        },
        {
          title: 'Automatic Driver Dispatch',
          desc: 'The nearest available driver on shift receives your ride request right away.',
        },
      ],
      quickTip: 'You can cancel anytime if your travel plans change.',
    },
    {
      id: 'p-step-3',
      stepNumber: 3,
      title: 'Track Shuttle & Hop On',
      purpose: 'Watch your shuttle arrive on the live map and enjoy a comfortable ride.',
      badge: 'Passenger Step 3',
      icon: <Navigation className="w-6 h-6 text-indigo-600" />,
      colorTheme: 'bg-indigo-50 border-indigo-200 text-indigo-800',
      points: [
        {
          title: 'Live Moving Map',
          desc: 'See the shuttle approaching your station with live arrival time updates.',
        },
        {
          title: 'Board Safely',
          desc: 'Hop in when the shuttle arrives, relax, and alight safely at your destination.',
        },
      ],
      quickTip: 'Use the Emergency SOS button inside the ride screen if you ever need urgent help.',
    },
  ];

  // 3. DRIVER GUIDE (3 simple steps)
  const driverSteps: SimpleStep[] = [
    {
      id: 'd-step-1',
      stepNumber: 1,
      title: 'Tap In to Start Shift',
      purpose: 'Start your operational duty using your physical RFID card or app button.',
      badge: 'Driver Step 1',
      icon: <Cpu className="w-6 h-6 text-purple-600" />,
      colorTheme: 'bg-purple-50 border-purple-200 text-purple-800',
      points: [
        {
          title: 'Tap RFID Card or Go Online',
          desc: 'Tap your issued RFID card against the reader or switch your status to Online in the app.',
        },
        {
          title: 'Assigned Vehicle',
          desc: 'Verify that your e-shuttle unit ID and plate number match your assigned vehicle.',
        },
      ],
      quickTip: 'Make sure your device has location/GPS enabled so passengers can see your arrival.',
    },
    {
      id: 'd-step-2',
      stepNumber: 2,
      title: 'Accept Passenger Pickups',
      purpose: 'Receive ride requests from waiting commuters along your route.',
      badge: 'Driver Step 2',
      icon: <Bus className="w-6 h-6 text-[#0D47A1]" />,
      colorTheme: 'bg-blue-50 border-blue-200 text-[#0D47A1]',
      points: [
        {
          title: 'Station Ride Notifications',
          desc: 'When a commuter books a ride at a stop ahead, you will hear a chime with their location.',
        },
        {
          title: 'Pick Up Riders',
          desc: 'Pull into the designated station loading bay and welcome the passengers aboard.',
        },
      ],
      quickTip: 'Follow standard city speed limits and observe pedestrian crosswalks at all times.',
    },
    {
      id: 'd-step-3',
      stepNumber: 3,
      title: 'Drop Off & Complete Trip',
      purpose: 'Alight passengers safely and prepare for subsequent pickups.',
      badge: 'Driver Step 3',
      icon: <CheckCircle2 className="w-6 h-6 text-emerald-600" />,
      colorTheme: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      points: [
        {
          title: 'Arrive at Destination Stop',
          desc: 'Stop at the passenger’s requested station and let them disembark safely.',
        },
        {
          title: 'Tap "Complete Trip"',
          desc: 'Mark the trip finished so your shuttle is immediately ready for the next commuter.',
        },
      ],
      quickTip: 'Tap out or go Offline when taking a meal break or ending your daily shift.',
    },
  ];

  const activeStepList =
    selectedRole === 'admin'
      ? adminSteps
      : selectedRole === 'passenger'
      ? passengerSteps
      : driverSteps;

  const currentStepData = activeStepList[Math.min(currentStep, activeStepList.length - 1)];

  const handleRoleChange = (role: GuideRole) => {
    setSelectedRole(role);
    setCurrentStep(0);
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (currentStep < activeStepList.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handleJumpToTab = (tabName?: string) => {
    if (tabName && onNavigateTab) {
      onNavigateTab(tabName);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#0D47A1] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-amber-300 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight">How to Use E-Shuttle</h2>
                <span className="bg-amber-400 text-slate-900 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                  Simple Walkthrough
                </span>
              </div>
              <p className="text-xs text-blue-100">
                Clear, easy guide focused directly on our shuttle service purpose
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all shrink-0"
            title="Close Guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Selector Tabs */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-2 overflow-x-auto shrink-0 text-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0 hidden sm:inline">
            Select Guide:
          </span>
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => handleRoleChange('admin')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
                selectedRole === 'admin'
                  ? 'bg-[#0D47A1] text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin Guide ({adminSteps.length} Steps)</span>
            </button>

            <button
              onClick={() => handleRoleChange('passenger')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
                selectedRole === 'passenger'
                  ? 'bg-[#0D47A1] text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Rider Guide ({passengerSteps.length} Steps)</span>
            </button>

            <button
              onClick={() => handleRoleChange('driver')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
                selectedRole === 'driver'
                  ? 'bg-[#0D47A1] text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Bus className="w-3.5 h-3.5" />
              <span>Driver Guide ({driverSteps.length} Steps)</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Active Step Card */}
          <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-white shadow-sm space-y-4">
            {/* Step Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-2xl border ${currentStepData.colorTheme} shrink-0`}>
                  {currentStepData.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {currentStepData.badge}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                    {currentStepData.title}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed font-medium">
                    {currentStepData.purpose}
                  </p>
                </div>
              </div>

              {/* Jump to Tab shortcut if in Admin mode */}
              {selectedRole === 'admin' && currentStepData.targetTab && (
                <button
                  onClick={() => handleJumpToTab(currentStepData.targetTab)}
                  className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-[#E3F2FD] hover:bg-[#90CAF9]/40 text-[#0D47A1] border border-[#0D47A1] rounded-xl text-xs font-bold shrink-0 transition-colors"
                  title={`Open ${currentStepData.targetTabLabel} right now`}
                >
                  <span>{currentStepData.targetTabLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Step Action Points */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                What to do:
              </h4>
              <div className="space-y-2">
                {currentStepData.points.map((pt, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 bg-slate-50 border border-slate-200/70 p-3 rounded-xl text-xs"
                  >
                    <div className="w-5 h-5 rounded-full bg-[#0D47A1] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{pt.title}</p>
                      <p className="text-slate-600 mt-0.5 leading-relaxed">{pt.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Tip / Purpose Note */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-amber-900 text-xs">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong className="font-bold">Helpful Tip: </strong>
                {currentStepData.quickTip}
              </p>
            </div>

            {/* Mobile Tab shortcut */}
            {selectedRole === 'admin' && currentStepData.targetTab && (
              <button
                onClick={() => handleJumpToTab(currentStepData.targetTab)}
                className="sm:hidden w-full flex items-center justify-center gap-1 py-2 bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1] rounded-xl text-xs font-bold transition-colors"
              >
                <span>{currentStepData.targetTabLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex items-center justify-between gap-3 shrink-0">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {activeStepList.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === currentStep
                    ? 'w-6 bg-[#0D47A1]'
                    : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
                title={`Go to Step ${idx + 1}`}
              />
            ))}
            <span className="text-[11px] font-bold text-slate-500 ml-2">
              {currentStep + 1} of {activeStepList.length}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="px-3 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1 disabled:opacity-40 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              onClick={handleNext}
              className="px-4 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-bold text-xs rounded-xl flex items-center gap-1 shadow-sm transition-colors"
            >
              <span>
                {currentStep === activeStepList.length - 1 ? 'Finish Guide' : 'Next Step'}
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
