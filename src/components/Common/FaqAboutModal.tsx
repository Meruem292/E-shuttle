import React, { useState } from 'react';
import {
  HelpCircle,
  Info,
  MapPin,
  Bus,
  ShieldCheck,
  HeartHandshake,
  GraduationCap,
  Building2,
  Leaf,
  Sparkles,
  Users,
  Code2,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  Newspaper,
  Compass,
  AlertCircle,
  Award,
  Search,
  BookOpen,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { useBackHandler } from '../../contexts/NativeBackContext';
import { useAppLogo, markLogoUrlAsFailed, officialLogoFallback } from '../../services/logoService';
import scsLogo from '../../images/scs_logo.jpg';
import cctLogo from '../../images/cct_logo.jpg';

interface FaqAboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'guide' | 'faqs' | 'routes' | 'history' | 'about';
}

export const FaqAboutModal: React.FC<FaqAboutModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'faqs',
}) => {
  const { logoUrl: appLogo } = useAppLogo();
  const [activeTab, setActiveTab] = useState<'guide' | 'faqs' | 'routes' | 'history' | 'about'>(defaultTab);
  const [guideRole, setGuideRole] = useState<'passenger' | 'driver'>('passenger');
  const [expandedFaq, setExpandedFaq] = useState<string | null>('free_shuttle');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useBackHandler(
    isOpen,
    () => {
      onClose();
      return true;
    },
    25,
    'faq-about-modal'
  );

  if (!isOpen) return null;

  const toggleFaq = (id: string) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  const developers = [
    {
      name: 'Maria Irish Suarez',
      role: 'Lead Developer / UI Designer',
      desc: 'Responsible for system design, UI layout, and core development of the E-Shuttle app.',
      avatar: 'IS',
      color: 'bg-blue-600',
    },
    {
      name: 'Daniella Pusing',
      role: 'Backend Developer',
      desc: 'Handles database architecture, API integration, and real-time state synchronization.',
      avatar: 'DP',
      color: 'bg-indigo-600',
    },
    {
      name: 'Sean Eulin',
      role: 'Research, Documentation & Support Encoder',
      desc: 'Leads research, documentation, and system data encoding for shuttle operations.',
      avatar: 'SE',
      color: 'bg-cyan-600',
    },
    {
      name: 'Wilma Serafin',
      role: 'Documentation, Research & UI Support',
      desc: 'Provides research, documentation, and technical support for UI design and data encoding.',
      avatar: 'WS',
      color: 'bg-teal-600',
    },
  ];

  const faqsList = [
    {
      id: 'free_shuttle',
      question: 'Is the Tagaytay E-Shuttle Really Free?',
      answer:
        'Yes! The short answer is NO, you do NOT need to pay. It is 100% FREE! This initiative is part of Tagaytay City\'s commitment to provide accessible, safe, and inclusive transportation for everyone.',
      tag: '100% Free Ride',
    },
    {
      id: 'safety_priority',
      question: 'Why did the city launch this free shuttle service?',
      answer:
        'Safety is the top priority. Routes along Mayor\'s Drive and key corridors can be challenging for pedestrians during peak hours or bad weather. The free shuttle encourages residents, students, and visitors to choose a safer, covered mode of transport instead of walking long or risky routes, reducing accidents and traffic exposure for minors.',
      tag: 'Public Safety',
    },
    {
      id: 'student_support',
      question: 'How does the program support Tagaytay students?',
      answer:
        'Daily transport fares add up quickly. Through 10 dedicated eShuttle units assigned to Tagaytay National High School (TNHS), students save money daily for school projects, supplies, and snacks, while getting home comfortably after school hours.',
      tag: 'Student Support',
    },
    {
      id: 'city_hall_access',
      question: 'Can I take the eShuttle to process papers at Tagaytay City Hall?',
      answer:
        'Absolutely! 27 units are stationed near Tagaytay City Hall to assist daily commuters, City Hall employees, and constituents accessing government services, permits, documents, and city assistance.',
      tag: 'City Hall Access',
    },
    {
      id: 'eco_friendly',
      question: 'Are the eShuttle vehicles eco-friendly?',
      answer:
        'Yes. All 37 eShuttle units are 100% electric-powered. They produce zero direct carbon emissions, contributing to cleaner air and a greener Tagaytay City.',
      tag: 'Zero Emissions',
    },
    {
      id: 'tourist_events',
      question: 'Are tourists and visitors allowed to ride the eShuttle?',
      answer:
        'Yes! Visitors and tourists can ride free of charge. During major events, festivals, or peak tourism seasons, flexible route exemptions allow convenient drop-offs near event venues and attractions (within local safe zones).',
      tag: 'Tourism & Events',
    },
    {
      id: 'operating_hours',
      question: 'What are the operational boundaries and route limits?',
      answer:
        'The eShuttle operates on a continuous loop connecting City Hall, City College, Velodrome, and Convention Center. Standard routes stay on safe local roads, avoid national highways, and operate within the Sky Ranch Tagaytay boundary limits.',
      tag: 'Route Limits',
    },
  ];

  const filteredFaqs = faqsList.filter(
    (f) =>
      f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto text-[#0D47A1]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0D47A1] via-[#1565C0] to-[#0D47A1] text-white p-4 flex items-center justify-between border-b-2 border-amber-400 shrink-0">
          <div className="flex items-center gap-3">
            <img
              src={appLogo}
              onError={(e) => {
                markLogoUrlAsFailed(appLogo);
                (e.target as HTMLImageElement).src = officialLogoFallback;
              }}
              alt="E-Shuttle Logo"
              className="w-10 h-10 rounded-2xl object-cover border-2 border-white shadow"
            />
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-1.5">
                <span>Tagaytay E-Shuttle Center</span>
                <span className="bg-amber-400 text-[#0D47A1] text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm">
                  100% FREE
                </span>
              </h2>
              <p className="text-[11px] text-blue-100 font-medium">
                Official FAQs, Route Information, History & Developers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors font-bold text-sm"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="bg-[#E3F2FD] border-b border-[#0D47A1]/20 p-2 grid grid-cols-5 gap-1 text-[#0D47A1] shrink-0 font-bold text-xs">
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-2 px-1 sm:px-2 rounded-xl flex items-center justify-center gap-1 transition-all ${
              activeTab === 'guide'
                ? 'bg-[#0D47A1] text-white font-extrabold shadow'
                : 'hover:bg-[#90CAF9]/40 text-[#0D47A1]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="truncate">How to Use</span>
          </button>
          <button
            onClick={() => setActiveTab('faqs')}
            className={`py-2 px-1 sm:px-2 rounded-xl flex items-center justify-center gap-1 transition-all ${
              activeTab === 'faqs'
                ? 'bg-[#0D47A1] text-white font-extrabold shadow'
                : 'hover:bg-[#90CAF9]/40 text-[#0D47A1]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="truncate">FAQs</span>
          </button>
          <button
            onClick={() => setActiveTab('routes')}
            className={`py-2 px-1 sm:px-2 rounded-xl flex items-center justify-center gap-1 transition-all ${
              activeTab === 'routes'
                ? 'bg-[#0D47A1] text-white font-extrabold shadow'
                : 'hover:bg-[#90CAF9]/40 text-[#0D47A1]'
            }`}
          >
            <Bus className="w-3.5 h-3.5" />
            <span className="truncate">Routes</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-2 px-1 sm:px-2 rounded-xl flex items-center justify-center gap-1 transition-all ${
              activeTab === 'history'
                ? 'bg-[#0D47A1] text-white font-extrabold shadow'
                : 'hover:bg-[#90CAF9]/40 text-[#0D47A1]'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5" />
            <span className="truncate">History</span>
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`py-2 px-1 sm:px-2 rounded-xl flex items-center justify-center gap-1 transition-all ${
              activeTab === 'about'
                ? 'bg-[#0D47A1] text-white font-extrabold shadow'
                : 'hover:bg-[#90CAF9]/40 text-[#0D47A1]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="truncate">About</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {/* TAB 0: HOW TO USE (SIMPLE WALKTHROUGH) */}
          {activeTab === 'guide' && (
            <div className="space-y-4">
              {/* Role Toggle */}
              <div className="flex items-center justify-center gap-2 p-1 bg-white border border-[#0D47A1]/20 rounded-2xl shadow-xs">
                <button
                  type="button"
                  onClick={() => setGuideRole('passenger')}
                  className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    guideRole === 'passenger'
                      ? 'bg-[#0D47A1] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Passenger / Commuter Guide</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGuideRole('driver')}
                  className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    guideRole === 'driver'
                      ? 'bg-[#0D47A1] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Bus className="w-3.5 h-3.5" />
                  <span>Driver Guide</span>
                </button>
              </div>

              {guideRole === 'passenger' ? (
                <div className="space-y-3">
                  <div className="bg-white border-2 border-[#0D47A1] rounded-2xl p-4 space-y-1 shadow-sm">
                    <span className="bg-amber-400 text-slate-900 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                      Step 1
                    </span>
                    <h4 className="text-sm font-black text-[#0D47A1]">Select Your Pickup & Drop-off</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Choose your nearest official shuttle station along the route (e.g., City Hall, Olivarez Plaza, Tagaytay National High School) and set your group size.
                    </p>
                  </div>

                  <div className="bg-white border-2 border-emerald-500 rounded-2xl p-4 space-y-1 shadow-sm">
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-300">
                      Step 2
                    </span>
                    <h4 className="text-sm font-black text-emerald-800">Request a 100% Free Ride</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Tap &quot;Book Free Ride&quot;. There is NO fare, payment, or credit card required. The nearest available electric shuttle on duty will be automatically dispatched.
                    </p>
                  </div>

                  <div className="bg-white border-2 border-indigo-500 rounded-2xl p-4 space-y-1 shadow-sm">
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-indigo-300">
                      Step 3
                    </span>
                    <h4 className="text-sm font-black text-indigo-800">Track Shuttle & Hop Aboard</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Watch the e-shuttle arrive on your live GPS map. Hop aboard safely when it pulls into the station bay, and enjoy your quiet, eco-friendly trip!
                    </p>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Safety Tip:</strong> An Emergency SOS button is always available in the app during your trip if you ever need urgent support.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-white border-2 border-purple-500 rounded-2xl p-4 space-y-1 shadow-sm">
                    <span className="bg-purple-100 text-purple-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-purple-300">
                      Step 1
                    </span>
                    <h4 className="text-sm font-black text-purple-800">Tap In with RFID or Go Online</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Tap your issued RFID card against the onboard scanner or tap &quot;Start Shift&quot; in the driver app to mark your e-shuttle available for service.
                    </p>
                  </div>

                  <div className="bg-white border-2 border-[#0D47A1] rounded-2xl p-4 space-y-1 shadow-sm">
                    <span className="bg-blue-100 text-blue-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-blue-300">
                      Step 2
                    </span>
                    <h4 className="text-sm font-black text-[#0D47A1]">Receive Passenger Pickups</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      When waiting commuters request a ride at a stop along your corridor, an alert sounds with their station stop and passenger count.
                    </p>
                  </div>

                  <div className="bg-white border-2 border-emerald-500 rounded-2xl p-4 space-y-1 shadow-sm">
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-300">
                      Step 3
                    </span>
                    <h4 className="text-sm font-black text-emerald-800">Complete Trip & Safe Drop-off</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Drop off riders at their designated station, tap &quot;Complete Trip&quot;, and your shuttle is immediately ready for subsequent commuters.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: FAQs */}
          {activeTab === 'faqs' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search FAQs (e.g., Free, City Hall, Students, Routes)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border-2 border-[#0D47A1]/30 rounded-2xl pl-9 pr-4 py-2 text-xs text-[#0D47A1] placeholder-slate-400 focus:outline-none focus:border-[#0D47A1]"
                />
              </div>

              {/* Free Rides Highlights Banner */}
              <div className="bg-gradient-to-br from-emerald-500 to-teal-700 text-white rounded-2xl p-4 shadow-md space-y-2 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-300" />
                    <h3 className="text-sm font-black uppercase tracking-wider">
                      100% Free E-Shuttle Service
                    </h3>
                  </div>
                  <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border border-white/30">
                    Tagaytay City Ordinance
                  </span>
                </div>
                <p className="text-xs text-emerald-50 leading-relaxed font-medium">
                  Zero fares for students, City Hall transactors, employees, and commuters! Part of Mayor Abraham "Brent" Tolentino's public safety and mobility program.
                </p>
              </div>

              {/* Accordion FAQ Items */}
              <div className="space-y-2.5">
                {filteredFaqs.map((faq) => {
                  const isExpanded = expandedFaq === faq.id;
                  return (
                    <div
                      key={faq.id}
                      className="bg-white border-2 border-[#0D47A1]/30 rounded-2xl overflow-hidden shadow-sm transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => toggleFaq(faq.id)}
                        className="w-full text-left p-3.5 flex items-center justify-between gap-3 hover:bg-[#E3F2FD]/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 flex-1">
                          <HelpCircle className="w-4 h-4 text-[#0D47A1] shrink-0" />
                          <span className="text-xs font-black text-[#0D47A1]">{faq.question}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] font-extrabold uppercase bg-[#E3F2FD] text-[#0D47A1] px-2 py-0.5 rounded-full border border-[#0D47A1]/30">
                            {faq.tag}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-[#0D47A1]" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 text-xs text-slate-600 border-t border-slate-100 leading-relaxed font-medium bg-[#F8FAFC]">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Key Program Benefits Grid */}
              <div className="pt-2 border-t border-slate-200">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0D47A1] mb-2.5 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#0D47A1]" />
                  <span>5 Pillars of Tagaytay Free E-Shuttle</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-[#0D47A1] block">1. Safety Priority</span>
                      <span className="text-[11px] text-slate-500">
                        Reduces pedestrian road risks along Mayor's Drive and busy corridors.
                      </span>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-2.5">
                    <GraduationCap className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-[#0D47A1] block">2. Student Savings</span>
                      <span className="text-[11px] text-slate-500">
                        Helps Tagaytay students save daily money for snacks and school projects.
                      </span>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-2.5">
                    <Building2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-[#0D47A1] block">3. Easy City Hall Access</span>
                      <span className="text-[11px] text-slate-500">
                        Removes transport barriers for constituents processing permits and papers.
                      </span>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-2.5">
                    <Leaf className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-[#0D47A1] block">4. Eco-Friendly Fleet</span>
                      <span className="text-[11px] text-slate-500">
                        100% electric shuttles with zero emissions for a clean, green Tagaytay.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Routes & Fleet Operations */}
          {activeTab === 'routes' && (
            <div className="space-y-4">
              {/* Fleet Overview Banner */}
              <div className="bg-[#0D47A1] text-white p-4 rounded-2xl shadow-md space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Fleet Allocation Overview
                  </span>
                  <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                    Total: 37 Electric Units
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center pt-1">
                  <div className="bg-white/10 p-2.5 rounded-xl border border-white/20">
                    <span className="text-xl font-black text-amber-300 block">27 Units</span>
                    <span className="text-[10px] text-blue-100 font-bold uppercase">
                      City Hall Loop Route
                    </span>
                  </div>
                  <div className="bg-white/10 p-2.5 rounded-xl border border-white/20">
                    <span className="text-xl font-black text-amber-300 block">10 Units</span>
                    <span className="text-[10px] text-blue-100 font-bold uppercase">
                      Tagaytay High School (TNHS)
                    </span>
                  </div>
                </div>
              </div>

              {/* Route 1: Tagaytay City Hall Continuous Loop */}
              <div className="bg-white border-2 border-[#0D47A1]/30 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <Bus className="w-5 h-5 text-[#0D47A1]" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#0D47A1]">
                      1. Tagaytay City Hall Continuous Loop Route
                    </h3>
                  </div>
                  <span className="bg-[#E3F2FD] text-[#0D47A1] text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-[#0D47A1]/30">
                    Loop Service
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  Connects key administrative, educational, cultural, and sports landmarks in Tagaytay City:
                </p>

                <div className="space-y-2 text-xs">
                  <div className="p-2 bg-[#F8FAFC] border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-[#0D47A1]">Tagaytay Velodrome</span>
                    <span className="text-[10px] text-slate-500">Sports complex & open fitness space</span>
                  </div>
                  <div className="p-2 bg-[#F8FAFC] border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-[#0D47A1]">City College of Tagaytay (CCT)</span>
                    <span className="text-[10px] text-slate-500">Public academic & higher education hub</span>
                  </div>
                  <div className="p-2 bg-[#F8FAFC] border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-[#0D47A1]">Tagaytay City Hall</span>
                    <span className="text-[10px] text-slate-500">Main administrative government center</span>
                  </div>
                  <div className="p-2 bg-[#F8FAFC] border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-[#0D47A1]">Old Tagaytay City Hall</span>
                    <span className="text-[10px] text-slate-500">Historical civic landmark</span>
                  </div>
                  <div className="p-2 bg-[#F8FAFC] border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-[#0D47A1]">Tagaytay Int'l Convention Center</span>
                    <span className="text-[10px] text-slate-500">Major conference & event venue</span>
                  </div>
                  <div className="p-2 bg-[#F8FAFC] border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-[#0D47A1]">Sigtuna Hall</span>
                    <span className="text-[10px] text-slate-500">Sister-city cultural landmark (Sigtuna, Sweden)</span>
                  </div>
                </div>
              </div>

              {/* Route 2: Tagaytay National High School Route */}
              <div className="bg-white border-2 border-[#0D47A1]/30 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-blue-600" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#0D47A1]">
                      2. Tagaytay National High School (TNHS) Routes
                    </h3>
                  </div>
                  <span className="bg-blue-100 text-blue-800 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-blue-300">
                    Student Priority
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1">
                    <span className="font-extrabold text-[#0D47A1] block flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-600" />
                      <span>Mahogany Avenue Exit</span>
                    </span>
                    <p className="text-[11px] text-slate-600">
                      Busy corridor near markets, food establishments, residential areas, and transport hubs.
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1">
                    <span className="font-extrabold text-[#0D47A1] block flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-600" />
                      <span>Mendez Crossing Exit</span>
                    </span>
                    <p className="text-[11px] text-slate-600">
                      Major junction connecting Tagaytay to nearby municipalities for out-of-town students.
                    </p>
                  </div>
                </div>
              </div>

              {/* Special Event Operations & Boundaries */}
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-2 shadow-sm text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <h4 className="font-black uppercase tracking-wider text-[#0D47A1]">
                    Special Operations & Route Exemptions
                  </h4>
                </div>
                <p className="text-[11px] leading-relaxed">
                  During major conferences, festivals, or high tourism periods, eShuttles implement flexible point-to-point drop-offs for visitors and attendees.
                </p>
                <div className="pt-1 text-[11px] font-bold text-slate-700 space-y-1">
                  <p>• Avoid national highways for safety & traffic compliance</p>
                  <p>• Operating boundary: Within Sky Ranch Tagaytay route limits</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: History & News Article */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="bg-white border-2 border-[#0D47A1] rounded-2xl p-4 space-y-3 shadow-md">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-[10px] font-extrabold text-rose-700 uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    Cavite Times Journal • 19 September 2025
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">Press Release</span>
                </div>

                <h3 className="text-sm sm:text-base font-black text-[#0D47A1] leading-tight">
                  Tagaytay Mayor Launches Free Shuttle Service to Protect Students and City Hall Transactors from Road Hazards
                </h3>

                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  <strong className="text-[#0D47A1]">TAGAYTAY CITY</strong> — In a proactive effort to improve public safety and transportation accessibility, Honorable Mayor Abraham "Brent" Tolentino officially launched a pilot eShuttle service program in Tagaytay City.
                </p>

                <div className="bg-[#E3F2FD] border border-[#0D47A1]/30 p-3 rounded-xl text-xs text-[#0D47A1] space-y-1.5 font-medium">
                  <p className="font-bold text-[#0D47A1]">Key Highlights of the Program:</p>
                  <p>• Fleet of thirty-seven (37) zero-emission electric shuttles.</p>
                  <p>• 10 dedicated student units servicing Tagaytay National High School.</p>
                  <p>• 27 units serving City Hall transactors, employees, and daily commuters.</p>
                  <p>• Reduces overcrowded public transport, long waits, and road hazards.</p>
                </div>

                <p className="text-xs text-slate-500 italic">
                  "By offering a 100% free shuttle service, we ensure our students travel safely home and our constituents access city services without financial burden."
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: About Us & Meet the Developers */}
          {activeTab === 'about' && (
            <div className="space-y-4">
              {/* Project Vision Card */}
              <div className="bg-white border-2 border-[#0D47A1] rounded-2xl p-4 space-y-2 shadow-md">
                <div className="flex items-center gap-2">
                  <Compass className="w-5 h-5 text-[#0D47A1]" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#0D47A1]">
                    Why We Built E-Shuttle System
                  </h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  While the launch of the free eShuttle service by Mayor Abraham 'Brent' Tolentino was a major step forward, we recognized that a fleet of 37 units requires a robust digital platform to be truly effective. Without real-time tracking, commuters face uncertainty regarding shuttle locations and availability.
                </p>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  We developed this system to modernize the commuting experience—eliminating traditional waiting and transforming a simple shuttle into a streamlined, reliable, and 'hassle-free' digital transportation network.
                </p>
              </div>

              {/* Developer Team Section */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0D47A1] flex items-center gap-1.5">
                  <Code2 className="w-4 h-4 text-[#0D47A1]" />
                  <span>Meet the Developer Team</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {developers.map((dev, idx) => (
                    <div
                      key={idx}
                      className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm space-y-2 flex flex-col justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 ${dev.color} text-white font-black text-sm rounded-xl flex items-center justify-center shadow-md`}
                        >
                          {dev.avatar}
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-[#0D47A1]">{dev.name}</h5>
                          <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 block mt-0.5">
                            {dev.role}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium leading-normal pt-1 border-t border-slate-100">
                        {dev.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Academic & Institution Partner Logos */}
              <div className="bg-[#E3F2FD] border border-[#0D47A1]/30 rounded-2xl p-3 text-center space-y-2">
                <span className="text-[10px] font-extrabold text-[#0D47A1] uppercase tracking-wider">
                  Academic & Technology Partners
                </span>
                <div className="flex items-center justify-center gap-6 pt-1">
                  <img src={scsLogo} alt="SCS Logo" className="h-10 object-contain drop-shadow" />
                  <img src={cctLogo} alt="CCT Logo" className="h-10 object-contain drop-shadow" />
                </div>
                <p className="text-[9px] text-slate-500 font-medium">
                  City College of Tagaytay • School of Computer Studies
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="bg-[#E3F2FD] border-t border-[#0D47A1]/30 p-3 flex items-center justify-between shrink-0 text-xs text-[#0D47A1]">
          <span className="text-[10px] font-bold text-[#0D47A1]">
            Official Tagaytay City Free E-Shuttle Service
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-xs rounded-xl shadow uppercase tracking-wider transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
