import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, AlertTriangle, HelpCircle, Info, Bus, ChevronRight, Upload, Sparkles, CheckCircle, ShieldCheck, X, FileCheck, BookOpen } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { PWAInstallButton } from '../PWAInstallPrompt';
import { useAppLogo, markLogoUrlAsFailed, officialLogoFallback } from '../../services/logoService';
import { FaqAboutModal } from '../Common/FaqAboutModal';
import { NotificationBellButton } from '../Common/NotificationBellButton';
import scsLogo from '../../images/scs_logo.jpg';
import cctLogo from '../../images/cct_logo.jpg';
import { sanitizeVehicleInfo } from '../../utils/sanitizeVehicle';
import { verifyDriverLicenseImage, LicenseVerificationResult } from '../../services/licenseVerificationService';
import { uploadDriverLicenseToFirebaseStorage } from '../../services/firebaseStorageService';

export const DriverProfile: React.FC = () => {
  const { currentUser, driverProfile, logout } = useAuth();
  const { logoUrl: appLogo } = useAppLogo();
  const [isFaqOpen, setIsFaqOpen] = useState<boolean>(false);
  const [faqTab, setFaqTab] = useState<'guide' | 'faqs' | 'routes' | 'history' | 'about'>('faqs');
  const [isUploadingLicense, setIsUploadingLicense] = useState<boolean>(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [verificationResult, setVerificationResult] = useState<LicenseVerificationResult | null>(null);

  const openFaqTab = (tab: 'guide' | 'faqs' | 'routes' | 'history' | 'about') => {
    setFaqTab(tab);
    setIsFaqOpen(true);
  };

  const handleLicenseCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    setIsUploadingLicense(true);
    setOcrProgress(5);
    setOcrStatus('Initializing OCR reader...');
    setVerificationResult(null);

    try {
      const [uploadRes, ocrResult] = await Promise.all([
        uploadDriverLicenseToFirebaseStorage(file),
        verifyDriverLicenseImage(file, (status, progress) => {
          setOcrStatus(status);
          setOcrProgress(progress);
        }),
      ]);

      setVerificationResult(ocrResult);

      if (uploadRes.success && uploadRes.url) {
        const updates: Record<string, any> = {
          driverLicenseCardUrl: uploadRes.url,
        };

        if (ocrResult.isOfficialLTO && ocrResult.detectedLicenseNumber && !driverProfile?.driverLicenseNumber) {
          updates.driverLicenseNumber = ocrResult.detectedLicenseNumber;
        }

        await updateDoc(doc(db, 'drivers', currentUser.uid), updates);
      }
    } catch (err: any) {
      console.error('License upload error:', err);
    } finally {
      setIsUploadingLicense(false);
    }
  };

  const handleDismissNotice = async () => {
    if (currentUser) {
      await updateDoc(doc(db, 'drivers', currentUser.uid), {
        disconnectNotice: null,
      });
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#E3F2FD] text-[#0D47A1] p-4 pb-36 max-w-md mx-auto space-y-5">
      <div className="pt-2 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-[#0D47A1]">
            <span>Driver Profile</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">RFID credentials, active E-Shuttle pairing, and driver status</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBellButton
            className="bg-white border-2 border-[#0D47A1] text-[#0D47A1] shadow-md hover:bg-[#E3F2FD] p-2"
            iconClassName="w-4 h-4 text-[#0D47A1]"
          />
          <img
            src={appLogo}
            onError={(e) => {
              markLogoUrlAsFailed(appLogo);
              (e.target as HTMLImageElement).src = officialLogoFallback;
            }}
            alt="E-Shuttle Official Logo"
            className="w-10 h-10 rounded-2xl object-cover border-2 border-[#0D47A1] shadow-md shrink-0"
          />
        </div>
      </div>

      {driverProfile?.disconnectNotice && (
        <div className="bg-amber-50 border-2 border-amber-400 text-amber-900 text-xs p-3.5 rounded-2xl shadow-xl flex items-center justify-between gap-2 animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <span className="font-bold leading-tight">{driverProfile.disconnectNotice}</span>
          </div>
          <button
            onClick={handleDismissNotice}
            title="Dismiss notice"
            className="bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] px-2.5 py-1.5 rounded-xl uppercase tracking-wider shrink-0 shadow-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Profile & Vehicle Card */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-[#0D47A1] rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-md">
            {driverProfile?.fullName?.charAt(0) || 'D'}
          </div>
          <div>
            <h3 className="text-base font-black text-[#0D47A1]">{driverProfile?.fullName || 'Driver'}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                  driverProfile?.accountStatus === 'APPROVED'
                    ? 'bg-[#E3F2FD] text-[#0D47A1] border-[#0D47A1]'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
              >
                {driverProfile?.accountStatus || 'PENDING'}
              </span>
              <div className="text-xs text-amber-500 font-bold bg-[#E3F2FD] border border-[#0D47A1] px-2 py-0.5 rounded-full">
                <span>{driverProfile?.rating || 5.0} ★</span>
              </div>
            </div>
          </div>
        </div>

        {/* RFID Physical Card Info */}
        <div className="bg-[#F8FAFC] border border-[#0D47A1]/40 p-3 rounded-2xl space-y-1">
          <div className="text-[10px] font-extrabold text-[#0D47A1] uppercase tracking-wider">
            <span>Assigned Driver RFID Card</span>
          </div>
          {driverProfile?.rfidCardUid ? (
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-black text-[#0D47A1]">
                {driverProfile.rfidCardUid}
              </span>
              <span
                title="Tap your RFID card on the E-Shuttle device reader to take over"
                className="text-[9px] font-black text-white bg-[#0D47A1] border border-[#0D47A1] px-2 py-0.5 rounded-full"
              >
                Tap to Take Over E-Shuttle
              </span>
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic font-medium">
              No RFID card linked yet. Contact Admin to pair your card.
            </div>
          )}
        </div>

        {/* Active E-Shuttle Pairing */}
        <div className="bg-[#F8FAFC] border border-[#0D47A1]/40 p-3 rounded-2xl space-y-1">
          <div className="text-[10px] font-extrabold text-[#0D47A1] uppercase tracking-wider">
            <span>Current Paired E-Shuttle</span>
          </div>
          {driverProfile?.activeEbikeId ? (
            <div>
              <div className="text-sm font-bold text-[#0D47A1]">
                {sanitizeVehicleInfo(driverProfile.vehicleInfo)}
              </div>
              <div className="text-xs text-[#0D47A1] font-bold mt-0.5">
                Active Device: {driverProfile.activeEbikeId}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic font-medium">
              Scan your RFID card on any E-Shuttle reader to automatically take over as active driver.
            </div>
          )}
        </div>

        {/* Driver's License Card Section */}
        <div className="bg-[#F8FAFC] border border-[#0D47A1]/40 p-3.5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-[#0D47A1] uppercase tracking-wider">
              Driver's License Card (Admin Validation)
            </span>
            <span
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                driverProfile?.driverLicenseCardUrl
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              {driverProfile?.driverLicenseCardUrl ? '✓ Photo Uploaded' : '⚠️ Photo Pending'}
            </span>
          </div>

          {driverProfile?.driverLicenseNumber && (
            <div className="text-xs font-mono font-bold text-[#0D47A1]">
              License No: {driverProfile.driverLicenseNumber}
            </div>
          )}

          {driverProfile?.driverLicenseCardUrl ? (
            <div className="space-y-2">
              <div className="relative w-full h-36 bg-slate-100 rounded-xl overflow-hidden border-2 border-emerald-500 shadow-sm">
                <img
                  src={driverProfile.driverLicenseCardUrl}
                  alt="Driver License Card"
                  className="w-full h-full object-cover"
                />
                <label className="absolute bottom-2 right-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer shadow flex items-center gap-1">
                  <Upload className="w-3 h-3" />
                  <span>Replace Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isUploadingLicense}
                    onChange={handleLicenseCardUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {verificationResult && (
                verificationResult.isOfficialLTO ? (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl space-y-1.5 text-emerald-900 text-xs">
                    <div className="flex items-center gap-1.5 font-extrabold text-emerald-700">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>Official LTO License Verified</span>
                      <span className="ml-auto text-[10px] bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded-full font-bold">
                        {verificationResult.confidence}% Confidence
                      </span>
                    </div>
                    {verificationResult.detectedLicenseNumber && (
                      <div className="flex items-center justify-between text-[11px] bg-white/90 p-1.5 rounded-lg border border-emerald-200 font-mono">
                        <span className="text-emerald-800">Detected on Card:</span>
                        <span className="font-extrabold text-emerald-950">{verificationResult.detectedLicenseNumber}</span>
                      </div>
                    )}
                    <div className="text-[10px] text-emerald-700 flex flex-wrap gap-1 items-center pt-0.5">
                      <span className="font-semibold">Security Markers:</span>
                      {verificationResult.matchedKeywords.slice(0, 3).map((kw) => (
                        <span key={kw} className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[9px] font-bold">
                          ✓ {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-800">Automated Pre-Check Notice</p>
                      <p className="text-[10px]">{verificationResult.feedbackMessage}</p>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : isUploadingLicense ? (
            <div className="p-4 bg-white border-2 border-dashed border-[#0D47A1] rounded-2xl flex flex-col items-center justify-center space-y-2">
              <Sparkles className="w-5 h-5 animate-spin text-[#0D47A1]" />
              <div className="text-center">
                <span className="text-xs font-bold text-[#0D47A1] block">
                  Scanning Card Photo...
                </span>
                <span className="text-[10px] text-slate-500">
                  {ocrStatus || 'Running OCR pre-check...'} ({ocrProgress}%)
                </span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#0D47A1] h-full transition-all duration-300"
                  style={{ width: `${Math.max(5, ocrProgress)}%` }}
                />
              </div>
            </div>
          ) : (
            <label className="block p-3 bg-white border border-dashed border-[#0D47A1] rounded-xl text-center cursor-pointer hover:bg-[#E3F2FD] transition-colors">
              <Upload className="w-5 h-5 text-[#0D47A1] mx-auto mb-1" />
              <span className="text-xs font-bold text-[#0D47A1] block">Upload Driver's License Photo</span>
              <span className="text-[10px] text-slate-400">Required for official admin profile verification</span>
              <input
                type="file"
                accept="image/*"
                disabled={isUploadingLicense}
                className="hidden"
                onChange={handleLicenseCardUpload}
              />
            </label>
          )}
        </div>

        <div className="border-t border-[#0D47A1]/30 pt-3 space-y-2 text-xs text-slate-600">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 uppercase font-mono text-[10px] font-bold">Email:</span>
            <span className="font-bold text-[#0D47A1]">{driverProfile?.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 uppercase font-mono text-[10px] font-bold">Phone:</span>
            <span className="font-bold text-[#0D47A1]">{driverProfile?.phone || '+63 919 888 9999'}</span>
          </div>
        </div>
      </div>

      {/* FAQs & Service Route Information Card */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 space-y-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[#0D47A1]" />
            <span className="text-xs font-black text-[#0D47A1] uppercase tracking-wider">
              Route Info, FAQs & Developers
            </span>
          </div>
          <span className="bg-amber-400 text-[#0D47A1] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
            Driver Manual
          </span>
        </div>

        {/* Simple Driver Walkthrough Button */}
        <button
          onClick={() => openFaqTab('guide')}
          className="w-full p-3 bg-amber-400 hover:bg-amber-300 text-slate-900 border-2 border-amber-500 rounded-2xl flex items-center justify-between transition-all text-left shadow-sm group active:scale-98"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="block font-black text-xs uppercase tracking-tight">How to Use (Driver Guide)</span>
              <span className="block text-[11px] text-slate-800 font-medium">3 simple steps: RFID tap, pickups & trips</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-800 group-hover:translate-x-0.5 transition-transform" />
        </button>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            onClick={() => openFaqTab('routes')}
            className="p-3 bg-[#E3F2FD] hover:bg-[#90CAF9]/40 border border-[#0D47A1]/30 rounded-2xl flex flex-col items-start gap-1 transition-all text-left group"
          >
            <div className="flex items-center justify-between w-full">
              <Bus className="w-4 h-4 text-[#0D47A1]" />
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0D47A1]" />
            </div>
            <span className="font-extrabold text-[#0D47A1]">37 Fleet Route Specs</span>
            <span className="text-[10px] text-slate-500 font-medium">TNHS Exits & City Hall Loop</span>
          </button>

          <button
            onClick={() => openFaqTab('faqs')}
            className="p-3 bg-[#E3F2FD] hover:bg-[#90CAF9]/40 border border-[#0D47A1]/30 rounded-2xl flex flex-col items-start gap-1 transition-all text-left group"
          >
            <div className="flex items-center justify-between w-full">
              <HelpCircle className="w-4 h-4 text-[#0D47A1]" />
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0D47A1]" />
            </div>
            <span className="font-extrabold text-[#0D47A1]">Driver FAQs & Safety</span>
            <span className="text-[10px] text-slate-500 font-medium">Free fare policies</span>
          </button>

          <button
            onClick={() => openFaqTab('history')}
            className="p-3 bg-[#E3F2FD] hover:bg-[#90CAF9]/40 border border-[#0D47A1]/30 rounded-2xl flex flex-col items-start gap-1 transition-all text-left group"
          >
            <div className="flex items-center justify-between w-full">
              <Info className="w-4 h-4 text-[#0D47A1]" />
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0D47A1]" />
            </div>
            <span className="font-extrabold text-[#0D47A1]">Program Ordinance</span>
            <span className="text-[10px] text-slate-500 font-medium">Mayor Brent Tolentino launch</span>
          </button>

          <button
            onClick={() => openFaqTab('about')}
            className="p-3 bg-[#E3F2FD] hover:bg-[#90CAF9]/40 border border-[#0D47A1]/30 rounded-2xl flex flex-col items-start gap-1 transition-all text-left group"
          >
            <div className="flex items-center justify-between w-full">
              <Info className="w-4 h-4 text-[#0D47A1]" />
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0D47A1]" />
            </div>
            <span className="font-extrabold text-[#0D47A1]">About Developer Team</span>
            <span className="text-[10px] text-slate-500 font-medium">Maria, Daniella, Sean & Wilma</span>
          </button>
        </div>
      </div>

      {/* Driver App Installation Card */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 space-y-2 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-[#0D47A1] uppercase tracking-wider">Driver Terminal App</span>
          <PWAInstallButton variant="compact" />
        </div>
        <p className="text-[11px] text-slate-500 font-medium">
          Install the Driver Terminal app to your home screen for quick 1-tap access.
        </p>
        <PWAInstallButton />
      </div>

      <button
        onClick={logout}
        title="Sign out of driver account"
        className="w-full py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border-2 border-rose-300 rounded-2xl font-bold text-xs shadow-sm transition-colors uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95"
      >
        <LogOut className="w-4 h-4" />
        <span>Log Out</span>
      </button>

      {/* Institutional Accreditation */}
      <div className="pt-1 flex items-center justify-center gap-4 opacity-75">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold">
          <img
            src={cctLogo}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/cct_logo.jpg';
            }}
            alt="CCT"
            className="w-5 h-5 rounded-full object-cover border border-[#0D47A1]"
          />
          <span>CCT</span>
        </div>
        <div className="w-1 h-1 bg-[#0D47A1] rounded-full" />
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold">
          <img
            src={scsLogo}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/scs_logo.jpg';
            }}
            alt="SCS"
            className="w-5 h-5 rounded-full object-cover border border-[#0D47A1]"
          />
          <span>SCS</span>
        </div>
      </div>

      <FaqAboutModal
        isOpen={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
        defaultTab={faqTab}
      />
    </div>
  );
};
