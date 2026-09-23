# E-Shuttle Production Data & Functional Testing Checklist

This checklist is designed to verify that the E-Shuttle transit system runs on real production data with complete functional integrity, end-to-end security, and strict privacy boundaries across all roles.

---

## 1. Authentication & Role-Based Access Control (RBAC)

- [ ] **Customer Sign-Up & Sign-In**
  - Register with a valid email, phone number, and password.
  - Verify real-time profile persistence in Firestore (`users` collection).
  - Verify immediate redirection to the Passenger Booking View.
- [ ] **Driver Sign-Up & Verification**
  - Register with valid Philippine Driver's License format (`A00-00-000000`) and assigned Zone.
  - Test OCR automated pre-check on uploaded driver's license ID.
  - Confirm account starts in `PENDING` status until authorized by an Administrator.
- [ ] **Administrator Access & Secret PIN Protection**
  - Sign in with verified administrative credentials.
  - Verify prompt and validation of the 6-digit Admin Master/Action PIN before executing critical operations (suspensions, deletions, zone edits, fare updates).
- [ ] **Session Security & Auto-Timeout**
  - Confirm inactivity timeout triggers after configured idle window.
  - Verify password expiration warnings and force-change workflows.

---

## 2. Private 1-on-1 Chat Architecture & Privacy Boundaries

- [ ] **Passenger <-> Assigned Driver Private Coordination**
  - Request a ride as Passenger; Driver accepts the ride.
  - Open ride chat drawer as Passenger and send a message.
  - Verify instant real-time synchronization on Driver's screen.
  - Verify quick suggestion chips render appropriately for both roles.
- [ ] **Strict Admin Privacy Boundary (CRITICAL)**
  - Open Admin Dashboard -> Dispatch & Support Chats.
  - Confirm Admin **CANNOT** view, query, or intercept private Passenger-Driver ride chats.
  - Verify Firestore security rules and client query filters strictly isolate ride channels from Admin inbox.
- [ ] **Post-Dropoff Read-Only Lock**
  - Complete the ride (Driver taps "Complete Drop-off").
  - Open ride chat as Passenger and Driver.
  - Verify chat is locked with "Trip completed — chat unavailable" notice.
- [ ] **Support Desk & Admin Dispatch Channels**
  - Passenger clicks "Support Desk" -> initiates direct support chat with Admin.
  - Driver clicks "Admin Dispatch" -> initiates direct driver support channel.
  - Verify Admin receives instant badge notification in "Dispatch & Support Chats".
  - Verify two-way messaging works seamlessly between user/driver and Admin.

---

## 3. Account Suspension Enforcement & Investigation Appeal Portal

- [ ] **Admin Account Suspension**
  - In Admin Dashboard -> User & Driver Accounts, select an account and click "Suspend".
  - Select duration (e.g., 7 days, 30 days, or custom) and confirm with Secret PIN.
- [ ] **Suspended Account UI Lock**
  - Log in with the suspended account.
  - Verify all booking/driving controls are completely blocked.
  - Verify the red "Account Suspended" Investigation Portal renders with reason and time remaining.
- [ ] **Investigation Chat with Admin**
  - Click "Chat with Admin" inside the Suspended Portal.
  - Verify real-time drawer opens and messages are sent directly to Admin support.
  - On Admin Dashboard -> Incidents / Support Chats, verify Admin can open the investigation chat and reply directly.
- [ ] **Formal Appeal Submission & Reinstatement**
  - Submit formal appeal statement in the Suspended Portal.
  - Verify appeal ticket appears in Admin Dashboard -> Safety & Incident Reports -> Account Suspension Appeals.
  - Admin clicks "Investigation Chat" or "Reactivate/Lift Suspension".
  - Confirm suspended account instantly regains full operational access upon approval.

---

## 4. Operational Zones & Station Filtering

- [ ] **Zone Selection & Auto-Detection**
  - Verify active operational zones load dynamically from Firestore (`operational_zones`).
  - Switch between zones (e.g., Tagaytay City Hall vs High School Campus).
- [ ] **Strict Station Isolation by Zone**
  - Open "Select Pick-up Station" modal.
  - Verify that only stations belonging to the active operational zone are listed.
  - Verify "Select Destination Station" also restricts stops to the active operational zone.
- [ ] **Physical GPS Geofence Verification**
  - Test booking when outside the 100m station catchment radius -> verify warning banner blocks booking.
  - Test "Snap to Nearest Station" button -> confirms closest designated stop within the zone.
  - Move within station radius -> confirm "Location Verified" green indicator appears.

---

## 5. E-Bike Hardware, RFID Pairing & Driver Online Requirements

- [ ] **RFID UID Validation & Hardware Pairing**
  - In Admin Dashboard -> E-Shuttle Fleet -> RFID Scanner Pairing.
  - Test card pairing with 8 to 14 hex character format (e.g., `A1B2C3D4`).
  - Verify card is linked to specific E-Bike and Driver profile.
- [ ] **Driver Online Pre-Flight Checklist**
  - Driver toggles status to "ONLINE".
  - System verifies:
    1. Account is `APPROVED` (not suspended or pending).
    2. Assigned E-Bike hardware ID is active.
    3. Assigned operational zone matches current coordinates.
  - If any condition fails, driver is blocked from going online with a clear descriptive prompt.

---

## 6. Live Ride Lifecycle & Real-Time Tracking

- [ ] **Ride Creation & Proximity Broadcast**
  - Customer selects valid Pickup and Destination within the active zone.
  - Click "Request Shuttle".
  - Verify booking is created in Firestore with status `REQUESTED`.
  - Nearby online drivers in the matching zone receive instant ride notification.
- [ ] **Driver Acceptance & 300-Meter Proximity Alert**
  - Driver accepts ride -> status transitions to `DRIVER_ASSIGNED` -> `DRIVER_ARRIVING`.
  - When driver GPS moves within 300m of pickup point, verify customer receives:
    - Audio chime
    - Haptic vibration pattern
    - Native push notification / banner alert
- [ ] **Ride Start & Live Route Trajectory**
  - Driver taps "Start Ride" after passenger boards.
  - Status updates to `RIDE_STARTED`.
  - Map draws live polyline between current location and destination stop.
- [ ] **Ride Completion & Driver Rating**
  - Driver taps "Complete Drop-off" at destination.
  - Status transitions to `COMPLETED`.
  - Customer receives rating modal to submit 1–5 stars with feedback.
  - Driver's aggregate rating and total ride count update in Firestore.

---

## 7. Audit Logging & Security Operations

- [ ] **System Activity Audit Trail**
  - Perform key admin actions (fare change, zone update, account suspension, driver deletion).
  - Open Admin Dashboard -> System Audit & Logs.
  - Verify every action is logged with timestamp, administrator ID, entity ID, and severity level.
- [ ] **Clean Production UI**
  - Confirm no raw database UUIDs or unformatted keys appear anywhere in user-facing views.
  - Verify all distance, time, currency, and date formats are human-readable.
