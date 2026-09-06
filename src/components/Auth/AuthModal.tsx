import React, { useState, useRef } from 'react';
import {
  Eye,
  EyeOff,
  Upload,
  Image as ImageIcon,
  FileCheck,
  X,
  AlertCircle,
  HelpCircle,
  Info,
  CheckCircle,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBackHandler } from '../../contexts/NativeBackContext';
import { useAppLogo, markLogoUrlAsFailed, officialLogoFallback } from '../../services/logoService';
import { uploadDriverLicenseToFirebaseStorage } from '../../services/firebaseStorageService';
import { verifyDriverLicenseImage, LicenseVerificationResult } from '../../services/licenseVerificationService';
import { FaqAboutModal } from '../Common/FaqAboutModal';
import {
  isValidEmail,
  getEmailValidationError,
  isValidPhoneNumber,
  getPhoneValidationError,
  formatPhoneNumber,
  isValidDriverLicense,
  getDriverLicenseValidationError,
  formatDriverLicense,
  isValidFullName,
  getFullNameValidationError,
  formatFullName,
  isValidPassword,
  getPasswordValidationError,
} from '../../utils/validation';
import scsLogo from '../../images/scs_logo.jpg';
import cctLogo from '../../images/cct_logo.jpg';

export const AuthModal: React.FC = () => {
  const { signIn, signInAdmin, signUpCustomer, signUpDriver, resetPassword } = useAuth();
  const { logoUrl: appLogo } = useAppLogo();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'admin_login'>('login');
  const [roleSelection, setRoleSelection] = useState<'customer' | 'driver'>('customer');

  // Discrete 5-tap gesture state for Admin Portal access
  const [logoTapCount, setLogoTapCount] = useState<number>(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogoTap = () => {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }

    const nextCount = logoTapCount + 1;

    if (nextCount >= 5) {
      setLogoTapCount(0);
      if (mode === 'admin_login') {
        setMode('login');
        setErrorMsg(null);
        setSuccessMsg(null);
      } else {
        setMode('admin_login');
        setErrorMsg(null);
        setSuccessMsg(null);
      }
    } else {
      setLogoTapCount(nextCount);
      tapTimerRef.current = setTimeout(() => {
        setLogoTapCount(0);
      }, 2500);
    }
  };

  // Handle native back button inside Auth views (returns to login)
  useBackHandler(
    mode !== 'login',
    () => {
      setMode('login');
      setErrorMsg(null);
      setSuccessMsg(null);
      return true;
    },
    15,
    'auth-mode'
  );

  // Form fields
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Driver Specific Fields
  const [driverLicenseCardUrl, setDriverLicenseCardUrl] = useState<string>('');
  const [driverLicenseNumber, setDriverLicenseNumber] = useState<string>('');
  const [licenseUploading, setLicenseUploading] = useState<boolean>(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [licenseVerification, setLicenseVerification] = useState<LicenseVerificationResult | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isFaqOpen, setIsFaqOpen] = useState<boolean>(false);

  const fullNameTrimmed = fullName.trim();
  const fullNameValidationError =
    mode === 'register' && fullNameTrimmed.length > 0 ? getFullNameValidationError(fullNameTrimmed) : null;
  const isFullNameValid = mode === 'register' && fullNameTrimmed.length > 0 && !fullNameValidationError;

  const isStrictEmailMode = mode === 'register' || mode === 'forgot';
  const trimmedEmail = email.trim();
  const shouldValidateEmailFormat = isStrictEmailMode || (trimmedEmail.length > 0 && trimmedEmail.includes('@'));
  const emailValidationError =
    trimmedEmail.length > 0 && shouldValidateEmailFormat ? getEmailValidationError(trimmedEmail) : null;
  const isEmailFormatValid = trimmedEmail.length > 0 && shouldValidateEmailFormat && !emailValidationError;

  const phoneValidationError =
    mode === 'register' && phone.trim().length > 0 ? getPhoneValidationError(phone) : null;
  const isPhoneValid = mode === 'register' && phone.trim().length > 0 && !phoneValidationError;

  const licenseValidationError =
    mode === 'register' && roleSelection === 'driver' && driverLicenseNumber.trim().length > 0
      ? getDriverLicenseValidationError(driverLicenseNumber)
      : null;
  const isLicenseValid =
    mode === 'register' &&
    roleSelection === 'driver' &&
    driverLicenseNumber.trim().length > 0 &&
    !licenseValidationError;

  const passwordValidationError =
    mode === 'register' && password.length > 0 ? getPasswordValidationError(password) : null;
  const isPasswordValid = mode === 'register' && password.length >= 6;

  // Handle Driver's License Picture File Selection & Upload to Firebase Storage with Open-Source OCR Pre-check
  const handleLicenseCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg("Invalid file format. Please upload a picture of your Driver's License (JPG, PNG, WEBP).");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg("Image size exceeds 8MB. Please select a smaller photo of your Driver's License.");
      return;
    }

    setLicenseUploading(true);
    setErrorMsg(null);
    setOcrProgress(5);
    setOcrStatus('Scanning license image...');

    try {
      // Run open-source OCR pre-check (Tesseract.js) and Firebase Storage upload in parallel
      const [verificationResult, uploadRes] = await Promise.all([
        verifyDriverLicenseImage(file, (status, progress) => {
          setOcrStatus(status);
          setOcrProgress(progress);
        }),
        uploadDriverLicenseToFirebaseStorage(file),
      ]);

      setLicenseVerification(verificationResult);

      if (uploadRes.success && uploadRes.url) {
        setDriverLicenseCardUrl(uploadRes.url);
        // Automatically suggest or fill detected legitimate LTO license number if input is currently empty
        if (verificationResult.detectedLicenseNumber && !driverLicenseNumber.trim()) {
          setDriverLicenseNumber(verificationResult.detectedLicenseNumber);
        }
      } else {
        setErrorMsg(uploadRes.error || "Failed to process Driver's License image.");
      }
    } catch (err: any) {
      console.error("License upload and OCR pre-check error:", err);
      setErrorMsg("Failed to process Driver's License image. Please try again.");
    } finally {
      setLicenseUploading(false);
      setOcrStatus('');
      setOcrProgress(0);
    }
  };

  // Translate Firebase error codes to readable messages
  const formatFirebaseError = (err: any): string => {
    if (err?.message?.includes('Access Denied')) {
      return err.message;
    }
    const code = err?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password. Please check your login credentials.';
      case 'auth/email-already-in-use':
        return 'An account with this email address already exists. Try signing in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/too-many-requests':
        return 'Too many failed login attempts. Please try again in a few minutes.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection.';
      default:
        return err?.message || 'Authentication failed. Please try again.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Strict email format validation
    if (isStrictEmailMode) {
      const emailErr = getEmailValidationError(trimmedEmail);
      if (emailErr) {
        setErrorMsg(emailErr);
        return;
      }
    } else if (trimmedEmail.includes('@')) {
      const emailErr = getEmailValidationError(trimmedEmail);
      if (emailErr) {
        setErrorMsg(`Invalid email format: ${emailErr}`);
        return;
      }
    }

    // Strict validation for registration
    if (mode === 'register') {
      const nameErr = getFullNameValidationError(fullName);
      if (nameErr) {
        setErrorMsg(nameErr);
        return;
      }

      const phoneErr = getPhoneValidationError(phone);
      if (phoneErr) {
        setErrorMsg(phoneErr);
        return;
      }

      const passErr = getPasswordValidationError(password);
      if (passErr) {
        setErrorMsg(passErr);
        return;
      }

      if (roleSelection === 'driver') {
        if (!driverLicenseNumber.trim()) {
          setErrorMsg("Official Driver's License Number is required for driver registration.");
          return;
        }
        const licenseErr = getDriverLicenseValidationError(driverLicenseNumber);
        if (licenseErr) {
          setErrorMsg(licenseErr);
          return;
        }
      }
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else if (mode === 'admin_login') {
        await signInAdmin(email, password);
      } else if (mode === 'register') {
        if (roleSelection === 'customer') {
          await signUpCustomer(fullName, email, phone, password);
        } else if (roleSelection === 'driver') {
          if (!driverLicenseCardUrl) {
            setErrorMsg("Driver's License card photo is required for driver registration and admin validation.");
            setLoading(false);
            return;
          }
          await signUpDriver(
            fullName,
            email,
            phone,
            password,
            'E-Shuttle Transit',
            'Unassigned E-Shuttle',
            driverLicenseCardUrl,
            driverLicenseNumber
          );
        }
      } else if (mode === 'forgot') {
        if (!email) {
          setErrorMsg('Please enter your account email address.');
          setLoading(false);
          return;
        }
        await resetPassword(email);
        setSuccessMsg(`Password reset link sent to ${email}. Check your email inbox!`);
      }
    } catch (err: any) {
      console.error('Firebase Auth error:', err);
      setErrorMsg(formatFirebaseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0D47A1]/25 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl my-auto text-[#0D47A1]">
        {/* Header Branding */}
        {mode === 'admin_login' ? (
          <div className="text-center space-y-2">
            <div className="relative inline-block cursor-pointer" onClick={handleLogoTap}>
              <img
                src={appLogo}
                onError={(e) => {
                  markLogoUrlAsFailed(appLogo);
                  (e.target as HTMLImageElement).src = officialLogoFallback;
                }}
                alt="E-Shuttle Official Logo"
                className="w-16 h-16 rounded-2xl object-cover shadow-lg border-2 border-[#0D47A1] mx-auto active:scale-90 transition-transform"
              />
              <span className="absolute -bottom-1 -right-1 bg-[#0D47A1] text-white text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider shadow">
                ADMIN
              </span>
            </div>
            <h2 className="text-xl font-black text-[#0D47A1]">Admin Portal</h2>
            <p className="text-xs text-slate-500 font-medium">E-Shuttle Operations & Control System</p>
          </div>
        ) : (
          <div className="text-center space-y-2">
            <div className="relative inline-block cursor-pointer" onClick={handleLogoTap}>
              <img
                src={appLogo}
                onError={(e) => {
                  markLogoUrlAsFailed(appLogo);
                  (e.target as HTMLImageElement).src = officialLogoFallback;
                }}
                alt="E-Shuttle Official Logo"
                className="w-16 h-16 rounded-2xl object-cover shadow-lg border-2 border-[#0D47A1] mx-auto active:scale-90 transition-transform"
              />
            </div>
            <h2 className="text-xl font-black text-[#0D47A1]">E-Shuttle</h2>
            <p className="text-xs text-slate-500 font-medium">Urban E-Shuttle Transit Service</p>
          </div>
        )}

        {/* Toggle Login vs Register (Hidden when in Forgot or Admin mode) */}
        {mode !== 'forgot' && mode !== 'admin_login' && (
          <div className="flex bg-[#E3F2FD] p-1 rounded-2xl border border-[#0D47A1]/40">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                mode === 'login'
                  ? 'bg-[#0D47A1] text-white shadow-md'
                  : 'text-[#0D47A1]/80 hover:text-[#0D47A1]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                mode === 'register'
                  ? 'bg-[#0D47A1] text-white shadow-md'
                  : 'text-[#0D47A1]/80 hover:text-[#0D47A1]'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Admin Banner Indicator */}
        {mode === 'admin_login' && (
          <div className="p-3 bg-[#E3F2FD] border border-[#0D47A1] rounded-2xl text-[#0D47A1] text-xs">
            <b className="text-[#0D47A1] block font-bold">Restricted Admin Access</b>
            System administrators only.
          </div>
        )}

        {/* Forgot Password Header Back Button */}
        {mode === 'forgot' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="px-2.5 py-1 text-xs text-white bg-[#0D47A1] hover:bg-[#1565C0] border border-[#0D47A1] rounded-xl transition-colors font-bold uppercase"
            >
              Back
            </button>
            <span className="text-sm font-bold text-[#0D47A1]">Reset Password</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs rounded-xl font-medium">
            {successMsg}
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-300 text-rose-700 text-xs rounded-xl text-center font-medium">
            {errorMsg}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <>
              {/* Role Selection */}
              <div className="grid grid-cols-2 gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => setRoleSelection('customer')}
                  title="Create an account to request E-Shuttle pick-ups"
                  className={`p-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                    roleSelection === 'customer'
                      ? 'bg-[#0D47A1] border-[#0D47A1] text-white shadow-sm'
                      : 'bg-white border-[#0D47A1] text-[#0D47A1] hover:bg-[#E3F2FD]/50'
                  }`}
                >
                  User Account
                </button>
                <button
                  type="button"
                  onClick={() => setRoleSelection('driver')}
                  title="Create a driver account to operate E-Shuttle vehicles"
                  className={`p-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                    roleSelection === 'driver'
                      ? 'bg-[#0D47A1] border-[#0D47A1] text-white shadow-sm'
                      : 'bg-white border-[#0D47A1] text-[#0D47A1] hover:bg-[#E3F2FD]/50'
                  }`}
                >
                  E-Shuttle Driver
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-[#0D47A1]">Full Name</label>
                  {isFullNameValid && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Valid name
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maria Santos"
                  value={fullName}
                  onChange={(e) => setFullName(formatFullName(e.target.value))}
                  className={`w-full mt-1 bg-[#F8FAFC] border-2 rounded-xl p-2.5 text-xs placeholder-slate-400 focus:outline-none transition-colors ${
                    fullNameValidationError
                      ? 'border-rose-400 focus:border-rose-500 bg-rose-50/20 text-rose-900'
                      : isFullNameValid
                      ? 'border-emerald-500 focus:border-emerald-600 focus:bg-white text-[#0D47A1]'
                      : 'border-[#0D47A1] focus:border-[#1565C0] focus:bg-white text-[#0D47A1]'
                  }`}
                />
                {fullNameValidationError && (
                  <p className="text-[10px] text-rose-600 mt-1 flex items-start gap-1 font-semibold leading-tight">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{fullNameValidationError}</span>
                  </p>
                )}
                {!fullName.trim() && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Letters and spaces only (e.g. Maria Santos). Numbers and symbols are prohibited.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-[#0D47A1]">Mobile Phone Number</label>
                  {isPhoneValid && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Valid phone
                    </span>
                  )}
                </div>
                <input
                  type="tel"
                  required
                  placeholder="0917 123 4567 or +63 917 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                  className={`w-full mt-1 bg-[#F8FAFC] border-2 rounded-xl p-2.5 text-xs placeholder-slate-400 focus:outline-none transition-colors ${
                    phoneValidationError
                      ? 'border-rose-400 focus:border-rose-500 bg-rose-50/20 text-rose-900'
                      : isPhoneValid
                      ? 'border-emerald-500 focus:border-emerald-600 focus:bg-white text-[#0D47A1]'
                      : 'border-[#0D47A1] focus:border-[#1565C0] focus:bg-white text-[#0D47A1]'
                  }`}
                />
                {phoneValidationError && (
                  <p className="text-[10px] text-rose-600 mt-1 flex items-start gap-1 font-semibold leading-tight">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{phoneValidationError}</span>
                  </p>
                )}
                {!phone.trim() && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Numbers only (e.g., 0917 123 4567). Alphabets are not allowed.
                  </p>
                )}
              </div>

              {roleSelection === 'driver' && (
                <div className="space-y-3 pt-1 border-t border-[#0D47A1]/20">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-extrabold text-[#0D47A1] flex items-center gap-1">
                        <span>Official LTO License Number</span>
                        <span className="text-rose-600 font-bold text-xs">*Required</span>
                      </label>
                      {isLicenseValid && (
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Valid LTO format
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="LTO Format: N01-23-456789"
                      maxLength={13}
                      value={driverLicenseNumber}
                      onChange={(e) => setDriverLicenseNumber(formatDriverLicense(e.target.value))}
                      className={`w-full bg-[#F8FAFC] border-2 rounded-xl p-2.5 text-xs font-mono placeholder-slate-400 focus:outline-none transition-colors ${
                        licenseValidationError
                          ? 'border-rose-400 focus:border-rose-500 bg-rose-50/20 text-rose-900'
                          : isLicenseValid
                          ? 'border-emerald-500 focus:border-emerald-600 focus:bg-white text-[#0D47A1]'
                          : 'border-[#0D47A1] focus:border-[#1565C0] focus:bg-white text-[#0D47A1]'
                      }`}
                    />
                    {licenseValidationError && (
                      <p className="text-[10px] text-rose-600 mt-1 flex items-start gap-1 font-semibold leading-tight">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>{licenseValidationError}</span>
                      </p>
                    )}
                    {!driverLicenseNumber.trim() && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Legitimate LTO format: Letter + 2 digits - 2 digits - 6 digits (e.g. N01-23-456789)
                      </p>
                    )}
                  </div>

                  <div className="pt-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-extrabold text-[#0D47A1] flex items-center gap-1">
                        <span>Driver's License Card Picture</span>
                        <span className="text-rose-600 font-bold text-xs">*Required</span>
                      </label>
                      <span className="text-[9px] text-[#0D47A1]/80 bg-[#E3F2FD] px-2 py-0.5 rounded-full font-bold">
                        Admin Validation
                      </span>
                    </div>

                    {driverLicenseCardUrl ? (
                      <div className="relative bg-[#F8FAFC] border-2 border-emerald-500 rounded-2xl p-2.5 shadow-sm space-y-2">
                        <div className="flex items-center justify-between text-xs text-emerald-800 font-bold">
                          <span className="flex items-center gap-1.5">
                            <FileCheck className="w-4 h-4 text-emerald-600" />
                            <span>Driver's License Card Uploaded</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setDriverLicenseCardUrl('');
                              setLicenseVerification(null);
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors"
                            title="Remove photo and upload a different one"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="relative w-full h-36 bg-slate-100 rounded-xl overflow-hidden border border-slate-300">
                          <img
                            src={driverLicenseCardUrl}
                            alt="Uploaded Driver's License Card"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-1 right-1 bg-black/75 text-white text-[9px] font-bold px-2 py-0.5 rounded-md">
                            Preview
                          </div>
                        </div>

                        {/* Open-Source OCR Pre-check Result Display */}
                        {licenseVerification && (
                          licenseVerification.isOfficialLTO ? (
                            <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl space-y-1.5 text-emerald-900 text-xs">
                              <div className="flex items-center gap-1.5 font-extrabold text-emerald-700">
                                <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                <span>Official Philippine LTO License Verified</span>
                                <span className="ml-auto text-[10px] bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded-full font-bold">
                                  {licenseVerification.confidence}% Confidence
                                </span>
                              </div>

                              {licenseVerification.detectedLicenseNumber && (
                                <div className="flex items-center justify-between text-[11px] bg-white/90 p-1.5 rounded-lg border border-emerald-200 font-mono">
                                  <span className="text-emerald-800">Detected on Card:</span>
                                  <span className="font-extrabold text-emerald-950">{licenseVerification.detectedLicenseNumber}</span>
                                  {driverLicenseNumber !== licenseVerification.detectedLicenseNumber && (
                                    <button
                                      type="button"
                                      onClick={() => setDriverLicenseNumber(licenseVerification.detectedLicenseNumber!)}
                                      className="text-[10px] text-[#0D47A1] underline font-bold ml-1 hover:text-[#1565C0]"
                                      title="Auto-fill with detected license number"
                                    >
                                      Use detected number
                                    </button>
                                  )}
                                </div>
                              )}

                              <div className="text-[10px] text-emerald-700 flex flex-wrap gap-1 items-center pt-0.5">
                                <span className="font-semibold">Detected Security Markers:</span>
                                {licenseVerification.matchedKeywords.slice(0, 4).map((kw) => (
                                  <span key={kw} className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                    ✓ {kw}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl space-y-1 text-amber-900 text-xs">
                              <div className="flex items-start gap-1.5 font-bold text-amber-800">
                                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div className="space-y-0.5">
                                  <p className="font-extrabold">Automated Pre-Check Notice</p>
                                  <p className="text-[10px] font-normal leading-relaxed text-amber-900">
                                    {licenseVerification.feedbackMessage}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    ) : licenseUploading ? (
                      <div className="p-4 bg-[#F8FAFC] border-2 border-dashed border-[#0D47A1] rounded-2xl flex flex-col items-center justify-center space-y-2">
                        <div className="w-10 h-10 bg-[#E3F2FD] border border-[#0D47A1] text-[#0D47A1] rounded-2xl flex items-center justify-center shadow-sm">
                          <Sparkles className="w-5 h-5 animate-spin text-[#0D47A1]" />
                        </div>
                        <div className="text-center">
                          <span className="text-xs font-black text-[#0D47A1] block">
                            Verifying Official LTO License Card...
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {ocrStatus || 'Scanning card layout and text...'} ({ocrProgress}%)
                          </span>
                        </div>
                        <div className="w-full max-w-xs bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[#0D47A1] h-full transition-all duration-300 ease-out"
                            style={{ width: `${Math.max(5, ocrProgress)}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">
                          Open-source OCR pre-check running client-side
                        </span>
                      </div>
                    ) : (
                      <label className="relative flex flex-col items-center justify-center p-4 bg-[#F8FAFC] hover:bg-[#E3F2FD]/50 border-2 border-dashed border-[#0D47A1] rounded-2xl cursor-pointer transition-all active:scale-[0.99]">
                        <input
                          type="file"
                          accept="image/*"
                          required
                          disabled={licenseUploading}
                          onChange={handleLicenseCardUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <div className="w-10 h-10 bg-[#E3F2FD] border border-[#0D47A1] text-[#0D47A1] rounded-2xl flex items-center justify-center mb-2 shadow-sm">
                          <Upload className="w-5 h-5 text-[#0D47A1]" />
                        </div>
                        <span className="text-xs font-black text-[#0D47A1]">
                          Upload Driver's License Card Photo
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5 text-center font-medium">
                          Take a clear picture or upload image of your official Driver's License (LTO pre-check enabled)
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-[#0D47A1]">
                {mode === 'admin_login'
                  ? 'Admin Username or Email'
                  : mode === 'register'
                  ? 'Email Address'
                  : mode === 'forgot'
                  ? 'Account Email Address'
                  : 'Email or Username'}
              </label>
              {isEmailFormatValid && (
                <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Valid email
                </span>
              )}
            </div>
            <input
              type={mode === 'register' || mode === 'forgot' ? 'email' : 'text'}
              required
              placeholder={
                mode === 'admin_login'
                  ? 'admin or admin@eshuttle.com'
                  : mode === 'register'
                  ? 'e.g., name@example.com'
                  : mode === 'forgot'
                  ? 'name@example.com'
                  : 'username or user@example.com'
              }
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full mt-1 bg-[#F8FAFC] border-2 rounded-xl p-2.5 text-xs placeholder-slate-400 focus:outline-none transition-colors ${
                emailValidationError
                  ? 'border-rose-400 focus:border-rose-500 bg-rose-50/20 text-rose-900'
                  : isEmailFormatValid
                  ? 'border-emerald-500 focus:border-emerald-600 focus:bg-white text-[#0D47A1]'
                  : 'border-[#0D47A1] focus:border-[#1565C0] focus:bg-white text-[#0D47A1]'
              }`}
            />
            {emailValidationError && (
              <p className="text-[10px] text-rose-600 mt-1 flex items-start gap-1 font-semibold leading-tight">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{emailValidationError}</span>
              </p>
            )}
            {isStrictEmailMode && !email.trim() && (
              <p className="text-[10px] text-slate-400 mt-1">
                Must be a valid email format with domain and extension (e.g., user@domain.com)
              </p>
            )}
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-[#0D47A1]">Password</label>
                {mode === 'register' && isPasswordValid && (
                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Valid password
                  </span>
                )}
                {(mode === 'login' || mode === 'admin_login') && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className="text-[11px] text-[#0D47A1] hover:underline font-bold"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full bg-[#F8FAFC] border-2 rounded-xl p-2.5 pr-10 text-xs placeholder-slate-400 focus:outline-none transition-colors ${
                    passwordValidationError
                      ? 'border-rose-400 focus:border-rose-500 bg-rose-50/20 text-rose-900'
                      : mode === 'register' && isPasswordValid
                      ? 'border-emerald-500 focus:border-emerald-600 focus:bg-white text-[#0D47A1]'
                      : 'border-[#0D47A1] focus:border-[#1565C0] focus:bg-white text-[#0D47A1]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#0D47A1] hover:text-[#1565C0] p-1 rounded-lg transition-colors focus:outline-none"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {passwordValidationError && (
                <p className="text-[10px] text-rose-600 mt-1 flex items-start gap-1 font-semibold leading-tight">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{passwordValidationError}</span>
                </p>
              )}
              {mode === 'register' && !password && (
                <p className="text-[10px] text-slate-400 mt-1">
                  At least 6 characters required.
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            title={
              mode === 'admin_login'
                ? 'Sign in as system administrator'
                : mode === 'login'
                ? 'Sign into your account'
                : mode === 'register'
                ? 'Create a new account'
                : 'Send password reset link'
            }
            className="w-full py-3.5 text-white font-black text-xs rounded-2xl shadow-lg transition-all active:scale-95 mt-2 disabled:opacity-50 bg-[#0D47A1] hover:bg-[#1565C0] shadow-blue-900/25 uppercase tracking-wider"
          >
            {loading
              ? 'Verifying...'
              : mode === 'admin_login'
              ? 'Sign In (Admin)'
              : mode === 'login'
              ? 'Sign In'
              : mode === 'register'
              ? `Register ${roleSelection === 'customer' ? 'User' : 'Driver'}`
              : 'Reset Password'}
          </button>
        </form>

        {/* Return link when in Admin mode */}
        {mode === 'admin_login' && (
          <div className="border-t border-[#0D47A1]/40 pt-3 text-center">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              title="Return to user and driver login portal"
              className="text-xs text-[#0D47A1] hover:underline font-bold transition-colors"
            >
              Back to User / Driver Login
            </button>
          </div>
        )}

        {/* FAQs & About Us Quick Access Banner */}
        <div className="pt-2 border-t border-[#0D47A1]/30">
          <button
            type="button"
            onClick={() => setIsFaqOpen(true)}
            className="w-full py-2 px-3 bg-[#E3F2FD] hover:bg-[#90CAF9]/50 text-[#0D47A1] border border-[#0D47A1] rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <HelpCircle className="w-4 h-4 text-[#0D47A1]" />
            <span>FAQs, Routes & About Developers</span>
            <span className="bg-amber-400 text-[#0D47A1] text-[9px] px-1.5 py-0.5 rounded-full font-black">
              100% FREE
            </span>
          </button>
        </div>

        {/* Partner / Institutional Accreditation Footer */}
        <div className="pt-2 border-t border-[#0D47A1]/30 flex items-center justify-center gap-4 opacity-85 hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold">
            <img
              src={cctLogo}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/cct_logo.jpg';
              }}
              alt="CCT Logo"
              className="w-6 h-6 rounded-full object-cover border border-[#0D47A1]"
            />
            <span>CCT</span>
          </div>
          <div className="w-1 h-1 bg-[#0D47A1] rounded-full" />
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold">
            <img
              src={scsLogo}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/scs_logo.jpg';
              }}
              alt="SCS Logo"
              className="w-6 h-6 rounded-full object-cover border border-[#0D47A1]"
            />
            <span>SCS</span>
          </div>
        </div>
      </div>

      <FaqAboutModal isOpen={isFaqOpen} onClose={() => setIsFaqOpen(false)} />
    </div>
  );
};
