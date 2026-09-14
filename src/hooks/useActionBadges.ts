import { useState, useEffect } from 'react';
import { collection, query, where, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserRole, UserProfile } from '../types';
import { subscribeToUserChannels } from '../services/chatService';

export interface ActionDotsMap {
  [tabName: string]: boolean;
}

export function useActionBadges(currentUser: { uid?: string; phone?: string } | null | undefined, role: UserRole | null) {
  const [actionDots, setActionDots] = useState<ActionDotsMap>({});

  useEffect(() => {
    if (!role) {
      setActionDots({});
      return;
    }

    const currentUserId = role === 'admin' ? 'admin' : (currentUser?.uid || '');
    const currentUserRole = role;

    let unsubChat: (() => void) | null = null;
    let unsubBookings: (() => void) | null = null;
    let unsubDriverProfile: (() => void) | null = null;
    let unsubAdminDrivers: (() => void) | null = null;
    let unsubAdminTickets: (() => void) | null = null;
    let unsubAdminBookings: (() => void) | null = null;
    let unsubAdminEbikes: (() => void) | null = null;

    // 1. Chat Unread Messages Listener (Applies to ALL roles)
    if (currentUserId) {
      unsubChat = subscribeToUserChannels(currentUserId, currentUserRole, (channels) => {
        const totalUnread = channels.reduce((acc, c) => {
          const uMain = c.unreadCounts?.[currentUserId] || 0;
          const uAdminExtra =
            role === 'admin' && currentUser?.uid && currentUser.uid !== 'admin'
              ? c.unreadCounts?.[currentUser.uid] || 0
              : 0;
          return acc + uMain + uAdminExtra;
        }, 0);

        setActionDots((prev) => ({
          ...prev,
          support: totalUnread > 0,
          ...(role === 'admin' ? { incidents: (prev.incidents || false) || totalUnread > 0 } : {}),
        }));
      });
    }

    // 2. Customer Specific Action Dots
    if (role === 'customer' && currentUser?.uid) {
      // Incomplete customer profile check
      const isProfileIncomplete = !currentUser.phone || currentUser.phone.trim() === '';
      setActionDots((prev) => ({ ...prev, profile: isProfileIncomplete }));

      // Customer Bookings Listener
      const qCustomerBookings = query(
        collection(db, 'bookings'),
        where('customerId', '==', currentUser.uid)
      );

      unsubBookings = onSnapshot(
        qCustomerBookings,
        (snapshot) => {
          let hasActiveRide = false;
          let hasUnratedRide = false;

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const status = data.status;
            if (['SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'RIDE_STARTED'].includes(status)) {
              hasActiveRide = true;
            }
            if (status === 'COMPLETED' && (!data.rating || data.rating === 0)) {
              hasUnratedRide = true;
            }
          });

          setActionDots((prev) => ({
            ...prev,
            home: hasActiveRide,
            history: hasUnratedRide,
          }));
        },
        (err) => {
          console.warn('ActionBadges customer bookings listener notice:', err);
        }
      );
    }

    // 3. Driver Specific Action Dots
    if (role === 'driver' && currentUser?.uid) {
      // Driver Profile & Approval Listener
      unsubDriverProfile = onSnapshot(
        doc(db, 'drivers', currentUser.uid),
        (docSnap) => {
          if (docSnap.exists()) {
            const dData = docSnap.data();
            const needsProfileCard = !dData.driverLicenseCardUrl || dData.driverLicenseCardUrl.trim() === '';
            const needsRfid = !dData.rfidCardUid || dData.rfidCardUid.trim() === '';
            const isPending = dData.accountStatus === 'PENDING';

            setActionDots((prev) => ({
              ...prev,
              profile: needsProfileCard || needsRfid || isPending,
            }));
          }
        },
        (err) => {
          console.warn('ActionBadges driver profile listener notice:', err);
        }
      );

      // Driver Bookings Listener
      const qDriverBookings = query(
        collection(db, 'bookings'),
        where('driverId', '==', currentUser.uid)
      );

      unsubBookings = onSnapshot(
        qDriverBookings,
        (snapshot) => {
          let hasActiveDuty = false;
          snapshot.forEach((docSnap) => {
            const status = docSnap.data().status;
            if (['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'RIDE_STARTED'].includes(status)) {
              hasActiveDuty = true;
            }
          });

          setActionDots((prev) => ({
            ...prev,
            home: hasActiveDuty,
          }));
        },
        (err) => {
          console.warn('ActionBadges driver bookings listener notice:', err);
        }
      );
    }

    // 4. Admin Specific Action Dots
    if (role === 'admin') {
      // Admin Driver Approvals Listener
      unsubAdminDrivers = onSnapshot(
        collection(db, 'drivers'),
        (snapshot) => {
          let hasPendingDrivers = false;
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.accountStatus === 'PENDING' || !data.rfidCardUid) {
              hasPendingDrivers = true;
            }
          });

          setActionDots((prev) => ({
            ...prev,
            users: hasPendingDrivers,
            customers: hasPendingDrivers,
            drivers: hasPendingDrivers,
            dashboard: hasPendingDrivers || (prev.incidents || false) || (prev.rides || false),
          }));
        },
        (err) => {
          console.warn('ActionBadges admin drivers listener notice:', err);
        }
      );

      // Admin Incident Tickets Listener
      unsubAdminTickets = onSnapshot(
        collection(db, 'incidentTickets'),
        (snapshot) => {
          let hasOpenTickets = false;
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.status === 'open' || data.status === 'in_progress') {
              hasOpenTickets = true;
            }
          });

          setActionDots((prev) => ({
            ...prev,
            incidents: hasOpenTickets || (prev.support || false),
            dashboard: (prev.users || false) || hasOpenTickets || (prev.rides || false),
          }));
        },
        (err) => {
          console.warn('ActionBadges admin tickets listener notice:', err);
        }
      );

      // Admin Unassigned Trips Listener
      unsubAdminBookings = onSnapshot(
        collection(db, 'bookings'),
        (snapshot) => {
          let hasUnassignedTrips = false;
          snapshot.forEach((docSnap) => {
            const status = docSnap.data().status;
            if (status === 'REQUESTED' || status === 'SEARCHING') {
              hasUnassignedTrips = true;
            }
          });

          setActionDots((prev) => ({
            ...prev,
            rides: hasUnassignedTrips,
            dashboard: (prev.users || false) || (prev.incidents || false) || hasUnassignedTrips,
          }));
        },
        (err) => {
          console.warn('ActionBadges admin bookings listener notice:', err);
        }
      );

      // Admin Shuttles Telemetry & Maintenance Listener
      unsubAdminEbikes = onSnapshot(
        collection(db, 'ebikes'),
        (snapshot) => {
          let hasShuttleAlert = false;
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.status === 'MAINTENANCE') {
              hasShuttleAlert = true;
            }
          });

          setActionDots((prev) => ({
            ...prev,
            ebikes: hasShuttleAlert,
          }));
        },
        (err) => {
          console.warn('ActionBadges admin ebikes listener notice:', err);
        }
      );
    }

    return () => {
      if (unsubChat) unsubChat();
      if (unsubBookings) unsubBookings();
      if (unsubDriverProfile) unsubDriverProfile();
      if (unsubAdminDrivers) unsubAdminDrivers();
      if (unsubAdminTickets) unsubAdminTickets();
      if (unsubAdminBookings) unsubAdminBookings();
      if (unsubAdminEbikes) unsubAdminEbikes();
    };
  }, [currentUser, role]);

  return actionDots;
}
