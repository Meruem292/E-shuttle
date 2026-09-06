import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  updateDoc,
  setDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, db } from '../../firebase/config';
import { useAuth, sanitizeFirestoreData } from '../../contexts/AuthContext';
import { AdminSettings, DriverProfile, UserProfile, Booking } from '../../types';
import { DEFAULT_FARE_SETTINGS } from '../../constants/fare';
import { EBikeManagement } from './EBikeManagement';
import { AdminEBikeMap } from './AdminEBikeMap';
import { StationManagement } from './StationManagement';
import { ZoneManagement } from './ZoneManagement';
import { ActivityLogsView } from './ActivityLogsView';
import { AdminTutorialModal } from './AdminTutorialModal';
import { listenToOperationalZones } from '../../services/zoneService';
import { OperationalZone } from '../../types';
import { pairDriverRfidCard, subscribeToAdminRegistrationRfid } from '../../services/ebikeService';
import { useBackHandler } from '../../contexts/NativeBackContext';
import officialLogo from '../../images/official_logo.jpg';
import { sanitizeVehicleInfo } from '../../utils/sanitizeVehicle';
import { isValidEmail, getEmailValidationError } from '../../utils/validation';
import { ChatDrawer } from '../Common/ChatDrawer';
import { FaqAboutModal } from '../Common/FaqAboutModal';
import {
  IncidentTicket,
  subscribeToTickets,
  updateTicketStatus,
  INCIDENT_CATEGORIES,
} from '../../services/ticketService';
import {
  subscribeToUserChannels,
  ChatChannel,
} from '../../services/chatService';
import { logActivity } from '../../services/activityLogService';
import {
  LogOut,
  HelpCircle,
  CheckCircle,
  AlertCircle,
  XCircle,
  Ban,
  Save,
  Users,
  User,
  Route,
  Cpu,
  CreditCard,
  Search,
  MapPin,
  Eye,
  ChevronRight,
  UserCheck,
  Settings,
  Layers,
  LayoutDashboard,
  Landmark,
  ShieldAlert,
  AlertTriangle,
  MessageSquare,
  Headphones,
  Upload,
  Image as ImageIcon,
  Database,
  Key,
  Trash2,
  EyeOff,
  ExternalLink,
  FileCode,
  CheckCircle2,
  Globe,
  Lock,
  ShieldCheck,
  UserCog,
  BookOpen,
  Sparkles,
  GraduationCap,
  Plus,
} from 'lucide-react';
import { useAppLogo, markLogoUrlAsFailed, officialLogoFallback } from '../../services/logoService';
import { uploadLogoToFirebaseStorage, convertFileToBase64 } from '../../services/firebaseStorageService';

interface AdminDashboardProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const { role, logout, currentUser, userProfile, refreshProfile } = useAuth();

  // Admin Profile State
  const [profileFullName, setProfileFullName] = useState<string>('');
  const [profileEmail, setProfileEmail] = useState<string>('');
  const [profileUsername, setProfileUsername] = useState<string>('');
  const [profilePhone, setProfilePhone] = useState<string>('');
  const [profileSaving, setProfileSaving] = useState<boolean>(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync profile state when userProfile loads or changes
  useEffect(() => {
    if (userProfile) {
      setProfileFullName(userProfile.fullName || 'Platform Administrator');
      setProfileEmail(userProfile.email || currentUser?.email || 'admin@eshuttle.com');
      setProfileUsername(userProfile.username || 'admin');
      setProfilePhone(userProfile.phone || '+63 917 000 0000');
    } else if (currentUser) {
      setProfileEmail(currentUser.email || 'admin@eshuttle.com');
      setProfileUsername('admin');
    }
  }, [userProfile, currentUser]);

  const handleSaveAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setProfileSaving(true);
    setProfileMsg(null);

    try {
      const cleanUsername = profileUsername.trim().toLowerCase() || 'admin';
      const cleanFullName = profileFullName.trim() || 'Platform Administrator';
      const cleanPhone = profilePhone.trim();

      const userDocRef = doc(db, 'users', currentUser.uid);
      const updatedData = {
        fullName: cleanFullName,
        username: cleanUsername,
        phone: cleanPhone,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(userDocRef, updatedData);
      if (refreshProfile) await refreshProfile();

      logActivity({
        action: 'UPDATE',
        actionLabel: 'Updated Admin Profile',
        entityType: 'ADMIN',
        entityId: currentUser.uid,
        entityName: cleanFullName,
        summary: `Administrator profile updated (Username: @${cleanUsername}, Name: "${cleanFullName}")`,
        details: {
          summary: 'Platform administrator profile modified in database',
          before: {
            fullName: userProfile?.fullName,
            username: userProfile?.username,
            phone: userProfile?.phone,
          },
          after: {
            fullName: cleanFullName,
            username: cleanUsername,
            phone: cleanPhone,
          },
        },
        performedBy: {
          uid: currentUser.uid,
          name: cleanFullName,
          email: currentUser.email || undefined,
          role: 'admin',
        },
        severity: 'info',
      }).catch(() => {});

      setProfileMsg({
        type: 'success',
        text: `Admin profile updated! You can now log in using username: ${cleanUsername}`,
      });
    } catch (err: any) {
      console.error('Failed to update admin profile:', err);
      setProfileMsg({ type: 'error', text: err?.message || 'Failed to update admin profile.' });
    } finally {
      setProfileSaving(false);
    }
  };

  // Change Password State
  const [currentPass, setCurrentPass] = useState<string>('');
  const [newPass, setNewPass] = useState<string>('');
  const [confirmPass, setConfirmPass] = useState<string>('');
  const [showCurrentPass, setShowCurrentPass] = useState<boolean>(false);
  const [showNewPass, setShowNewPass] = useState<boolean>(false);
  const [passChanging, setPassChanging] = useState<boolean>(false);
  const [passMsg, setPassMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.email) return;

    if (newPass.length < 6) {
      setPassMsg({ type: 'error', text: 'New password must be at least 6 characters long.' });
      return;
    }

    if (newPass !== confirmPass) {
      setPassMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setPassChanging(true);
    setPassMsg(null);

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPass);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPass);

      logActivity({
        action: 'UPDATE',
        actionLabel: 'Changed Admin Password',
        entityType: 'ADMIN',
        entityId: currentUser.uid,
        entityName: userProfile?.fullName || currentUser.email || 'Admin',
        summary: `Administrator "${currentUser.email}" successfully updated account password`,
        details: {
          summary: 'Security credentials modified for administrator account',
        },
        performedBy: {
          uid: currentUser.uid,
          name: userProfile?.fullName || 'Platform Administrator',
          email: currentUser.email,
          role: 'admin',
        },
        severity: 'warning',
      }).catch(() => {});

      setPassMsg({ type: 'success', text: 'Admin password changed successfully!' });
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (err: any) {
      console.error('Change password failed:', err);
      let errorText = 'Failed to change password.';
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        errorText = 'Current password is incorrect. Please verify and try again.';
      } else if (err?.code === 'auth/requires-recent-login') {
        errorText = 'Session expired. Please log out and sign in again to update password.';
      } else if (err?.message) {
        errorText = err.message;
      }
      setPassMsg({ type: 'error', text: errorText });
    } finally {
      setPassChanging(false);
    }
  };

  if (role !== 'admin') {
    return (
      <div className="h-full w-full bg-[#E3F2FD] flex flex-col items-center justify-center p-6 text-center space-y-3">
        <div className="w-12 h-12 bg-rose-50 border-2 border-rose-500 rounded-full flex items-center justify-center text-rose-600 font-black text-xs uppercase">
          DENIED
        </div>
        <h2 className="text-lg font-black text-[#0D47A1]">Access Restricted</h2>
        <p className="text-xs text-slate-600 max-w-sm font-medium">
          You do not have administrative privileges to view this portal.
        </p>
        <button
          onClick={logout}
          aria-label="Log Out Account"
          className="px-4 py-2 bg-[#2196F3] hover:bg-[#1E88E5] text-xs font-black text-white rounded-xl uppercase tracking-wider"
        >
          Return to Sign In
        </button>
      </div>
    );
  }

  // State
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [zones, setZones] = useState<OperationalZone[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Settings state
  const [fareSettings, setFareSettings] = useState<AdminSettings>(DEFAULT_FARE_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState<boolean>(false);
  const [settingsSuccess, setSettingsSuccess] = useState<boolean>(false);

  // Logo & Firebase Storage Upload State
  const { logoUrl: activeAppLogo, isCustomLogo } = useAppLogo();
  const [logoUploading, setLogoUploading] = useState<boolean>(false);
  const [logoSuccessMsg, setLogoSuccessMsg] = useState<string | null>(null);
  const [logoErrorMsg, setLogoErrorMsg] = useState<string | null>(null);

  // Handle Logo Image Upload (Firebase Storage with Base64 fallback)
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);
    setLogoSuccessMsg(null);
    setLogoErrorMsg(null);

    try {
      const res = await uploadLogoToFirebaseStorage(file);
      let finalLogoUrl = '';

      if (res.success && res.url) {
        finalLogoUrl = res.url;
        if (res.storageType === 'firebase') {
          setLogoSuccessMsg('Logo uploaded successfully to Firebase Storage!');
        } else {
          setLogoSuccessMsg('Logo uploaded and saved successfully!');
        }
      } else {
        setLogoErrorMsg(res.error || 'Failed to upload logo image.');
        return;
      }

      const updatedSettings = {
        ...fareSettings,
        appLogoUrl: finalLogoUrl,
        updatedAt: serverTimestamp(),
      };

      setFareSettings(updatedSettings);

      // Instantly persist to Firestore
      await setDoc(doc(db, 'adminSettings', 'default'), updatedSettings);

      logActivity({
        action: 'SETTINGS_UPDATE',
        actionLabel: 'Updated Application Logo',
        entityType: 'SETTINGS',
        entityId: 'default',
        entityName: 'App Branding Logo',
        summary: 'Administrator uploaded and configured new application branding logo',
        details: {
          summary: 'Application branding logo URL updated in system settings',
          after: { appLogoUrl: finalLogoUrl },
        },
        performedBy: {
          uid: currentUser?.uid || 'admin',
          name: userProfile?.fullName || 'Platform Administrator',
          email: currentUser?.email || undefined,
          role: 'admin',
        },
        severity: 'info',
      }).catch(() => {});
    } catch (err: any) {
      console.error('Error uploading logo:', err);
      setLogoErrorMsg(err?.message || 'Failed to process image file.');
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  // Reset Logo back to Default
  const handleResetLogo = async () => {
    if (!window.confirm('Reset app logo back to default official logo?')) return;
    setLogoUploading(true);
    setLogoErrorMsg(null);
    try {
      const updatedSettings = {
        ...fareSettings,
        appLogoUrl: '',
        updatedAt: serverTimestamp(),
      };
      setFareSettings(updatedSettings);
      await setDoc(doc(db, 'adminSettings', 'default'), updatedSettings);

      logActivity({
        action: 'SETTINGS_UPDATE',
        actionLabel: 'Reset Application Logo',
        entityType: 'SETTINGS',
        entityId: 'default',
        entityName: 'App Branding Logo',
        summary: 'Administrator restored application branding logo to default official asset',
        details: {
          summary: 'Application branding logo reset to default system asset',
        },
        performedBy: {
          uid: currentUser?.uid || 'admin',
          name: userProfile?.fullName || 'Platform Administrator',
          email: currentUser?.email || undefined,
          role: 'admin',
        },
        severity: 'info',
      }).catch(() => {});

      setLogoSuccessMsg('Logo reset to default official logo.');
      setTimeout(() => setLogoSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Failed to reset logo:', err);
      setLogoErrorMsg('Failed to reset logo.');
    } finally {
      setLogoUploading(false);
    }
  };

  // RFID Pairing Modal State
  const [rfidModalDriver, setRfidModalDriver] = useState<DriverProfile | null>(null);
  const [modalRfidInput, setModalRfidInput] = useState('');
  const [modalPairing, setModalPairing] = useState(false);
  const [modalSuccessMsg, setModalSuccessMsg] = useState('');
  const [targetRfidDriverId, setTargetRfidDriverId] = useState<string | null>(null);
  const [ebikeSubTab, setEbikeSubTab] = useState<'shuttles' | 'rfid' | 'simulator' | 'esp32_code'>('shuttles');
  const [latestScannedRfid, setLatestScannedRfid] = useState<{ rfidUid: string; scannedAt?: string } | null>(null);

  // Detail View Modals
  const [selectedCustomer, setSelectedCustomer] = useState<UserProfile | null>(null);
  const [selectedDriverModal, setSelectedDriverModal] = useState<DriverProfile | null>(null);
  const [selectedBookingModal, setSelectedBookingModal] = useState<Booking | null>(null);
  const [licensePreviewUrl, setLicensePreviewUrl] = useState<string | null>(null);

  // Incident Tickets & Support Channels State
  const [supportChannels, setSupportChannels] = useState<ChatChannel[]>([]);
  const [incidentTickets, setIncidentTickets] = useState<IncidentTicket[]>([]);
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('ALL');
  const [selectedTicketChannelId, setSelectedTicketChannelId] = useState<string | null>(null);
  const [directChatTarget, setDirectChatTarget] = useState<{ id: string; name: string; role: 'customer' | 'driver' | 'admin' } | null>(null);
  const [isFaqOpen, setIsFaqOpen] = useState<boolean>(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(false);
  const [tutorialInitialStep, setTutorialInitialStep] = useState<number>(0);
  const [isTutorialBannerDismissed, setIsTutorialBannerDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('admin_tutorial_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  // Native Back Button Handlers for Admin Modals
  useBackHandler(
    rfidModalDriver !== null,
    () => {
      setRfidModalDriver(null);
      setModalRfidInput('');
      setModalSuccessMsg('');
      return true;
    },
    25,
    'admin-rfid-modal'
  );

  useBackHandler(
    selectedBookingModal !== null,
    () => {
      setSelectedBookingModal(null);
      return true;
    },
    20,
    'admin-booking-modal'
  );

  useBackHandler(
    licensePreviewUrl !== null,
    () => {
      setLicensePreviewUrl(null);
      return true;
    },
    30,
    'admin-license-preview-modal'
  );

  useBackHandler(
    selectedDriverModal !== null,
    () => {
      setSelectedDriverModal(null);
      return true;
    },
    20,
    'admin-driver-modal'
  );

  useBackHandler(
    selectedCustomer !== null,
    () => {
      setSelectedCustomer(null);
      return true;
    },
    20,
    'admin-customer-modal'
  );

  useBackHandler(
    ebikeSubTab !== 'shuttles',
    () => {
      setEbikeSubTab('shuttles');
      return true;
    },
    15,
    'admin-ebike-subtab'
  );

  // Filters & Search
  const [userTabRole, setUserTabRole] = useState<'ALL' | 'CUSTOMERS' | 'DRIVERS' | 'PENDING' | 'ADMINS'>('ALL');
  const [accountSearch, setAccountSearch] = useState('');
  const [accountStatusFilter, setAccountStatusFilter] = useState<string>('ALL');
  const [rideStatusFilter, setRideStatusFilter] = useState<string>('ALL');
  const [rideSearch, setRideSearch] = useState('');

  // Account CRUD Management State (Passenger, Driver)
  const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
  const [createRole, setCreateRole] = useState<'customer' | 'driver'>('customer');
  const [createFullName, setCreateFullName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [createVehicleInfo, setCreateVehicleInfo] = useState('');
  const [createZoneId, setCreateZoneId] = useState('');
  const [createLicenseNumber, setCreateLicenseNumber] = useState('');
  const [createRfidUid, setCreateRfidUid] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Account Deletion State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    id: string;
    name: string;
    role: 'customer' | 'driver' | 'admin';
    email?: string;
  } | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Back handlers for CRUD modals
  useBackHandler(
    showCreateAccountModal,
    () => {
      setShowCreateAccountModal(false);
      setCreateError(null);
      return true;
    },
    22,
    'admin-create-account-modal'
  );

  useBackHandler(
    deleteConfirmTarget !== null,
    () => {
      setDeleteConfirmTarget(null);
      return true;
    },
    24,
    'admin-delete-account-modal'
  );

  // Handler: Delete Account with Audit Logging
  const handleDeleteAccount = async () => {
    if (!deleteConfirmTarget) return;
    setDeletingAccount(true);
    const { id, name, role: targetRole, email } = deleteConfirmTarget;

    try {
      if (targetRole === 'driver') {
        await deleteDoc(doc(db, 'drivers', id));
      } else {
        await deleteDoc(doc(db, 'users', id));
      }

      if (selectedCustomer?.uid === id) setSelectedCustomer(null);
      if (selectedDriverModal?.uid === id) setSelectedDriverModal(null);

      logActivity({
        action: 'DELETE',
        actionLabel: `Deleted ${targetRole.toUpperCase()} Account`,
        entityType: targetRole === 'driver' ? 'DRIVER' : targetRole === 'admin' ? 'ADMIN' : 'USER',
        entityId: id,
        entityName: name,
        summary: `Administrator permanently deleted ${targetRole} account "${name}" (${email || id})`,
        details: {
          summary: `Account purged from database records by administrator`,
          metadata: { id, name, role: targetRole, email },
        },
        performedBy: {
          uid: currentUser?.uid || 'admin',
          name: userProfile?.fullName || 'Platform Administrator',
          email: currentUser?.email || undefined,
          role: 'admin',
        },
        severity: 'danger',
      }).catch(() => {});

      setDeleteConfirmTarget(null);
    } catch (err: any) {
      console.error('Failed to delete account:', err);
      alert('Failed to delete account: ' + (err?.message || 'Error occurred'));
    } finally {
      setDeletingAccount(false);
    }
  };

  // Handler: Create Account with Audit Logging
  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFullName.trim() || !createEmail.trim()) {
      setCreateError('Full name and email are required.');
      return;
    }

    const emailFormatErr = getEmailValidationError(createEmail.trim());
    if (emailFormatErr) {
      setCreateError(emailFormatErr);
      return;
    }

    setCreatingAccount(true);
    setCreateError(null);

    try {
      const newUid = 'acc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      if (createRole === 'driver') {
        const selectedZone = zones.find((z) => z.id === createZoneId);
        const driverDoc: DriverProfile = {
          uid: newUid,
          fullName: createFullName.trim(),
          email: createEmail.trim().toLowerCase(),
          phone: createPhone.trim() || '+63 900 000 0000',
          role: 'driver',
          accountStatus: 'APPROVED',
          availability: 'OFFLINE',
          vehicleType: 'E-Shuttle',
          vehicleInfo: createVehicleInfo.trim() || 'Official City E-Shuttle',
          driverLicenseNumber: createLicenseNumber.trim() || 'DL-' + Math.floor(100000 + Math.random() * 900000),
          zoneId: createZoneId || null,
          zoneName: selectedZone?.name || null,
          rfidCardUid: createRfidUid.trim().toUpperCase() || null,
          rating: 5.0,
          totalRides: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'drivers', newUid), sanitizeFirestoreData(driverDoc));

        logActivity({
          action: 'CREATE',
          actionLabel: 'Created Driver Account',
          entityType: 'DRIVER',
          entityId: newUid,
          entityName: createFullName.trim(),
          summary: `Administrator provisioned new driver account for "${createFullName.trim()}" (${createEmail.trim()})`,
          details: {
            summary: 'Driver created via admin console with approved status',
            after: {
              fullName: createFullName.trim(),
              email: createEmail.trim(),
              phone: createPhone.trim(),
              zone: selectedZone?.name || 'All Zones',
              rfidCardUid: createRfidUid.trim().toUpperCase() || null,
            },
          },
          performedBy: {
            uid: currentUser?.uid || 'admin',
            name: userProfile?.fullName || 'Platform Administrator',
            email: currentUser?.email || undefined,
            role: 'admin',
          },
          severity: 'success',
        }).catch(() => {});
      } else {
        const userDoc: UserProfile = {
          uid: newUid,
          fullName: createFullName.trim(),
          email: createEmail.trim().toLowerCase(),
          phone: createPhone.trim() || '+63 900 000 0000',
          role: 'customer',
          accountStatus: 'APPROVED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'users', newUid), userDoc);

        logActivity({
          action: 'CREATE',
          actionLabel: 'Created Passenger Account',
          entityType: 'USER',
          entityId: newUid,
          entityName: createFullName.trim(),
          summary: `Administrator manually created passenger account for "${createFullName.trim()}" (${createEmail.trim()})`,
          details: {
            summary: 'Passenger account registered via admin dashboard',
            after: {
              fullName: createFullName.trim(),
              email: createEmail.trim(),
              phone: createPhone.trim(),
              role: 'customer',
            },
          },
          performedBy: {
            uid: currentUser?.uid || 'admin',
            name: userProfile?.fullName || 'Platform Administrator',
            email: currentUser?.email || undefined,
            role: 'admin',
          },
          severity: 'success',
        }).catch(() => {});
      }

      // Reset form and close
      setShowCreateAccountModal(false);
      setCreateFullName('');
      setCreateEmail('');
      setCreatePhone('');
      setCreateUsername('');
      setCreateVehicleInfo('');
      setCreateZoneId('');
      setCreateLicenseNumber('');
      setCreateRfidUid('');
    } catch (err: any) {
      console.error('Failed to create account:', err);
      setCreateError(err?.message || 'Failed to create account.');
    } finally {
      setCreatingAccount(false);
    }
  };

  // Subscribe to live scanned RFID tags
  useEffect(() => {
    const unsubRfid = subscribeToAdminRegistrationRfid((data) => {
      if (data) {
        setLatestScannedRfid(data);
        setModalRfidInput(data.rfidUid); // AUTO-FILL live scanned RFID tag on pairing
      }
    });
    return () => unsubRfid();
  }, []);

  // Sync activeTab prop with userTabRole sub-tab filter
  useEffect(() => {
    if (activeTab === 'customers') {
      setUserTabRole('CUSTOMERS');
    } else if (activeTab === 'drivers') {
      setUserTabRole('DRIVERS');
    }
  }, [activeTab]);

  // Load Admin Data (Customers, Drivers, Bookings, Settings)
  useEffect(() => {
    if (!currentUser) return;

    // 1. Subscribe to Customers (users collection where role != 'driver')
    const unsubCustomers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data.role !== 'driver') {
            list.push({ uid: d.id, ...data } as UserProfile);
          }
        });
        setCustomers(list);
      },
      (err) => console.error('Error fetching customers:', err)
    );

    // 2. Subscribe to Drivers
    const unsubDrivers = onSnapshot(
      collection(db, 'drivers'),
      (snap) => {
        const list: DriverProfile[] = [];
        snap.forEach((d) => list.push({ uid: d.id, ...d.data() } as DriverProfile));
        setDrivers(list);
      },
      (err) => console.error('Error fetching drivers:', err)
    );

    // 3. Subscribe to All Bookings (Active, Completed, Cancelled)
    const unsubBookings = onSnapshot(
      collection(db, 'bookings'),
      (snap) => {
        const list: Booking[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as Booking);
        });
        // Sort descending by date
        list.sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tB - tA;
        });
        setAllBookings(list);
        setLoading(false);
      },
      (err) => console.error('Error fetching bookings:', err)
    );

    // 4. Fetch Fare Settings
    getDoc(doc(db, 'adminSettings', 'default'))
      .then((snap) => {
        if (snap.exists()) {
          setFareSettings(snap.data() as AdminSettings);
        }
      })
      .catch((err) => console.error('Error fetching fare settings:', err));

    // 5. Subscribe to Operational Zones
    const unsubZones = listenToOperationalZones((zList) => {
      setZones(zList);
    });

    // 6. Subscribe to Incident Tickets & Support Channels
    const unsubTickets = subscribeToTickets('admin', 'admin', (tList) => {
      setIncidentTickets(tList);
    });

    const unsubChannels = subscribeToUserChannels('admin', 'admin', (chans) => {
      setSupportChannels(chans);
    });

    return () => {
      unsubCustomers();
      unsubDrivers();
      unsubBookings();
      unsubZones();
      unsubTickets();
      unsubChannels();
    };
  }, [currentUser]);

  // Handler: Update Driver Zone
  const handleUpdateDriverZone = async (driverId: string, zoneId: string) => {
    const matchedZone = zones.find((z) => z.id === zoneId);
    const targetDriver = drivers.find((d) => d.uid === driverId);
    try {
      await updateDoc(doc(db, 'drivers', driverId), {
        zoneId: zoneId || null,
        zoneName: matchedZone?.name || null,
        updatedAt: serverTimestamp(),
      });
      if (selectedDriverModal && selectedDriverModal.uid === driverId) {
        setSelectedDriverModal({
          ...selectedDriverModal,
          zoneId: zoneId || null,
          zoneName: matchedZone?.name || null,
        });
      }

      logActivity({
        action: 'UPDATE',
        actionLabel: 'Reassigned Driver Zone',
        entityType: 'DRIVER',
        entityId: driverId,
        entityName: targetDriver?.fullName || driverId,
        summary: `Driver "${targetDriver?.fullName || driverId}" zone updated to "${matchedZone?.name || 'Unassigned'}"`,
        details: {
          summary: `Driver assigned to operational coverage zone`,
          before: { zoneId: targetDriver?.zoneId, zoneName: targetDriver?.zoneName },
          after: { zoneId: zoneId || null, zoneName: matchedZone?.name || null },
        },
        severity: 'info',
      }).catch(() => {});
    } catch (err) {
      console.error('Error updating driver zone:', err);
    }
  };

  // Handler: Update Driver Status
  const handleUpdateDriverStatus = async (
    driverId: string,
    newStatus: 'APPROVED' | 'REJECTED' | 'SUSPENDED'
  ) => {
    const targetDriver = drivers.find((d) => d.uid === driverId);
    try {
      await updateDoc(doc(db, 'drivers', driverId), {
        accountStatus: newStatus,
        updatedAt: serverTimestamp(),
      });
      if (selectedDriverModal && selectedDriverModal.uid === driverId) {
        setSelectedDriverModal({ ...selectedDriverModal, accountStatus: newStatus });
      }

      logActivity({
        action: 'STATUS_CHANGE',
        actionLabel: `Driver ${newStatus}`,
        entityType: 'DRIVER',
        entityId: driverId,
        entityName: targetDriver?.fullName || driverId,
        summary: `Driver "${targetDriver?.fullName || driverId}" account status changed to ${newStatus}`,
        details: {
          summary: `Admin modified driver approval state`,
          before: { accountStatus: targetDriver?.accountStatus },
          after: { accountStatus: newStatus },
        },
        severity: newStatus === 'APPROVED' ? 'success' : 'danger',
      }).catch(() => {});
    } catch (err) {
      console.error('Error updating driver status:', err);
    }
  };

  // Handler: Update Customer Account Status
  const handleUpdateCustomerStatus = async (
    userId: string,
    newStatus: 'APPROVED' | 'SUSPENDED'
  ) => {
    const targetCustomer = customers.find((c) => c.uid === userId);
    try {
      await updateDoc(doc(db, 'users', userId), {
        accountStatus: newStatus,
        updatedAt: serverTimestamp(),
      });
      if (selectedCustomer && selectedCustomer.uid === userId) {
        setSelectedCustomer({ ...selectedCustomer, accountStatus: newStatus });
      }

      logActivity({
        action: 'STATUS_CHANGE',
        actionLabel: `User ${newStatus}`,
        entityType: 'USER',
        entityId: userId,
        entityName: targetCustomer?.fullName || userId,
        summary: `User "${targetCustomer?.fullName || userId}" account status changed to ${newStatus}`,
        details: {
          summary: `Admin modified customer account state`,
          before: { accountStatus: targetCustomer?.accountStatus },
          after: { accountStatus: newStatus },
        },
        severity: newStatus === 'APPROVED' ? 'success' : 'danger',
      }).catch(() => {});
    } catch (err) {
      console.error('Error updating customer status:', err);
    }
  };

  // Approve & Open RFID Pairing Modal
  const handleApproveAndOpenRfidModal = async (driver: DriverProfile) => {
    try {
      await updateDoc(doc(db, 'drivers', driver.uid), {
        accountStatus: 'APPROVED',
        updatedAt: serverTimestamp(),
      });
      setTargetRfidDriverId(driver.uid);
      setEbikeSubTab('rfid');

      logActivity({
        action: 'STATUS_CHANGE',
        actionLabel: 'Driver Approved',
        entityType: 'DRIVER',
        entityId: driver.uid,
        entityName: driver.fullName,
        summary: `Admin approved driver application for "${driver.fullName}" and initiated RFID linking`,
        details: {
          summary: 'Driver account verified and approved by administrator',
          before: { accountStatus: driver.accountStatus },
          after: { accountStatus: 'APPROVED' },
        },
        performedBy: {
          uid: currentUser?.uid || 'admin',
          name: userProfile?.fullName || 'Platform Administrator',
          email: currentUser?.email || undefined,
          role: 'admin',
        },
        severity: 'success',
      }).catch(() => {});

      setRfidModalDriver({ ...driver, accountStatus: 'APPROVED' });
      setModalRfidInput(latestScannedRfid?.rfidUid || driver.rfidCardUid || '');
      setModalSuccessMsg('');
    } catch (err) {
      console.error('Error approving driver:', err);
    }
  };

  // Save RFID Card from Modal
  const handleSaveRfidInModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfidModalDriver || !modalRfidInput) return;
    setModalPairing(true);
    setModalSuccessMsg('');

    try {
      await pairDriverRfidCard(rfidModalDriver.uid, modalRfidInput);
      setModalSuccessMsg(`RFID Card [${modalRfidInput.toUpperCase()}] linked to ${rfidModalDriver.fullName}!`);
      setTimeout(() => {
        setRfidModalDriver(null);
        setModalSuccessMsg('');
      }, 1400);
    } catch (err) {
      console.error('Error pairing RFID card:', err);
    } finally {
      setModalPairing(false);
    }
  };

  // Save Fare Settings
  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsSuccess(false);

    try {
      await setDoc(doc(db, 'adminSettings', 'default'), {
        ...fareSettings,
        updatedAt: serverTimestamp(),
      });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);

      logActivity({
        action: 'SETTINGS_UPDATE',
        actionLabel: 'Updated Shuttle Dispatch Settings',
        entityType: 'SETTINGS',
        entityId: 'default',
        entityName: 'Operational Policy & Dispatch Settings',
        summary: `Admin updated operational parameters (Search Radius: ${fareSettings.initialSearchRadiusKm}km, Max Radius: ${fareSettings.maxServiceRadiusKm}km) - Free Shuttle Policy`,
        details: {
          summary: `Operational dispatch configuration updated (100% Free Public Shuttle)`,
          after: {
            initialSearchRadiusKm: fareSettings.initialSearchRadiusKm,
            maxServiceRadiusKm: fareSettings.maxServiceRadiusKm,
            isFreeShuttle: true,
          },
        },
        severity: 'info',
      }).catch(() => {});
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setSettingsSaving(false);
    }
  };

  // Date Formatter Helper
  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
    if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    return 'N/A';
  };

  // Filter Computations
  const pendingDrivers = drivers.filter((d) => d.accountStatus === 'PENDING');
  const onlineDrivers = drivers.filter((d) => d.availability === 'ONLINE' || d.availability === 'BUSY');
  const activeBookings = allBookings.filter((b) =>
    ['SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'RIDE_STARTED'].includes(b.status)
  );
  const completedBookings = allBookings.filter((b) => b.status === 'COMPLETED');

  // Strict separation: Filter out any drivers or admins from customer accounts
  const driverUids = new Set(drivers.map((d) => d.uid));
  const driverEmails = new Set(drivers.map((d) => d.email?.toLowerCase()).filter(Boolean));

  // Platform Administrators
  const adminsOnly = customers.filter(
    (c) => c.role === 'admin' || c.email?.toLowerCase() === 'admin@eshuttle.com'
  );

  // Filtered Administrators
  const filteredAdmins = adminsOnly.filter((a) => {
    if (userTabRole === 'PENDING') return false;
    const q = accountSearch.toLowerCase();
    const matchesSearch =
      a.fullName?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q) ||
      a.username?.toLowerCase().includes(q) ||
      a.phone?.includes(q);
    return matchesSearch;
  });

  const customersOnly = customers.filter((c) => {
    if (c.role === 'driver' || c.role === 'admin') return false;
    if (c.email?.toLowerCase() === 'admin@eshuttle.com') return false;
    if (driverUids.has(c.uid)) return false;
    if (c.email && driverEmails.has(c.email.toLowerCase())) return false;
    if (c.fullName?.toLowerCase().startsWith('driver ')) return false;
    return true;
  });

  // Filtered Customers
  const filteredCustomers = customersOnly.filter((c) => {
    // Hide passengers when viewing PENDING approvals tab
    if (userTabRole === 'PENDING') return false;

    const q = accountSearch.toLowerCase();
    const matchesSearch =
      c.fullName?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q);

    if (!matchesSearch) return false;

    if (accountStatusFilter === 'ACTIVE' || accountStatusFilter === 'APPROVED') {
      return c.accountStatus !== 'SUSPENDED';
    }
    if (accountStatusFilter === 'SUSPENDED') {
      return c.accountStatus === 'SUSPENDED';
    }
    if (accountStatusFilter === 'ONLINE' || accountStatusFilter === 'PENDING') {
      return false;
    }
    return true;
  });

  // Filtered Drivers
  const filteredDrivers = drivers.filter((d) => {
    // If sub-tab filter is PENDING, strictly return drivers awaiting approval (accountStatus === 'PENDING')
    if (userTabRole === 'PENDING' && d.accountStatus !== 'PENDING') {
      return false;
    }

    const q = accountSearch.toLowerCase();
    const matchesSearch =
      d.fullName?.toLowerCase().includes(q) ||
      d.email?.toLowerCase().includes(q) ||
      d.phone?.includes(q) ||
      d.vehicleInfo?.toLowerCase().includes(q) ||
      d.rfidCardUid?.toLowerCase().includes(q) ||
      d.zoneName?.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (accountStatusFilter === 'PENDING') return d.accountStatus === 'PENDING';
    if (accountStatusFilter === 'APPROVED' || accountStatusFilter === 'ACTIVE') return d.accountStatus === 'APPROVED';
    if (accountStatusFilter === 'SUSPENDED') return d.accountStatus === 'SUSPENDED';
    if (accountStatusFilter === 'ONLINE') return d.availability === 'ONLINE' || d.availability === 'BUSY';
    return true;
  });

  // Filtered Rides Log
  const filteredRides = allBookings.filter((b) => {
    const q = rideSearch.toLowerCase();
    const matchesSearch =
      b.customerName?.toLowerCase().includes(q) ||
      b.driverName?.toLowerCase().includes(q) ||
      b.pickup?.address?.toLowerCase().includes(q) ||
      b.destination?.address?.toLowerCase().includes(q) ||
      b.id?.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (rideStatusFilter === 'ACTIVE') {
      return ['SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'RIDE_STARTED'].includes(b.status);
    }
    if (rideStatusFilter === 'COMPLETED') return b.status === 'COMPLETED';
    if (rideStatusFilter === 'CANCELLED') return b.status === 'CANCELLED' || b.status === 'EXPIRED';
    return true;
  });

  // Strict tab resolution fallback to ensure contents never render blank on page refresh
  const validAdminTabs = ['dashboard', 'zones', 'stations', 'users', 'customers', 'drivers', 'rides', 'ebikes', 'incidents', 'settings', 'logs', 'audit'];
  const currentTab = activeTab === 'map' ? 'dashboard' : validAdminTabs.includes(activeTab) ? activeTab : 'dashboard';

  // Dynamic header information based on active page view
  const getPageHeaderInfo = () => {
    switch (currentTab) {
      case 'dashboard':
      case 'map':
        return {
          title: 'Admin Control Panel',
          badge: 'OVERVIEW',
          subtitle: 'Real-time e-shuttle monitoring, pickup alerts, and trip management',
        };
      case 'logs':
      case 'audit':
        return {
          title: 'System Activity & Audit Logs',
          badge: 'AUDIT TRAIL',
          subtitle: 'Real-time tracking of all CRUD events, state changes, and operations for backtracking',
        };
      case 'users':
      case 'customers':
      case 'drivers':
        return {
          title: `Users & Driver Accounts (${customersOnly.length + drivers.length})`,
          badge: 'DIRECTORY',
          subtitle: 'Unified account directory for passengers, shuttle drivers, approvals, and RFID access',
        };
      case 'zones':
        return {
          title: `Geofence Service Zones (${zones.length})`,
          badge: 'COVERAGE',
          subtitle: 'Configure operational boundaries, active perimeters, and service coverage zones',
        };
      case 'stations':
        return {
          title: 'Shuttle Stations & Stop Pinning',
          badge: 'STATIONS',
          subtitle: 'Manage designated pick-up & drop-off station locations and catchments',
        };
      case 'rides':
        return {
          title: `Trip Dispatch History (${allBookings.length})`,
          badge: 'TRANSIT LOG',
          subtitle: 'Complete record of ongoing, completed, and cancelled transit trips',
        };
      case 'ebikes':
        return {
          title: 'E-Shuttle Fleet & Telemetry',
          badge: 'FLEET',
          subtitle: 'Monitor vehicle status, operational readiness, maintenance, and GPS tracking',
        };
      case 'incidents':
        return {
          title: `Incidents & Support Tickets (${incidentTickets.length})`,
          badge: 'SAFETY & DISPATCH',
          subtitle: 'Passenger & driver safety reports, breakdowns, and 2-way dispatch support',
        };
      case 'settings':
        return {
          title: 'Dispatch System Settings',
          badge: 'CONFIG',
          subtitle: 'Configure driver search radius, system defaults, and operational parameters (Free Public Shuttle)',
        };
      default:
        return {
          title: 'Admin Control Panel',
          badge: 'ADMIN',
          subtitle: 'Manage users, drivers, e-shuttles & pick-up dispatch',
        };
    }
  };
  const pageHeader = getPageHeaderInfo();

  return (
    <div className="h-full overflow-y-auto bg-[#E3F2FD] text-[#0D47A1] p-3 sm:p-5 pb-36 max-w-5xl mx-auto space-y-5">
      {/* Dynamic Page Title Header Bar */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <img
            src={activeAppLogo}
            onError={(e) => {
              markLogoUrlAsFailed(activeAppLogo);
              (e.target as HTMLImageElement).src = officialLogoFallback;
            }}
            alt="E-Shuttle Official Logo"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl object-cover border-2 border-[#0D47A1] shadow-md shrink-0"
          />
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-[#0D47A1] flex items-center gap-2">
              <span>{pageHeader.title}</span>
              <span className="text-[10px] font-black bg-[#0D47A1] text-white border border-[#0D47A1] px-2 py-0.5 rounded-full uppercase hidden sm:inline-block shadow-sm">
                {pageHeader.badge}
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">{pageHeader.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setTutorialInitialStep(0);
              setIsTutorialOpen(true);
            }}
            className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 border-2 border-amber-500 rounded-xl font-black text-xs uppercase flex items-center gap-1.5 active:scale-95 shadow-sm transition-all"
            title="Open Interactive Administrator Tutorial & Backtracking Masterclass"
          >
            <BookOpen className="w-3.5 h-3.5 text-slate-900" />
            <span className="hidden sm:inline">Admin Tutorial</span>
          </button>

          <button
            onClick={() => setIsFaqOpen(true)}
            className="px-3 py-1.5 bg-[#0D47A1] text-white hover:bg-[#1565C0] border-2 border-[#0D47A1] rounded-xl font-black text-xs uppercase flex items-center gap-1.5 active:scale-95 shadow-sm transition-all"
            title="View Official Program Specs, FAQs, Routes & Developer Team"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline">Info & FAQs</span>
          </button>

          <button
            onClick={logout}
            className="px-3 py-1.5 bg-white border-2 border-[#0D47A1] rounded-xl text-[#0D47A1] hover:bg-[#E3F2FD] transition-colors font-bold text-xs uppercase flex items-center gap-1.5 active:scale-95 shadow-sm shrink-0"
            title="Sign out of administrator session"
          >
            <LogOut className="w-3.5 h-3.5 text-[#0D47A1]" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>



      {/* =========================================================================
          VIEW 1: MERGED EXECUTIVE DASHBOARD & LIVE MAP
         ========================================================================= */}
      {currentTab === 'dashboard' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Welcome & Interactive Tutorial Banner */}
          {!isTutorialBannerDismissed && (
            <div className="bg-gradient-to-r from-[#0D47A1] via-[#1565C0] to-[#0D47A1] text-white p-4 sm:p-5 rounded-3xl border-2 border-[#0D47A1] shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden">
              <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-start sm:items-center gap-3.5 z-10">
                <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-900 flex items-center justify-center shrink-0 shadow-lg font-black">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-900 px-2 py-0.5 rounded-full shadow-xs">
                      Admin Onboarding & Guide
                    </span>
                    <span className="text-xs text-blue-200 font-bold">New to the Tagbilaran E-Shuttle Hub?</span>
                  </div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    Interactive Walkthrough: Fleet Ops & CRUD Backtracking
                  </h2>
                  <p className="text-xs text-blue-100 font-medium max-w-2xl leading-relaxed">
                    Learn how to manage geofenced zones, pair contactless RFID cards, vet drivers, dispatch live shuttles, and use the <strong>Activity Logs engine to backtrack changes and recover prior states</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0 z-10 w-full md:w-auto">
                <button
                  onClick={() => {
                    setTutorialInitialStep(0);
                    setIsTutorialOpen(true);
                  }}
                  className="flex-1 md:flex-initial px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase rounded-xl flex items-center justify-center gap-1.5 active:scale-95 shadow-md transition-all"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Start Tutorial</span>
                </button>

                <button
                  onClick={() => {
                    setTutorialInitialStep(6);
                    setIsTutorialOpen(true);
                  }}
                  className="flex-1 md:flex-initial px-3.5 py-2 bg-white/15 hover:bg-white/25 text-white border border-white/30 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                >
                  <Database className="w-3.5 h-3.5 text-amber-300" />
                  <span>Backtracking Guide</span>
                </button>

                <button
                  onClick={() => {
                    setIsTutorialBannerDismissed(true);
                    try {
                      localStorage.setItem('admin_tutorial_banner_dismissed', 'true');
                    } catch {}
                  }}
                  className="px-2.5 py-2 text-blue-200 hover:text-white text-xs font-bold transition-colors"
                  title="Dismiss this onboarding banner"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* KPI Stat Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div
              onClick={() => {
                setUserTabRole('ALL');
                setActiveTab('users');
              }}
              title="View all registered users and drivers"
              className="bg-white border-2 border-[#0D47A1] hover:bg-[#E3F2FD]/30 rounded-2xl p-4 space-y-1 cursor-pointer transition-all shadow-md"
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#0D47A1]">Users & Drivers</span>
                <Users className="w-4 h-4 text-[#0D47A1]" />
              </div>
              <div className="text-2xl font-black text-[#0D47A1] flex items-baseline gap-2">
                <span>{customersOnly.length + drivers.length}</span>
                {pendingDrivers.length > 0 && (
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300">
                    {pendingDrivers.length} Pending
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-medium">{customersOnly.length} users • {drivers.length} drivers</p>
            </div>

            <div
              onClick={() => {
                setUserTabRole('DRIVERS');
                setActiveTab('users');
              }}
              title="View driver accounts and active statuses"
              className="bg-white border-2 border-[#0D47A1] hover:bg-[#E3F2FD]/30 rounded-2xl p-4 space-y-1 cursor-pointer transition-all shadow-md"
            >
              <div className="flex items-center justify-between text-[#0D47A1]">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#0D47A1]">Active Drivers</span>
                <Users className="w-4 h-4 text-[#0D47A1]" />
              </div>
              <div className="text-2xl font-black text-[#0D47A1] flex items-baseline gap-2">
                <span>{drivers.length}</span>
              </div>
              <p className="text-[10px] text-[#0D47A1] font-bold">{onlineDrivers.length} Online Now</p>
            </div>

            <div
              onClick={() => setActiveTab('incidents')}
              title="View reported incident tickets and safety reports"
              className="bg-white border-2 border-rose-500 hover:bg-rose-50/50 rounded-2xl p-4 space-y-1 cursor-pointer transition-all shadow-md"
            >
              <div className="flex items-center justify-between text-rose-700">
                <span className="text-[10px] uppercase font-bold tracking-wider text-rose-800">Incident Tickets</span>
                <ShieldAlert className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-2xl font-black text-rose-700 flex items-baseline gap-2">
                <span>{incidentTickets.length}</span>
                {incidentTickets.filter((t) => t.status === 'open').length > 0 && (
                  <span className="text-[10px] font-black bg-rose-600 text-white px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                    {incidentTickets.filter((t) => t.status === 'open').length} Open
                  </span>
                )}
              </div>
              <p className="text-[10px] text-rose-700 font-bold">
                {incidentTickets.filter((t) => t.priority === 'emergency').length} Urgent Emergencies
              </p>
            </div>

            <div
              onClick={() => setActiveTab('rides')}
              title="View ongoing pick-up & drop-off trips"
              className="bg-white border-2 border-[#0D47A1] hover:bg-[#E3F2FD]/30 rounded-2xl p-4 space-y-1 cursor-pointer transition-all shadow-md"
            >
              <div className="flex items-center justify-between text-[#0D47A1]">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#0D47A1]">Ongoing Trips</span>
                <Route className="w-4 h-4 text-[#0D47A1]" />
              </div>
              <div className="text-2xl font-black text-[#0D47A1]">{activeBookings.length}</div>
              <p className="text-[10px] text-slate-500 font-medium">Trips in transit now</p>
            </div>

            <div
              onClick={() => setActiveTab('rides')}
              title="View completed trips archive"
              className="bg-white border-2 border-[#0D47A1] hover:bg-[#E3F2FD]/30 rounded-2xl p-4 space-y-1 cursor-pointer transition-all shadow-md"
            >
              <div className="flex items-center justify-between text-[#0D47A1]">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#0D47A1]">Completed Trips</span>
                <CheckCircle className="w-4 h-4 text-[#0D47A1]" />
              </div>
              <div className="text-2xl font-black text-[#0D47A1]">{completedBookings.length}</div>
              <p className="text-[10px] text-slate-500 font-medium">Total finished trips</p>
            </div>
          </div>

          {/* INTEGRATED LIVE MAP */}
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 space-y-3 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-[#0D47A1] flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                  <MapPin className="w-4 h-4 text-[#0D47A1]" />
                  <span>Live E-Shuttle & Driver Map</span>
                </h2>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Real-time GPS tracking of active drivers ({onlineDrivers.length} online) and e-shuttles
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEbikeSubTab('simulator');
                    setActiveTab('ebikes');
                  }}
                  title="Simulate live GPS movement and hardware telemetry"
                  className="px-3.5 py-1.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 shadow-md active:scale-95"
                >
                  <Cpu className="w-3.5 h-3.5 text-[#90CAF9]" />
                  <span>GPS Simulator</span>
                </button>
              </div>
            </div>

            <AdminEBikeMap
              drivers={drivers}
              height="480px"
              onNavigateToStations={() => setActiveTab('stations')}
            />
          </div>

          {/* Live Ongoing Rides Feed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-[#0D47A1] flex items-center gap-2">
                <span className="w-2 h-2 bg-[#0D47A1] rounded-full animate-ping" />
                <span>Ongoing Trips ({activeBookings.length})</span>
              </h2>
              <button
                onClick={() => setActiveTab('rides')}
                title="View full list of pick-up and drop-off trips"
                className="text-xs text-[#0D47A1] hover:text-[#1565C0] font-bold flex items-center gap-1"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeBookings.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs bg-white rounded-3xl border-2 border-[#0D47A1] space-y-1 shadow-md">
                <Route className="w-6 h-6 text-[#0D47A1] mx-auto mb-2" />
                <p className="font-bold text-[#0D47A1]">No Ongoing Trips Right Now</p>
                <p className="text-[11px] text-slate-500 font-medium">New user pick-up requests and assigned trips will appear here.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {activeBookings.slice(0, 4).map((booking) => (
                  <div
                    key={booking.id}
                    onClick={() => setSelectedBookingModal(booking)}
                    className="bg-white border-2 border-[#0D47A1] hover:bg-[#E3F2FD]/30 rounded-2xl p-4 space-y-3 shadow-md cursor-pointer transition-all text-[#0D47A1]"
                  >
                    <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-2">
                      <div>
                        <span className="text-[10px] font-extrabold text-[#0D47A1] uppercase tracking-wider bg-[#E3F2FD] px-2 py-0.5 rounded-full border border-[#0D47A1]">
                          {booking.status}
                        </span>
                        <h3 className="font-black text-sm text-[#0D47A1] mt-1">User: {booking.customerName}</h3>
                        <p className="text-xs text-slate-500 font-medium">Driver: {booking.driverName || 'Searching for driver...'}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block text-[10px] font-extrabold text-[#0D47A1] bg-[#E3F2FD] border border-[#0D47A1] px-2 py-0.5 rounded-full uppercase">
                          Free Shuttle
                        </span>
                        <div className="text-[10px] text-slate-500 font-medium mt-1">{booking.distanceKm} km</div>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs text-slate-700">
                      <div className="flex items-start gap-2">
                        <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1.5 py-0.5 rounded uppercase shrink-0">PICKUP</span>
                        <span className="truncate font-medium">{booking.pickup?.address}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-[9px] font-mono font-bold text-white bg-[#1565C0] px-1.5 py-0.5 rounded uppercase shrink-0">DEST</span>
                        <span className="truncate font-medium">{booking.destination?.address}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity Feed */}
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 space-y-3 shadow-md">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Recent Completed Trips</h3>
            {completedBookings.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No completed trips recorded yet.</p>
            ) : (
              <div className="divide-y divide-[#0D47A1]/20">
                {completedBookings.slice(0, 5).map((ride) => (
                  <div
                    key={ride.id}
                    onClick={() => setSelectedBookingModal(ride)}
                    className="py-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-[#E3F2FD]/50 px-2 rounded-xl transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-[#0D47A1] flex items-center gap-2">
                        <span>{ride.customerName}</span>
                        <span className="text-[10px] text-slate-500 font-normal">→ {ride.driverName || 'Driver'}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-md">
                        {ride.pickup?.address} to {ride.destination?.address}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 uppercase">
                        COMPLETED
                      </span>
                      <div className="text-[9px] text-slate-400 mt-0.5">{formatDate(ride.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 2: UNIFIED USERS & DRIVERS MANAGEMENT PORTAL
         ========================================================================= */}
      {(currentTab === 'users' || currentTab === 'customers' || currentTab === 'drivers') && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setCreateRole('customer');
                  setCreateError(null);
                  setShowCreateAccountModal(true);
                }}
                className="px-3.5 py-1.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                title="Create a new passenger or driver account"
              >
                <Plus className="w-4 h-4" />
                <span>Create Account</span>
              </button>
            </div>

            {/* Unified Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search name, phone, email, RFID..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="w-full bg-white border-2 border-[#0D47A1] rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#0D47A1] placeholder:text-slate-400 focus:outline-none focus:border-[#1565C0]"
              />
            </div>
          </div>

          {/* Sub-tab Pill Switcher */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setUserTabRole('ALL')}
              className={`px-3 py-1.5 rounded-xl font-black uppercase text-[10px] tracking-wider shrink-0 transition-colors ${
                userTabRole === 'ALL'
                  ? 'bg-[#0D47A1] text-white shadow-md'
                  : 'bg-white text-[#0D47A1] border-2 border-[#0D47A1] hover:bg-[#E3F2FD]'
              }`}
            >
              All Accounts ({customersOnly.length + drivers.length + adminsOnly.length})
            </button>

            <button
              onClick={() => setUserTabRole('CUSTOMERS')}
              className={`px-3 py-1.5 rounded-xl font-black uppercase text-[10px] tracking-wider shrink-0 transition-colors flex items-center gap-1.5 ${
                userTabRole === 'CUSTOMERS'
                  ? 'bg-[#0D47A1] text-white shadow-md'
                  : 'bg-white text-[#0D47A1] border-2 border-[#0D47A1] hover:bg-[#E3F2FD]'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Passengers ({customersOnly.length})</span>
            </button>

            <button
              onClick={() => setUserTabRole('DRIVERS')}
              className={`px-3 py-1.5 rounded-xl font-black uppercase text-[10px] tracking-wider shrink-0 transition-colors flex items-center gap-1.5 ${
                userTabRole === 'DRIVERS'
                  ? 'bg-[#0D47A1] text-white shadow-md'
                  : 'bg-white text-[#0D47A1] border-2 border-[#0D47A1] hover:bg-[#E3F2FD]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Drivers ({drivers.length})</span>
            </button>

            <button
              onClick={() => setUserTabRole('ADMINS')}
              className={`px-3 py-1.5 rounded-xl font-black uppercase text-[10px] tracking-wider shrink-0 transition-colors flex items-center gap-1.5 ${
                userTabRole === 'ADMINS'
                  ? 'bg-[#0D47A1] text-white shadow-md'
                  : 'bg-white text-[#0D47A1] border-2 border-[#0D47A1] hover:bg-[#E3F2FD]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admins ({adminsOnly.length})</span>
            </button>

            <button
              onClick={() => setUserTabRole('PENDING')}
              className={`px-3 py-1.5 rounded-xl font-black uppercase text-[10px] tracking-wider shrink-0 transition-colors flex items-center gap-1.5 ${
                userTabRole === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-md'
                  : pendingDrivers.length > 0
                  ? 'bg-amber-50 text-amber-800 border-2 border-amber-400 hover:bg-amber-100'
                  : 'bg-white text-[#0D47A1] border-2 border-[#0D47A1] hover:bg-[#E3F2FD]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Pending Approvals ({pendingDrivers.length})</span>
            </button>

            {/* Status Filter Dropdown */}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase hidden sm:inline">Status:</span>
              <select
                value={accountStatusFilter}
                onChange={(e) => setAccountStatusFilter(e.target.value)}
                className="px-2.5 py-1 bg-white border-2 border-[#0D47A1] rounded-xl text-xs font-bold text-[#0D47A1] focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active / Approved</option>
                <option value="ONLINE">Online Drivers</option>
                <option value="PENDING">Pending Approval</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
          </div>

          {/* Accounts Directory Grid */}
          <div className="space-y-3">
            {/* Show Drivers if Role is ALL, DRIVERS, or PENDING */}
            {(userTabRole === 'ALL' || userTabRole === 'DRIVERS' || userTabRole === 'PENDING') && (
              <div className="space-y-3">
                {userTabRole === 'ALL' && (
                  <div className="flex items-center justify-between pt-2 pb-1 border-b border-[#0D47A1]/20">
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#0D47A1] flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span>Shuttle Drivers ({filteredDrivers.length})</span>
                    </h3>
                  </div>
                )}

                {userTabRole === 'PENDING' && (
                  <div className="flex items-center justify-between pt-2 pb-1 border-b-2 border-amber-400">
                    <h3 className="text-xs font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-amber-600" />
                      <span>Drivers Awaiting Admin Approval ({filteredDrivers.length})</span>
                    </h3>
                  </div>
                )}

                {filteredDrivers.length === 0 && (userTabRole === 'DRIVERS' || userTabRole === 'PENDING') ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-white rounded-3xl border-2 border-[#0D47A1] shadow-md">
                    {userTabRole === 'PENDING'
                      ? 'No pending driver approvals at this time. All driver registrations are reviewed!'
                      : 'No matching driver accounts found.'}
                  </div>
                ) : (
                  filteredDrivers.map((dr) => (
                    <div
                      key={dr.uid}
                      className="bg-white border-2 border-[#0D47A1] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md hover:bg-[#E3F2FD]/30 transition-colors text-[#0D47A1]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#0D47A1] text-white rounded-xl flex items-center justify-center font-black text-xs uppercase shrink-0 shadow-sm">
                          {dr.fullName?.charAt(0) || 'D'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#0D47A1] text-white shadow-sm">
                              DRIVER
                            </span>
                            <h3 className="font-black text-sm text-[#0D47A1]">{dr.fullName}</h3>
                            <span
                              className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                dr.accountStatus === 'APPROVED'
                                  ? 'bg-[#E3F2FD] text-[#0D47A1] border-[#0D47A1]'
                                  : dr.accountStatus === 'PENDING'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                                  : 'bg-rose-50 text-rose-600 border-rose-200'
                              }`}
                            >
                              {dr.accountStatus}
                            </span>

                            <span
                              className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                dr.availability === 'ONLINE'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : dr.availability === 'BUSY'
                                  ? 'bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1]'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {dr.availability || 'OFFLINE'}
                            </span>

                            {/* Zone Badge with Quick Assignment Selector */}
                            <div className="flex items-center gap-1 bg-[#E3F2FD] border border-[#0D47A1] px-2 py-0.5 rounded-lg text-[10px]">
                              <span className="font-bold text-[#0D47A1]">📍 Zone:</span>
                              <select
                                value={dr.zoneId || ''}
                                onChange={(e) => handleUpdateDriverZone(dr.uid, e.target.value)}
                                className="bg-transparent font-bold text-[#0D47A1] focus:outline-none cursor-pointer text-[10px]"
                              >
                                <option value="">No Zone (All)</option>
                                {zones.map((zone) => (
                                  <option key={zone.id} value={zone.id}>
                                    {zone.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {dr.rfidCardUid ? (
                              <span className="font-mono text-[10px] font-black text-[#0D47A1] bg-[#E3F2FD] border border-[#0D47A1] px-2 py-0.5 rounded-lg flex items-center gap-1">
                                <CreditCard className="w-3 h-3 text-[#0D47A1]" />
                                <span>RFID: {dr.rfidCardUid}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-700 italic font-bold">
                                * No RFID Linked
                              </span>
                            )}

                            {dr.driverLicenseCardUrl ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLicensePreviewUrl(dr.driverLicenseCardUrl || null);
                                }}
                                className="text-[10px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors"
                                title="Click to view Driver's License Card photo"
                              >
                                <ImageIcon className="w-3 h-3 text-emerald-700" />
                                <span>License Card Uploaded</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                <span>No License Uploaded</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-medium">
                            {dr.phone} • {dr.email}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                            Vehicle: {sanitizeVehicleInfo(dr.vehicleInfo)} • Rating: ⭐ {dr.rating || '5.0'}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <button
                          onClick={() => setDirectChatTarget({ id: dr.uid, name: dr.fullName, role: 'driver' })}
                          title="Open direct 2-way dispatch chat with driver"
                          className="px-3 py-1.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-transform shadow-sm"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Chat</span>
                        </button>

                        <button
                          onClick={() => setSelectedDriverModal(dr)}
                          title="View driver profile and operational stats"
                          className="px-3 py-1.5 bg-white border-2 border-[#0D47A1] hover:bg-[#E3F2FD] text-[#0D47A1] rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-transform shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#0D47A1]" />
                          <span>Profile</span>
                        </button>

                        {dr.accountStatus !== 'APPROVED' && (
                          <button
                            onClick={() => handleApproveAndOpenRfidModal(dr)}
                            title="Approve driver application and assign RFID access card"
                            className="px-3.5 py-1.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black shadow-md uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-transform"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <CreditCard className="w-3.5 h-3.5 text-[#90CAF9]" />
                            <span>Approve & Link Card</span>
                          </button>
                        )}

                        {dr.accountStatus === 'APPROVED' && (
                          <button
                            onClick={() => {
                              setRfidModalDriver(dr);
                              setModalRfidInput(latestScannedRfid?.rfidUid || dr.rfidCardUid || '');
                              setModalSuccessMsg('');
                            }}
                            title="Update RFID access card UID assigned to driver"
                            className="px-3 py-1.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-transform shadow-sm"
                          >
                            <CreditCard className="w-3.5 h-3.5 text-[#90CAF9]" />
                            <span>{dr.rfidCardUid ? 'Change Card' : 'Link Card'}</span>
                          </button>
                        )}

                        {dr.accountStatus === 'PENDING' && (
                          <button
                            onClick={() => handleUpdateDriverStatus(dr.uid, 'REJECTED')}
                            title="Decline driver registration request"
                            className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-transform"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        )}

                        {dr.accountStatus === 'APPROVED' && (
                          <button
                            onClick={() => handleUpdateDriverStatus(dr.uid, 'SUSPENDED')}
                            title="Suspend driver operating privileges"
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-transform"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Suspend</span>
                          </button>
                        )}

                        {dr.accountStatus === 'SUSPENDED' && (
                          <button
                            onClick={() => handleUpdateDriverStatus(dr.uid, 'APPROVED')}
                            title="Reactivate driver account"
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-transform"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Reactivate</span>
                          </button>
                        )}

                        <button
                          onClick={() =>
                            setDeleteConfirmTarget({
                              id: dr.uid,
                              name: dr.fullName,
                              role: 'driver',
                              email: dr.email,
                            })
                          }
                          title="Permanently remove driver account from database"
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold active:scale-95 transition-transform flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Delete</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Show Passengers if Role is ALL or CUSTOMERS */}
            {(userTabRole === 'ALL' || userTabRole === 'CUSTOMERS') && (
              <div className="space-y-3 pt-2">
                {userTabRole === 'ALL' && (
                  <div className="flex items-center justify-between pt-2 pb-1 border-b border-[#0D47A1]/20">
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#0D47A1] flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span>Passengers / Users ({filteredCustomers.length})</span>
                    </h3>
                  </div>
                )}

                {filteredCustomers.length === 0 && userTabRole === 'CUSTOMERS' ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-white rounded-3xl border-2 border-[#0D47A1] shadow-md">
                    No matching passenger accounts found.
                  </div>
                ) : (
                  filteredCustomers.map((cust) => {
                    const customerRides = allBookings.filter((b) => b.customerId === cust.uid);
                    const completedCount = customerRides.filter((b) => b.status === 'COMPLETED').length;

                    return (
                      <div
                        key={cust.uid}
                        className="bg-white border-2 border-[#0D47A1] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md hover:bg-[#E3F2FD]/30 transition-colors text-[#0D47A1]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#0D47A1] text-white rounded-xl flex items-center justify-center font-black text-xs uppercase shrink-0 shadow-sm">
                            {cust.fullName?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1]">
                                PASSENGER
                              </span>
                              <h3 className="font-black text-sm text-[#0D47A1]">{cust.fullName}</h3>
                              <span
                                className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                  cust.accountStatus === 'SUSPENDED'
                                    ? 'bg-rose-50 text-rose-600 border-rose-200'
                                    : 'bg-[#E3F2FD] text-[#0D47A1] border-[#0D47A1]'
                                }`}
                              >
                                {cust.accountStatus || 'ACTIVE'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">
                              {cust.phone} • {cust.email}
                            </p>
                            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                              Total Trips: <strong className="text-[#0D47A1]">{completedCount}</strong> • Joined: {formatDate(cust.createdAt)}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            onClick={() => setDirectChatTarget({ id: cust.uid, name: cust.fullName, role: 'customer' })}
                            title="Open direct 2-way support chat with passenger"
                            className="px-3.5 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-transform shadow-sm"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Chat</span>
                          </button>

                          <button
                            onClick={() => setSelectedCustomer(cust)}
                            title="View user profile and transit history"
                            className="px-3.5 py-2 bg-white border-2 border-[#0D47A1] hover:bg-[#E3F2FD] text-[#0D47A1] rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-transform shadow-sm"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#0D47A1]" />
                            <span>Profile</span>
                          </button>

                          {cust.accountStatus === 'SUSPENDED' ? (
                            <button
                              onClick={() => handleUpdateCustomerStatus(cust.uid, 'APPROVED')}
                              title="Restore user account access"
                              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-transform"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Reactivate</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUpdateCustomerStatus(cust.uid, 'SUSPENDED')}
                              title="Temporarily suspend user account"
                              className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-transform"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>Suspend</span>
                            </button>
                          )}

                          <button
                            onClick={() =>
                              setDeleteConfirmTarget({
                                id: cust.uid,
                                name: cust.fullName,
                                role: 'customer',
                                email: cust.email,
                              })
                            }
                            title="Permanently remove passenger account from database"
                            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold active:scale-95 transition-transform flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Show Administrators if Role is ALL or ADMINS */}
            {(userTabRole === 'ALL' || userTabRole === 'ADMINS') && (
              <div className="space-y-3 pt-2">
                {userTabRole === 'ALL' && (
                  <div className="flex items-center justify-between pt-2 pb-1 border-b border-[#0D47A1]/20">
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#0D47A1] flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Platform Administrators ({filteredAdmins.length})</span>
                    </h3>
                  </div>
                )}

                {filteredAdmins.length === 0 && userTabRole === 'ADMINS' ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-white rounded-3xl border-2 border-[#0D47A1] shadow-md">
                    No matching administrator accounts found.
                  </div>
                ) : (
                  filteredAdmins.map((admin) => {
                    const isSelf =
                      admin.uid === currentUser?.uid ||
                      (admin.email && currentUser?.email && admin.email.toLowerCase() === currentUser.email.toLowerCase());

                    return (
                      <div
                        key={admin.uid}
                        className="bg-white border-2 border-[#0D47A1] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md hover:bg-[#E3F2FD]/30 transition-colors text-[#0D47A1]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#0D47A1] text-white rounded-xl flex items-center justify-center font-black text-xs uppercase shrink-0 shadow-sm">
                            <ShieldCheck className="w-5 h-5 text-amber-300" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#0D47A1] text-white shadow-sm">
                                ADMINISTRATOR
                              </span>
                              {isSelf && (
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                                  You (Active)
                                </span>
                              )}
                              <h3 className="font-black text-sm text-[#0D47A1]">{admin.fullName}</h3>
                              {admin.username && (
                                <span className="text-[10px] font-mono font-bold text-slate-500">
                                  @{admin.username}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 font-medium">
                              {admin.phone || 'No direct phone'} • {admin.email}
                            </p>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Role: System Master Administrator • Created: {formatDate(admin.createdAt)}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            onClick={() => {
                              setActiveTab('settings');
                            }}
                            title="Edit administrative credentials and system parameters"
                            className="px-3.5 py-2 bg-white border-2 border-[#0D47A1] hover:bg-[#E3F2FD] text-[#0D47A1] rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-transform shadow-sm"
                          >
                            <UserCog className="w-3.5 h-3.5 text-[#0D47A1]" />
                            <span>Edit Admin</span>
                          </button>

                          {!isSelf ? (
                            <button
                              onClick={() =>
                                setDeleteConfirmTarget({
                                  id: admin.uid,
                                  name: admin.fullName,
                                  role: 'admin',
                                  email: admin.email,
                                })
                              }
                              title="Permanently remove admin account from database"
                              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-transform"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          ) : (
                            <span
                              title="Active admin account cannot be deleted while logged in"
                              className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 bg-slate-100 rounded-xl border border-slate-200 select-none"
                            >
                              Active Session
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 4: RIDES LOG & HISTORIES
         ========================================================================= */}
      {currentTab === 'rides' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
            {/* Search Bar */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search user, driver, route..."
                value={rideSearch}
                onChange={(e) => setRideSearch(e.target.value)}
                className="w-full bg-white border-2 border-[#0D47A1] rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#0D47A1] placeholder:text-slate-400 focus:outline-none focus:border-[#1565C0]"
              />
            </div>
          </div>

          {/* Ride Status Filter Tabs */}
          <div className="flex items-center gap-2 text-xs">
            {['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setRideStatusFilter(st)}
                className={`px-3.5 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-colors ${
                  rideStatusFilter === st
                    ? 'bg-[#0D47A1] text-white shadow-md'
                    : 'bg-white text-[#0D47A1] border-2 border-[#0D47A1] hover:bg-[#E3F2FD]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Rides List */}
          {filteredRides.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs bg-white rounded-3xl border-2 border-[#0D47A1] shadow-md">
              No pick-up & drop-off trips found matching filters.
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredRides.map((ride) => (
                <div
                  key={ride.id}
                  onClick={() => setSelectedBookingModal(ride)}
                  className="bg-white border-2 border-[#0D47A1] hover:bg-[#E3F2FD]/30 rounded-2xl p-4 space-y-3 shadow-md cursor-pointer transition-all text-[#0D47A1]"
                >
                  <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                          ride.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : ride.status === 'CANCELLED' || ride.status === 'EXPIRED'
                            ? 'bg-rose-50 text-rose-600 border-rose-200'
                            : 'bg-[#E3F2FD] text-[#0D47A1] border-[#0D47A1] animate-pulse'
                        }`}
                      >
                        {ride.status}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">ID: {ride.id?.slice(0, 8)}</span>
                    </div>

                    <div className="text-[10px] text-slate-500 font-medium">{formatDate(ride.createdAt)}</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">User</div>
                      <div className="font-black text-[#0D47A1]">{ride.customerName}</div>
                      <div className="text-[10px] text-slate-500 font-medium">{ride.customerPhone || 'N/A'}</div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Driver</div>
                      <div className="font-black text-[#0D47A1]">{ride.driverName || 'Searching...'}</div>
                      <div className="text-[10px] text-slate-500 font-medium">{ride.driverVehicleInfo || 'Shuttle'}</div>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-700 bg-[#F8FAFC] p-2.5 rounded-xl border border-[#0D47A1]/30">
                    <div className="flex items-start gap-2">
                      <span className="text-[9px] font-mono font-bold text-white bg-[#0D47A1] px-1.5 py-0.5 rounded uppercase shrink-0">FROM</span>
                      <span className="truncate font-medium">{ride.pickup?.address}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-[9px] font-mono font-bold text-white bg-[#1565C0] px-1.5 py-0.5 rounded uppercase shrink-0">TO</span>
                      <span className="truncate font-medium">{ride.destination?.address}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW 4.4: OPERATIONAL ZONES GEOFENCE MANAGEMENT
         ========================================================================= */}
      {currentTab === 'zones' && (
        <ZoneManagement />
      )}

      {/* =========================================================================
          VIEW 4.5: DESIGNATED SHUTTLE STATIONS & GEOFENCING PIN MANAGEMENT
         ========================================================================= */}
      {currentTab === 'stations' && (
        <StationManagement />
      )}

      {/* =========================================================================
          VIEW 5: E-BIKES HARDWARE & RFID MANAGEMENT
         ========================================================================= */}
      {currentTab === 'ebikes' && (
        <EBikeManagement initialSubTab={ebikeSubTab} initialDriverId={targetRfidDriverId} />
      )}

      {/* =========================================================================
          VIEW 6: SHUTTLE SYSTEM SETTINGS CONFIGURATION
         ========================================================================= */}
      {currentTab === 'settings' && (
        <div className="space-y-5 max-w-xl pb-10">
          <h2 className="text-base font-black text-[#0D47A1] flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#0D47A1]" />
            <span>App Branding & System Settings</span>
          </h2>

          {/* CARD 1: APP BRANDING & LOGO MANAGEMENT */}
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-[#0D47A1]" />
                <h3 className="font-black text-sm text-[#0D47A1]">Application Logo & Branding</h3>
              </div>
              <span
                className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                  isCustomLogo
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {isCustomLogo ? 'Custom Logo Active' : 'Default Official Logo'}
              </span>
            </div>

            {/* Current Logo Preview */}
            <div className="flex items-center gap-4 bg-[#F8FAFC] p-3.5 rounded-2xl border-2 border-slate-200">
              <div className="relative w-20 h-20 bg-white rounded-2xl overflow-hidden border-2 border-[#0D47A1] shadow-md shrink-0 flex items-center justify-center p-1">
                <img
                  src={activeAppLogo}
                  onError={(e) => {
                    markLogoUrlAsFailed(activeAppLogo);
                    (e.target as HTMLImageElement).src = officialLogoFallback;
                  }}
                  alt="E-Shuttle Active Logo"
                  className="w-full h-full object-contain rounded-xl"
                />
              </div>

              <div className="space-y-1.5 flex-1 min-w-0">
                <h4 className="font-black text-xs text-[#0D47A1]">Current App Header Logo</h4>
                <p className="text-[10px] text-slate-500 leading-tight">
                  This logo is displayed across customer, driver, and admin portals, sign-in modals, and app headers.
                </p>
                {isCustomLogo && (
                  <p className="text-[9px] font-mono text-slate-400 truncate" title={fareSettings.appLogoUrl}>
                    URL: {fareSettings.appLogoUrl}
                  </p>
                )}
              </div>
            </div>

            {/* Upload Buttons */}
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-bold text-[#0D47A1]">Upload New Logo Image</label>
              
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex-1 min-w-[180px] py-3 px-4 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-xs shadow-md cursor-pointer active:scale-95 transition-all uppercase tracking-wider flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4 text-[#90CAF9]" />
                  <span>{logoUploading ? 'Uploading Image...' : 'Choose Logo File'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={logoUploading}
                    onChange={handleLogoUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>

                {isCustomLogo && (
                  <button
                    onClick={handleResetLogo}
                    disabled={logoUploading}
                    title="Restore default logo"
                    className="py-3 px-4 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-2xl font-bold text-xs active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Reset Logo</span>
                  </button>
                )}
              </div>
              
              <p className="text-[10px] text-slate-400 italic">
                Supported formats: PNG, JPG, WEBP, SVG (Max 5MB). Automatically uploads to Firebase Storage cloud bucket with fallback.
              </p>
            </div>

            {/* Status Feedback Alerts */}
            {logoSuccessMsg && (
              <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{logoSuccessMsg}</span>
              </div>
            )}

            {logoErrorMsg && (
              <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{logoErrorMsg}</span>
              </div>
            )}
          </div>

          {/* CARD 2: ADMIN PROFILE & USERNAME MANAGEMENT */}
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserCog className="w-5 h-5 text-[#0D47A1]" />
                <div>
                  <h3 className="font-black text-sm text-[#0D47A1]">Admin Profile & Credentials</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Manage Admin profile details and custom username for login</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-blue-100 text-[#0D47A1] border border-blue-200">
                Username Auth Active
              </span>
            </div>

            <form onSubmit={handleSaveAdminProfile} className="space-y-3">
              <div className="p-3 bg-[#E3F2FD] border border-[#0D47A1]/30 rounded-2xl text-xs text-[#0D47A1] space-y-1">
                <div className="flex items-center gap-1.5 font-black">
                  <ShieldCheck className="w-4 h-4 text-[#0D47A1]" />
                  <span>Custom Username Login</span>
                </div>
                <p className="text-[11px] text-[#0D47A1]/80">
                  You can set a custom username (e.g., <b>admin</b>, <b>superadmin</b>) so you can log into the platform without needing a Gmail address.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0D47A1]">Full Name</label>
                  <input
                    type="text"
                    required
                    value={profileFullName}
                    onChange={(e) => setProfileFullName(e.target.value)}
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:bg-white focus:outline-none focus:border-[#1565C0]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0D47A1]">Custom Username (for Login)</label>
                  <input
                    type="text"
                    required
                    placeholder="admin"
                    value={profileUsername}
                    onChange={(e) => setProfileUsername(e.target.value.trim().toLowerCase())}
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:bg-white focus:outline-none focus:border-[#1565C0]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0D47A1]">Account Email</label>
                  <input
                    type="email"
                    disabled
                    value={profileEmail}
                    className="w-full bg-slate-100 border-2 border-slate-300 text-slate-500 rounded-xl p-2.5 text-xs font-bold cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0D47A1]">Contact Phone</label>
                  <input
                    type="tel"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:bg-white focus:outline-none focus:border-[#1565C0]"
                  />
                </div>
              </div>

              {profileMsg && (
                <div
                  className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in ${
                    profileMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {profileMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{profileMsg.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={profileSaving}
                className="w-full py-3 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-xs shadow-md active:scale-95 transition-transform uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4 text-[#90CAF9]" />
                <span>{profileSaving ? 'Saving Profile...' : 'Save Admin Profile'}</span>
              </button>
            </form>
          </div>

          {/* CARD 3: CHANGE ADMIN PASSWORD */}
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#0D47A1]" />
                <div>
                  <h3 className="font-black text-sm text-[#0D47A1]">Change Admin Password</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Update password credentials for security</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleChangeAdminPassword} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0D47A1]">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    placeholder="Enter current password"
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono focus:bg-white focus:outline-none focus:border-[#1565C0] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-2.5 text-[#0D47A1] hover:text-[#1565C0]"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0D47A1]">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      required
                      placeholder="At least 6 characters"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono focus:bg-white focus:outline-none focus:border-[#1565C0] pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-3 top-2.5 text-[#0D47A1] hover:text-[#1565C0]"
                    >
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0D47A1]">Confirm New Password</label>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    placeholder="Re-enter new password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono focus:bg-white focus:outline-none focus:border-[#1565C0]"
                  />
                </div>
              </div>

              {passMsg && (
                <div
                  className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in ${
                    passMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {passMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{passMsg.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={passChanging}
                className="w-full py-3 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-xs shadow-md active:scale-95 transition-transform uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4 text-[#90CAF9]" />
                <span>{passChanging ? 'Updating Password...' : 'Update Admin Password'}</span>
              </button>
            </form>
          </div>

          {/* CARD 3: SHUTTLE SYSTEM PARAMETERS */}
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 space-y-4 shadow-xl">
            <h3 className="font-black text-sm text-[#0D47A1]">Shuttle Operation Parameters</h3>

            <div className="p-3 bg-[#E3F2FD] border border-[#0D47A1] rounded-2xl text-[#0D47A1] text-xs">
              <b className="text-[#0D47A1] block font-black">Free Shuttle Service (No Payment Needed)</b>
              Users ride free of charge. No payment gateway or fare collection required.
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#0D47A1]">Driver Search Radius (km)</label>
              <input
                type="number"
                value={fareSettings.initialSearchRadiusKm}
                onChange={(e) =>
                  setFareSettings({ ...fareSettings, initialSearchRadiusKm: Number(e.target.value) })
                }
                className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-sm text-[#0D47A1] font-bold focus:bg-white focus:outline-none focus:border-[#1565C0]"
              />
              <p className="text-[10px] text-slate-500 font-medium">Maximum distance to send pick-up requests to nearby drivers.</p>
            </div>

            {settingsSuccess && (
              <div className="p-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold text-center animate-in fade-in">
                Shuttle settings and media storage configuration saved successfully!
              </div>
            )}

            <button
              onClick={handleSaveSettings}
              disabled={settingsSaving}
              title="Save system parameters and secrets"
              className="w-full py-3.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-xs shadow-lg active:scale-95 transition-transform uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4 text-[#90CAF9]" />
              <span>{settingsSaving ? 'Saving Settings...' : 'Save All Settings & Secrets'}</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: CUSTOMER PROFILE & RIDE HISTORY
         ========================================================================= */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 max-w-lg w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-[#0D47A1]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0D47A1] text-white rounded-xl flex items-center justify-center font-bold text-sm shadow-sm">
                  {selectedCustomer.fullName?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0D47A1]">{selectedCustomer.fullName}</h3>
                  <p className="text-[10px] text-slate-500 font-medium">{selectedCustomer.email} • {selectedCustomer.phone}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-slate-400 hover:text-[#0D47A1] p-1 rounded-lg bg-[#E3F2FD] text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Ride History */}
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="text-xs font-bold uppercase text-slate-500">
                Pick-up & Drop-off History ({allBookings.filter((b) => b.customerId === selectedCustomer.uid).length} Trips)
              </div>

              {allBookings.filter((b) => b.customerId === selectedCustomer.uid).length === 0 ? (
                <p className="text-xs text-slate-500 italic">No trips recorded for this user yet.</p>
              ) : (
                <div className="space-y-2">
                  {allBookings
                    .filter((b) => b.customerId === selectedCustomer.uid)
                    .map((ride) => (
                      <div key={ride.id} className="bg-[#F8FAFC] p-3 rounded-xl border border-[#0D47A1]/30 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              ride.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-[#E3F2FD] text-[#0D47A1] font-bold border border-[#0D47A1]'
                            }`}
                          >
                            {ride.status}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatDate(ride.createdAt)}</span>
                        </div>
                        <div className="text-[#0D47A1] font-medium truncate">
                          {ride.pickup?.address} → {ride.destination?.address}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Assigned Driver: <strong className="text-[#0D47A1]">{ride.driverName || 'N/A'}</strong>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="pt-2 border-t border-[#0D47A1]/20 flex justify-between items-center gap-2">
              <button
                onClick={() => {
                  setDeleteConfirmTarget({
                    id: selectedCustomer.uid,
                    name: selectedCustomer.fullName,
                    role: 'customer',
                    email: selectedCustomer.email,
                  });
                }}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold uppercase flex items-center gap-1 transition-colors"
                title="Permanently remove passenger account from database"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Account</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">UID: {selectedCustomer.uid}</span>
                {selectedCustomer.accountStatus === 'SUSPENDED' ? (
                  <button
                    onClick={() => handleUpdateCustomerStatus(selectedCustomer.uid, 'APPROVED')}
                    title="Reactivate user account"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl uppercase shadow-sm"
                  >
                    Reactivate Account
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpdateCustomerStatus(selectedCustomer.uid, 'SUSPENDED')}
                    title="Suspend user account"
                    className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold text-xs rounded-xl uppercase"
                  >
                    Suspend Account
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: DRIVER PROFILE & EARNINGS / RIDE HISTORY
         ========================================================================= */}
      {selectedDriverModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 max-w-lg w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-[#0D47A1]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0D47A1] text-white rounded-xl flex items-center justify-center font-bold text-sm shadow-sm">
                  {selectedDriverModal.fullName?.charAt(0) || 'D'}
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0D47A1]">{selectedDriverModal.fullName}</h3>
                  <p className="text-[10px] text-slate-500 font-medium">{selectedDriverModal.email} • {selectedDriverModal.phone}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDriverModal(null)}
                className="text-slate-400 hover:text-[#0D47A1] p-1 rounded-lg bg-[#E3F2FD] text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Driver Specs & Zone Assignment */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-[#F8FAFC] p-3 rounded-2xl border border-[#0D47A1]/30">
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Vehicle Info</span>
                <span className="text-[#0D47A1] font-bold">{sanitizeVehicleInfo(selectedDriverModal.vehicleInfo)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase block">RFID Card ID</span>
                <span className="font-mono text-[#0D47A1] font-bold">
                  {selectedDriverModal.rfidCardUid || 'None Linked'}
                </span>
              </div>
              <div className="col-span-2 pt-1 border-t border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Assigned Operational Zone</span>
                <select
                  value={selectedDriverModal.zoneId || ''}
                  onChange={(e) => handleUpdateDriverZone(selectedDriverModal.uid, e.target.value)}
                  className="w-full p-2 bg-white border border-[#0D47A1] rounded-xl text-xs font-bold text-[#0D47A1] focus:outline-none"
                >
                  <option value="">-- No Zone Assigned --</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.code})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Driver will only receive booking requests generated within this zone.
                </p>
              </div>
            </div>

            {/* DRIVER'S LICENSE CARD VALIDATION SECTION */}
            <div className="bg-[#F8FAFC] p-3.5 rounded-2xl border-2 border-[#0D47A1]/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-[#0D47A1]" />
                  <span className="text-xs font-black text-[#0D47A1] uppercase tracking-wider">
                    Driver's License Card Validation
                  </span>
                </div>
                {selectedDriverModal.driverLicenseCardUrl ? (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Photo Uploaded
                  </span>
                ) : (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Pending Upload
                  </span>
                )}
              </div>

              {selectedDriverModal.driverLicenseNumber && (
                <div className="text-xs">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">License Number: </span>
                  <span className="font-mono font-bold text-[#0D47A1]">
                    {selectedDriverModal.driverLicenseNumber}
                  </span>
                </div>
              )}

              {selectedDriverModal.driverLicenseCardUrl ? (
                <div className="space-y-1.5">
                  <div
                    onClick={() => setLicensePreviewUrl(selectedDriverModal.driverLicenseCardUrl || null)}
                    className="relative w-full h-40 bg-slate-200 rounded-xl overflow-hidden border-2 border-[#0D47A1] cursor-pointer group shadow-sm"
                  >
                    <img
                      src={selectedDriverModal.driverLicenseCardUrl}
                      alt="Driver License Card"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-1">
                      <Eye className="w-4 h-4" />
                      <span>Click to Enlarge License Card</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLicensePreviewUrl(selectedDriverModal.driverLicenseCardUrl || null)}
                    className="w-full py-1.5 bg-[#E3F2FD] hover:bg-[#90CAF9]/40 text-[#0D47A1] border border-[#0D47A1] rounded-xl text-[10px] font-bold uppercase flex items-center justify-center gap-1 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Full Resolution License Card</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium text-center space-y-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mx-auto" />
                  <p className="font-bold">No Driver's License Card uploaded yet</p>
                  <p className="text-[10px] text-amber-700">
                    The driver registered prior to the license card requirement.
                  </p>
                </div>
              )}
            </div>

            {/* Ride History */}
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="text-xs font-bold uppercase text-slate-500">
                Completed Trips ({allBookings.filter((b) => b.driverId === selectedDriverModal.uid).length})
              </div>

              {allBookings.filter((b) => b.driverId === selectedDriverModal.uid).length === 0 ? (
                <p className="text-xs text-slate-500 italic">No completed trips recorded for this driver yet.</p>
              ) : (
                <div className="space-y-2">
                  {allBookings
                    .filter((b) => b.driverId === selectedDriverModal.uid)
                    .map((ride) => (
                      <div key={ride.id} className="bg-[#F8FAFC] p-3 rounded-xl border border-[#0D47A1]/30 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#0D47A1]">User: {ride.customerName}</span>
                          <span className="text-[10px] text-slate-400">{formatDate(ride.createdAt)}</span>
                        </div>
                        <div className="text-slate-600 text-[11px]">
                          {ride.pickup?.address} → {ride.destination?.address}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-[#0D47A1]/20 flex justify-between items-center gap-2">
              <button
                onClick={() => {
                  setDeleteConfirmTarget({
                    id: selectedDriverModal.uid,
                    name: selectedDriverModal.fullName,
                    role: 'driver',
                    email: selectedDriverModal.email,
                  });
                }}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold uppercase flex items-center gap-1 transition-colors"
                title="Permanently remove driver account from database"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Account</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setRfidModalDriver(selectedDriverModal);
                    setModalRfidInput(latestScannedRfid?.rfidUid || selectedDriverModal.rfidCardUid || '');
                    setSelectedDriverModal(null);
                  }}
                  title="Pair an RFID card to this driver account"
                  className="px-3 py-1.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-bold uppercase flex items-center gap-1 shadow-sm"
                >
                  <CreditCard className="w-3.5 h-3.5 text-[#90CAF9]" />
                  <span>Link RFID Card</span>
                </button>

                {selectedDriverModal.accountStatus === 'APPROVED' && (
                  <button
                    onClick={() => handleUpdateDriverStatus(selectedDriverModal.uid, 'SUSPENDED')}
                    title="Suspend driver privileges"
                    className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 font-bold text-xs rounded-xl uppercase"
                  >
                    Suspend
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: FULL RIDE ITINERARY DETAIL
         ========================================================================= */}
      {selectedBookingModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 text-[#0D47A1]">
            <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-3">
              <div>
                <h3 className="text-sm font-black text-[#0D47A1]">Trip Route & Details</h3>
                <p className="text-[10px] text-slate-400 font-mono">ID: {selectedBookingModal.id}</p>
              </div>
              <button
                onClick={() => setSelectedBookingModal(null)}
                className="text-slate-400 hover:text-[#0D47A1] p-1 rounded-lg bg-[#E3F2FD] text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center bg-[#F8FAFC] p-2.5 rounded-xl border border-[#0D47A1]/30">
                <span className="text-slate-500 font-bold uppercase text-[10px]">Status</span>
                <span className="font-black text-[#0D47A1] uppercase">{selectedBookingModal.status}</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase">User Info</span>
                <div className="font-black text-[#0D47A1]">{selectedBookingModal.customerName}</div>
                <div className="text-slate-500 text-[11px]">{selectedBookingModal.customerPhone || 'N/A'}</div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Assigned Driver</span>
                <div className="font-black text-[#0D47A1]">{selectedBookingModal.driverName || 'Unassigned'}</div>
                <div className="text-slate-500 text-[11px]">{selectedBookingModal.driverVehicleInfo || 'N/A'}</div>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-2xl border border-[#0D47A1]/30 space-y-1.5">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Route</div>
                <div className="text-[#0D47A1] font-bold truncate">Pickup: {selectedBookingModal.pickup?.address}</div>
                <div className="text-[#0D47A1] font-bold truncate">Dropoff: {selectedBookingModal.destination?.address}</div>
              </div>

              <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                <span>Requested: {formatDate(selectedBookingModal.createdAt)}</span>
                <span>Distance: {selectedBookingModal.distanceKm} km</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedBookingModal(null)}
              title="Close details dialog"
              className="w-full py-2.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-xs rounded-2xl uppercase tracking-wider shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: SEAMLESS DRIVER RFID PAIRING MODAL
         ========================================================================= */}
      {rfidModalDriver && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200 text-[#0D47A1]">
            <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-[#0D47A1] text-white rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0D47A1]">Link RFID Card to Driver</h3>
                  <p className="text-[10px] text-emerald-600 font-bold">✓ Account Approved & Active</p>
                </div>
              </div>
              <button
                onClick={() => setRfidModalDriver(null)}
                className="text-slate-400 hover:text-[#0D47A1] text-xs font-bold p-1 rounded-lg bg-[#E3F2FD] transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#F8FAFC] border border-[#0D47A1]/30 rounded-2xl p-3 text-xs space-y-1">
              <div className="font-bold text-[#0D47A1] flex items-center justify-between">
                <span>Driver: {rfidModalDriver.fullName}</span>
                <span className="text-[10px] text-slate-500 font-mono">{rfidModalDriver.phone}</span>
              </div>
              <div className="text-slate-500 text-[11px] truncate">{rfidModalDriver.email}</div>
            </div>

            {/* Live Hardware Scan Alert Banner */}
            {latestScannedRfid && (
              <div className="p-2.5 bg-[#E3F2FD] border border-[#0D47A1] rounded-2xl flex items-center justify-between text-xs text-[#0D47A1] shadow-sm animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#0D47A1] rounded-full animate-ping shrink-0" />
                  <span>
                    <strong>⚡ Card Scan:</strong> ID <code className="font-mono bg-white px-1.5 py-0.5 rounded text-[#0D47A1] font-bold border border-[#0D47A1]">{latestScannedRfid.rfidUid}</code>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalRfidInput(latestScannedRfid.rfidUid)}
                  className="text-[10px] bg-[#0D47A1] hover:bg-[#1565C0] text-white font-bold px-2 py-0.5 rounded-lg uppercase transition-colors shadow-sm"
                >
                  Auto-fill
                </button>
              </div>
            )}

            <form onSubmit={handleSaveRfidInModal} className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500">
                  Enter or Scan RFID Card Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., 47-10-CC-14 or A3-4F-89-12"
                  value={modalRfidInput}
                  onChange={(e) => setModalRfidInput(e.target.value)}
                  className="w-full mt-1 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-3 text-sm text-[#0D47A1] font-mono font-bold uppercase focus:outline-none focus:border-[#1565C0] focus:bg-white placeholder:text-slate-400"
                />
              </div>

              {/* Quick Fill Demo Tags */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Example Card Numbers:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalRfidInput('47-10-CC-14')}
                    className="px-2.5 py-1 bg-[#E3F2FD] border border-[#0D47A1] text-[#0D47A1] font-mono text-[10px] font-bold rounded-lg hover:bg-[#90CAF9]/40 transition-colors"
                  >
                    47-10-CC-14
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalRfidInput('8B-22-FA-01')}
                    className="px-2.5 py-1 bg-[#E3F2FD] border border-[#0D47A1] text-[#0D47A1] font-mono text-[10px] font-bold rounded-lg hover:bg-[#90CAF9]/40 transition-colors"
                  >
                    8B-22-FA-01
                  </button>
                </div>
              </div>

              {modalSuccessMsg && (
                <div className="p-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                  {modalSuccessMsg}
                </div>
              )}

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={modalPairing || !modalRfidInput}
                  className="w-full py-3 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-xs shadow-lg uppercase tracking-wider disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4 text-[#90CAF9]" />
                  <span>{modalPairing ? 'Linking Card...' : 'Link RFID Card'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (rfidModalDriver) {
                      setTargetRfidDriverId(rfidModalDriver.uid);
                      setEbikeSubTab('rfid');
                      setActiveTab('ebikes');
                      setRfidModalDriver(null);
                    }
                  }}
                  title="Navigate to E-Shuttles and RFID management panel"
                  className="w-full py-2.5 bg-[#E3F2FD] hover:bg-[#90CAF9]/40 text-[#0D47A1] border-2 border-[#0D47A1] rounded-2xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Open E-Shuttles & RFID Page</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 5.5: INCIDENTS & SUPPORT TICKETS MANAGEMENT
         ========================================================================= */}
      {currentTab === 'incidents' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Live 2-Way Helpdesk Support Channels Card Section */}
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#0D47A1] text-white flex items-center justify-center font-black shrink-0">
                  <Headphones className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-[#0D47A1]">
                    Live Helpdesk User Support Chats ({supportChannels.length})
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold">
                    2-Way Passenger & Driver Dispatch Support Threads
                  </p>
                </div>
              </div>
            </div>

            {supportChannels.length === 0 ? (
              <div className="text-center py-6 text-slate-400 space-y-1 bg-[#F8FAFC] rounded-2xl border border-dashed border-slate-200">
                <MessageSquare className="w-7 h-7 mx-auto text-slate-300" />
                <p className="text-xs font-bold text-slate-600">No active user support chats</p>
                <p className="text-[10px] text-slate-400">
                  User support chats will automatically appear here when passengers or drivers open Help Desk.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {supportChannels.map((c) => {
                  const unread = c.unreadCounts?.['admin'] || 0;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedTicketChannelId(c.id)}
                      className="p-3 bg-[#F8FAFC] hover:bg-[#E3F2FD] border-2 border-slate-200 hover:border-[#0D47A1] rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-2 shadow-sm"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-[#0D47A1] truncate">
                            {c.title || 'Support Chat'}
                          </span>
                          {unread > 0 && (
                            <span className="px-2 py-0.5 bg-rose-600 text-white font-black text-[9px] rounded-full animate-pulse shrink-0">
                              {unread} NEW
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 font-medium truncate">
                          {c.lastMessage || 'Channel active'}
                        </p>
                        <p className="text-[9px] text-slate-400 font-bold">
                          {c.updatedAt ? new Date(c.updatedAt).toLocaleString() : ''}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTicketChannelId(c.id);
                        }}
                        className="px-3 py-1.5 bg-[#0D47A1] text-white font-black text-xs rounded-xl shadow shrink-0 hover:bg-[#1565C0] flex items-center gap-1 active:scale-95 transition-transform"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Chat</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ticket Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {[
              { id: 'ALL', label: `All (${incidentTickets.length})` },
              { id: 'open', label: `Open (${incidentTickets.filter((t) => t.status === 'open').length})` },
              { id: 'in_progress', label: `In Progress (${incidentTickets.filter((t) => t.status === 'in_progress').length})` },
              { id: 'resolved', label: `Resolved (${incidentTickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setTicketStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-colors shrink-0 ${
                  ticketStatusFilter === f.id
                    ? 'bg-[#0D47A1] text-white shadow-md'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Tickets List */}
          <div className="space-y-3">
            {incidentTickets.filter((t) => {
              if (ticketStatusFilter === 'ALL') return true;
              if (ticketStatusFilter === 'resolved') return t.status === 'resolved' || t.status === 'closed';
              return t.status === ticketStatusFilter;
            }).length === 0 ? (
              <div className="bg-white border-2 border-slate-200 rounded-3xl p-10 text-center text-slate-400 space-y-2">
                <ShieldAlert className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-600">No incident tickets matching filter</p>
              </div>
            ) : (
              incidentTickets
                .filter((t) => {
                  if (ticketStatusFilter === 'ALL') return true;
                  if (ticketStatusFilter === 'resolved') return t.status === 'resolved' || t.status === 'closed';
                  return t.status === ticketStatusFilter;
                })
                .map((ticket) => {
                  const catInfo = INCIDENT_CATEGORIES[ticket.category] || INCIDENT_CATEGORIES.other;

                  return (
                    <div
                      key={ticket.id}
                      className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 shadow-md space-y-3"
                    >
                      {/* Ticket Header Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black bg-[#0D47A1] text-white px-2.5 py-1 rounded-xl">
                            #{ticket.ticketNumber}
                          </span>
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl uppercase ${catInfo.color}`}>
                            {catInfo.icon} {catInfo.label}
                          </span>
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                              ticket.priority === 'emergency'
                                ? 'bg-rose-600 text-white font-black animate-pulse'
                                : ticket.priority === 'high'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {ticket.priority} Priority
                          </span>
                        </div>

                        {/* Ticket Status Controls */}
                        <div className="flex items-center gap-1.5">
                          <select
                            value={ticket.status}
                            onChange={(e) => updateTicketStatus(ticket.id, e.target.value as any)}
                            className="bg-slate-50 border-2 border-[#0D47A1] text-[#0D47A1] font-black text-xs rounded-xl px-2.5 py-1 focus:outline-none"
                          >
                            <option value="open">OPEN</option>
                            <option value="in_progress">IN PROGRESS</option>
                            <option value="resolved">RESOLVED</option>
                            <option value="closed">CLOSED</option>
                          </select>

                          <button
                            onClick={() => setSelectedTicketChannelId(ticket.channelId)}
                            className="px-3 py-1 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-xs rounded-xl shadow flex items-center gap-1"
                            title="Open 2-Way Chat Channel"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>2-Way Chat</span>
                          </button>
                        </div>
                      </div>

                      {/* Ticket Summary Body */}
                      <div className="space-y-1.5 text-xs">
                        <h3 className="font-black text-sm text-[#0D47A1]">{ticket.subject}</h3>
                        <p className="text-slate-700 font-semibold bg-[#F8FAFC] p-3 rounded-2xl border border-slate-200 leading-relaxed whitespace-pre-line">
                          {ticket.description}
                        </p>
                      </div>

                      {/* Reporter & Metadata Details */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-bold text-slate-500">
                        <div className="flex items-center gap-3">
                          <span>
                            Reporter: <strong className="text-[#0D47A1]">{ticket.reporterName}</strong> ({ticket.reporterRole})
                          </span>
                          {ticket.locationAddress && (
                            <span>
                              Location: <strong className="text-slate-700">{ticket.locationAddress}</strong>
                            </span>
                          )}
                          {ticket.vehicleInfo && (
                            <span>
                              Shuttle #: <strong className="text-slate-700">{ticket.vehicleInfo}</strong>
                            </span>
                          )}
                        </div>

                        <span className="text-slate-400">
                          Filed: {new Date(ticket.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 7: ACTIVITY AUDIT LOGS & CRUD BACKTRACKING
         ========================================================================= */}
      {(currentTab === 'logs' || currentTab === 'audit') && (
        <ActivityLogsView
          onOpenTutorial={() => {
            setTutorialInitialStep(6);
            setIsTutorialOpen(true);
          }}
        />
      )}

      {/* Bottom Clearance Spacer for Fixed Navigation Bar */}
      <div className="h-32 w-full shrink-0" />

      {/* Direct Ticket & Direct User 2-Way Chat Drawer */}
      {(selectedTicketChannelId || directChatTarget) && (
        <ChatDrawer
          isOpen={!!(selectedTicketChannelId || directChatTarget)}
          onClose={() => {
            setSelectedTicketChannelId(null);
            setDirectChatTarget(null);
          }}
          initialChannelId={selectedTicketChannelId}
          initialTargetUser={directChatTarget || undefined}
        />
      )}

      {/* FULL RESOLUTION DRIVER'S LICENSE CARD LIGHTBOX MODAL */}
      {licensePreviewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 max-w-2xl w-full shadow-2xl space-y-3 my-auto text-[#0D47A1] relative">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#0D47A1]" />
                <h3 className="text-sm font-black text-[#0D47A1]">Driver's License Card Validation Photo</h3>
              </div>
              <button
                type="button"
                onClick={() => setLicensePreviewUrl(null)}
                className="w-8 h-8 bg-[#E3F2FD] hover:bg-[#0D47A1] text-[#0D47A1] hover:text-white rounded-full flex items-center justify-center font-bold text-xs transition-colors"
                title="Close photo viewer"
              >
                ✕
              </button>
            </div>

            <div className="relative w-full max-h-[70vh] overflow-auto bg-slate-900 rounded-2xl flex items-center justify-center p-2 border border-slate-300">
              <img
                src={licensePreviewUrl}
                alt="Driver License Full Quality"
                className="max-w-full max-h-[65vh] object-contain rounded-lg"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-slate-500 font-medium">
                Official E-Shuttle Driver Document - Admin Validation View
              </span>
              <button
                type="button"
                onClick={() => setLicensePreviewUrl(null)}
                className="px-4 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-xs rounded-xl shadow uppercase tracking-wider"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAQs, Route Specs, History & Developer Team Info Modal */}
      <FaqAboutModal
        isOpen={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
      />

      {/* MODAL: CREATE ACCOUNT (PASSENGER, DRIVER, ADMIN) */}
      {showCreateAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-[#0D47A1]">
            <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-[#0D47A1] text-white rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0D47A1]">Create New Account</h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Provision accounts directly from the Administrator Console
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateAccountModal(false);
                  setCreateError(null);
                }}
                className="w-8 h-8 bg-[#E3F2FD] hover:bg-[#0D47A1] text-[#0D47A1] hover:text-white rounded-full flex items-center justify-center font-bold text-xs transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Role Switcher */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
                Select Account Role:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCreateRole('customer')}
                  className={`py-2 px-2 rounded-xl text-xs font-black uppercase flex flex-col items-center gap-1 border transition-all ${
                    createRole === 'customer'
                      ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Passenger</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCreateRole('driver')}
                  className={`py-2 px-2 rounded-xl text-xs font-black uppercase flex flex-col items-center gap-1 border transition-all ${
                    createRole === 'driver'
                      ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Driver</span>
                </button>
              </div>
            </div>

            {createError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAccountSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Juan Dela Cruz"
                    value={createFullName}
                    onChange={(e) => setCreateFullName(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    {createEmail.trim().length > 0 && !getEmailValidationError(createEmail.trim()) && (
                      <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Valid email
                      </span>
                    )}
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="user@domain.com"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className={`w-full bg-[#F8FAFC] border rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:outline-none transition-colors ${
                      createEmail.trim().length > 0 && getEmailValidationError(createEmail.trim())
                        ? 'border-rose-400 focus:border-rose-500 bg-rose-50/20 text-rose-800'
                        : createEmail.trim().length > 0
                        ? 'border-emerald-500 text-[#0D47A1]'
                        : 'border-[#0D47A1] text-[#0D47A1]'
                    }`}
                  />
                  {createEmail.trim().length > 0 && getEmailValidationError(createEmail.trim()) && (
                    <p className="text-[10px] text-rose-600 flex items-start gap-1 font-semibold leading-tight mt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{getEmailValidationError(createEmail.trim())}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+63 900 000 0000"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:bg-white focus:outline-none"
                  />
                </div>

                {createRole === 'driver' && (
                  <>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Assigned Operational Zone</label>
                      <select
                        value={createZoneId}
                        onChange={(e) => setCreateZoneId(e.target.value)}
                        className="w-full bg-[#F8FAFC] border border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:bg-white focus:outline-none"
                      >
                        <option value="">-- No Zone (All Zones) --</option>
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name} ({z.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Vehicle Info / Model</label>
                      <input
                        type="text"
                        placeholder="e.g., E-Shuttle Unit #12"
                        value={createVehicleInfo}
                        onChange={(e) => setCreateVehicleInfo(e.target.value)}
                        className="w-full bg-[#F8FAFC] border border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Driver License Number</label>
                      <input
                        type="text"
                        placeholder="e.g., DL-987654"
                        value={createLicenseNumber}
                        onChange={(e) => setCreateLicenseNumber(e.target.value)}
                        className="w-full bg-[#F8FAFC] border border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Pair RFID Card UID (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g., 5A4C32FF (leave blank to link later)"
                        value={createRfidUid}
                        onChange={(e) => setCreateRfidUid(e.target.value)}
                        className="w-full bg-[#F8FAFC] border border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono font-bold focus:bg-white focus:outline-none uppercase"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateAccountModal(false);
                    setCreateError(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAccount}
                  className="px-5 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-xs rounded-xl uppercase tracking-wider flex items-center gap-1.5 shadow-md disabled:opacity-50 active:scale-95 transition-all"
                >
                  {creatingAccount ? (
                    <span>Creating Account...</span>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Create {createRole === 'driver' ? 'Driver' : 'Passenger'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE ACCOUNT CONFIRMATION */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-rose-500 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-slate-800">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-rose-700 uppercase tracking-wide">
                  Delete {deleteConfirmTarget.role.toUpperCase()} Account
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Irreversible administrative action
                </p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 space-y-2 text-xs text-rose-900">
              <p className="font-bold">Are you sure you want to permanently delete this account?</p>
              <div className="bg-white/80 p-2.5 rounded-xl border border-rose-200 space-y-1">
                <div className="font-black text-[#0D47A1] text-sm">{deleteConfirmTarget.name}</div>
                <div className="text-[11px] text-slate-600 font-mono">
                  Role: <span className="font-bold uppercase text-rose-700">{deleteConfirmTarget.role}</span>
                  {deleteConfirmTarget.email && ` • ${deleteConfirmTarget.email}`}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">ID: {deleteConfirmTarget.id}</div>
              </div>
              <p className="text-[11px] text-rose-700 font-medium">
                This record will be permanently purged from the database, and this deletion event will be recorded in the system audit logs.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                disabled={deletingAccount}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl uppercase tracking-wider flex items-center gap-1.5 shadow-md disabled:opacity-50 active:scale-95 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deletingAccount ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Administrator Tutorial, Backtracking Masterclass & Cheat Sheet */}
      <AdminTutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        onNavigateTab={(tab) => setActiveTab(tab)}
        initialStepIndex={tutorialInitialStep}
      />
    </div>
  );
};
