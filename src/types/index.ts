export type UserRole = 'customer' | 'driver' | 'admin';

export type AccountStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export type DriverAvailability = 'OFFLINE' | 'ONLINE' | 'BUSY';

export type BookingStatus =
  | 'SEARCHING'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_ARRIVING'
  | 'DRIVER_ARRIVED'
  | 'RIDE_STARTED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface LocationPoint {
  latitude: number;
  longitude: number;
  address: string;
  updatedAt?: string | number;
}

export const SECURITY_QUESTIONS = [
  'What was the name of your first elementary school?',
  'In what city or municipality were you born?',
  'What was your childhood nickname?',
  'What was the name of your first pet?',
  'What is the street name where you grew up?',
  'What was the brand or model of your first bicycle or car?',
] as const;

export type SecurityQuestion = (typeof SECURITY_QUESTIONS)[number];

export interface UserProfile {
  uid: string;
  role: UserRole;
  fullName: string;
  email: string;
  username?: string;
  phone: string;
  photoURL?: string;
  accountStatus: AccountStatus;
  suspendedUntil?: number | null;
  securityQuestion?: string;
  securityAnswer?: string;
  createdAt: any;
  updatedAt: any;
}

export interface DriverProfile {
  uid: string;
  role: 'driver';
  fullName: string;
  email: string;
  phone: string;
  photoURL?: string;
  accountStatus: AccountStatus;
  suspendedUntil?: number | null;
  availability: DriverAvailability;
  vehicleType: string; // e.g., "E-Shuttle Transit"
  vehicleInfo: string; // e.g., "EcoGlide-X (Plate #EB-9042)"
  zoneId?: string | null; // Assigned operational zone
  zoneName?: string | null;
  rfidCardUid?: string; // Tag UID assigned to driver e.g. "A3-4F-89-12"
  driverLicenseCardUrl?: string; // Driver's license card picture for admin validation
  driverLicenseNumber?: string; // Optional Driver's License Number
  securityQuestion?: string;
  securityAnswer?: string;
  activeEbikeId?: string | null; // Device ID of the e-shuttle currently taken over by driver
  disconnectNotice?: string | null; // Alert message when driver is automatically logged out/disconnected by a new RFID tap
  currentLocation?: LocationPoint;
  activeBookingId?: string | null;
  rating?: number;
  totalRides?: number;
  createdAt: any;
  updatedAt: any;
}

export type EBikeStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE';

export interface EBikeDevice {
  deviceId: string; // Unique ESP32 Device Identifier, e.g., "ESP32-EBIKE-001"
  serialNumber: string; // E-Shuttle Plate Number, e.g., "EB-88402-X"
  name: string; // E-Shuttle Name e.g. "E-Shuttle #1"
  zoneId?: string | null; // Registered operational zone
  zoneName?: string | null;
  status: EBikeStatus;
  currentDriverId?: string | null;
  currentDriverName?: string | null;
  currentDriverPhone?: string | null;
  lastRfidCardUid?: string | null;
  lastRfidTapTime?: string | null;
  location?: LocationPoint;
  speedKmH?: number;
  lastSeen?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface Booking {
  id?: string;
  zoneId?: string; // Operating Zone ID for this trip
  zoneName?: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  driverVehicleInfo?: string | null;
  driverLocation?: LocationPoint | null;
  status: BookingStatus;
  pickup: LocationPoint;
  destination: LocationPoint;
  distanceKm: number;
  estimatedDurationMinutes: number;
  estimatedFare: number;
  createdAt: any;
  acceptedAt?: any;
  driverArrivedAt?: any;
  startedAt?: any;
  completedAt?: any;
  cancelledAt?: any;
  rating?: number;
  comment?: string;
}

export interface RideHistoryItem {
  id: string;
  bookingId: string;
  customerId: string;
  customerName?: string;
  driverId: string;
  driverName?: string;
  driverVehicleInfo?: string;
  pickup: LocationPoint;
  destination: LocationPoint;
  distanceKm: number;
  durationMinutes: number;
  fare: number;
  startedAt: any;
  completedAt: any;
  createdAt: any;
  rating?: number;
}

export interface AdminSettings {
  baseFare: number;
  pricePerKm: number;
  minimumFare: number;
  initialSearchRadiusKm: number;
  maxServiceRadiusKm?: number;
  appLogoUrl?: string;
  mediaStorageBucket?: string;
  updatedAt?: any;
}

export interface LocationOption {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export type StationCategory = 'terminal' | 'campus_gate' | 'building' | 'hub' | 'stop' | 'dropoff_point';
export type StationAllowedType = 'both' | 'pickup_only' | 'dropoff_only';

export interface OperationalZone {
  id: string;
  name: string; // e.g. "Tagaytay City Hall Complex" or "Tagaytay City National High School"
  code: string; // e.g. "tagaytay-city-hall" or "tagaytay-city-nhs"
  description?: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusMeters?: number; // Service boundary radius in meters (e.g. 1500m)
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface ShuttleStation {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number; // Allowed tagging/pickup proximity radius in meters (e.g. 200m)
  zoneId?: string; // ID of the parent OperationalZone this station belongs to
  zoneName?: string;
  isActive: boolean;
  allowedType?: StationAllowedType; // 'both' | 'pickup_only' | 'dropoff_only' (default: 'both')
  allowPickup?: boolean; // default true
  allowDropoff?: boolean; // default true
  category?: StationCategory;
  description?: string;
  createdAt?: any;
  updatedAt?: any;
}
