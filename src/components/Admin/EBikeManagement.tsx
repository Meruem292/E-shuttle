import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { EBikeDevice, EBikeStatus, DriverProfile, OperationalZone } from '../../types';
import {
  Bike,
  CreditCard,
  Cpu,
  Code2,
  MapPin,
  Layers,
  Edit2,
  Trash2,
  Save,
  X,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Sliders,
} from 'lucide-react';
import { AdminEBikeMap } from './AdminEBikeMap';
import { useBackHandler } from '../../contexts/NativeBackContext';
import {
  subscribeToEBikes,
  registerEBike,
  updateEBike,
  deleteEBike,
  pairDriverRfidCard,
  processRfidTapEvent,
  updateEBikeGpsLocation,
  autoResolveRfidAssignment,
  subscribeToAdminRegistrationRfid,
  sendAdminRegistrationScan,
} from '../../services/ebikeService';
import { listenToOperationalZones } from '../../services/zoneService';
import { useAdminPin } from '../../contexts/AdminPinContext';
import { useToast } from '../../contexts/ToastContext';

interface EBikeManagementProps {
  initialSubTab?: 'map' | 'shuttles' | 'rfid' | 'simulator' | 'esp32_code';
  initialDriverId?: string | null;
}

export const EBikeManagement: React.FC<EBikeManagementProps> = ({
  initialSubTab = 'shuttles',
  initialDriverId = null,
}) => {
  const { promptAdminPin } = useAdminPin();
  const toast = useToast();
  const [ebikes, setEbikes] = useState<EBikeDevice[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [zones, setZones] = useState<OperationalZone[]>([]);
  const [activeTab, setActiveTab] = useState<'map' | 'shuttles' | 'rfid' | 'simulator' | 'esp32_code'>(
    initialSubTab
  );

  // Sync activeTab if initialSubTab prop changes
  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab);
    }
  }, [initialSubTab]);

  // New E-Bike Form State
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newSerialNumber, setNewSerialNumber] = useState('');
  const [newName, setNewName] = useState('');
  const [newZoneId, setNewZoneId] = useState('');
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  // RFID Assignment State
  const [selectedDriverForRfid, setSelectedDriverForRfid] = useState(initialDriverId || '');
  const [rfidInput, setRfidInput] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairSuccess, setPairSuccess] = useState('');
  const [showTipExplanation, setShowTipExplanation] = useState(false);

  // Edit E-Bike State
  const [editingBike, setEditingBike] = useState<EBikeDevice | null>(null);
  const [editName, setEditName] = useState('');
  const [editSerialNumber, setEditSerialNumber] = useState('');
  const [editZoneId, setEditZoneId] = useState('');
  const [editStatus, setEditStatus] = useState<EBikeStatus>('AVAILABLE');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Native back handlers
  useBackHandler(
    editingBike !== null,
    () => {
      setEditingBike(null);
      return true;
    },
    20,
    'ebike-edit-modal'
  );

  useBackHandler(
    selectedDriverForRfid !== '',
    () => {
      setSelectedDriverForRfid('');
      setRfidInput('');
      setPairSuccess('');
      return true;
    },
    16,
    'ebike-rfid-driver'
  );

  useBackHandler(
    activeTab !== 'shuttles',
    () => {
      setActiveTab('shuttles');
      return true;
    },
    12,
    'ebike-tab'
  );

  // Sync selectedDriverForRfid if initialDriverId prop changes
  useEffect(() => {
    if (initialDriverId) {
      setSelectedDriverForRfid(initialDriverId);
      const drv = drivers.find((d) => d.uid === initialDriverId);
      if (drv?.rfidCardUid) {
        setRfidInput(drv.rfidCardUid);
      }
    }
  }, [initialDriverId, drivers]);

  // Hardware Simulator State
  const [simBikeId, setSimBikeId] = useState('');
  const [simRfid, setSimRfid] = useState('');
  const [simActionMsg, setSimActionMsg] = useState<{ text: string; success: boolean } | null>(null);
  const [simLat, setSimLat] = useState(14.5995);
  const [simLng, setSimLng] = useState(120.9842);
  const [simSpeed, setSimSpeed] = useState(25);
  const [gpsSimulating, setGpsSimulating] = useState(false);
  const [simRegMode, setSimRegMode] = useState<boolean>(false); // ESP32 Hardware Button Registration Mode Toggle
  const [latestAdminScan, setLatestAdminScan] = useState<{ rfidUid: string; scannedAt?: string } | null>(null);

  // Code Copy State
  const [copiedCode, setCopiedCode] = useState(false);

  // Subscribe to E-Bikes, Drivers, and Admin RFID Registration Scans
  useEffect(() => {
    const unsubscribeBikes = subscribeToEBikes((bikes) => {
      setEbikes(bikes);
      if (bikes.length > 0 && !simBikeId) {
        setSimBikeId(bikes[0].deviceId);
        if (bikes[0].location) {
          setSimLat(bikes[0].location.latitude);
          setSimLng(bikes[0].location.longitude);
        }
      }
    });

    const driversRef = collection(db, 'drivers');
    const unsubscribeDrivers = onSnapshot(driversRef, (snap) => {
      const drvs: DriverProfile[] = snap.docs.map((d) => ({
        ...(d.data() as DriverProfile),
        uid: d.id,
      }));
      setDrivers(drvs);
    });

    const unsubscribeAdminReg = subscribeToAdminRegistrationRfid((data) => {
      if (data) {
        setLatestAdminScan(data);
        setRfidInput(data.rfidUid); // Automatically fills RFID card pairing input!
      }
    });

    const unsubscribeZones = listenToOperationalZones((zList) => {
      setZones(zList);
      if (zList.length > 0 && !newZoneId) {
        setNewZoneId(zList[0].id);
      }
    });

    return () => {
      unsubscribeBikes();
      unsubscribeDrivers();
      unsubscribeAdminReg();
      unsubscribeZones();
    };
  }, []);

  // Auto-resolve RFID driver assignment whenever an e-bike scans a paired RFID tag
  useEffect(() => {
    if (ebikes.length === 0 || drivers.length === 0) return;

    ebikes.forEach(async (bike) => {
      if (bike.lastRfidCardUid) {
        await autoResolveRfidAssignment(bike, drivers);
      }
    });
  }, [ebikes, drivers]);

  // Sync simulator fields when selecting a bike
  useEffect(() => {
    if (simBikeId) {
      const bike = ebikes.find((b) => b.deviceId === simBikeId);
      if (bike && bike.location) {
        setSimLat(bike.location.latitude);
        setSimLng(bike.location.longitude);
      }
    }
  }, [simBikeId]);

  // Handle Registering E-Bike
  const handleRegisterBike = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceId || !newSerialNumber || !newName) {
      const err = 'Please fill in Device ID, E-Shuttle Plate Number, and E-Shuttle Name.';
      setRegError(err);
      toast.warning(err);
      return;
    }
    setRegistering(true);
    setRegError('');
    setRegSuccess('');

    const matchedZone = zones.find((z) => z.id === newZoneId);

    try {
      await registerEBike({
        deviceId: newDeviceId,
        serialNumber: newSerialNumber,
        name: newName,
        zoneId: newZoneId || null,
        zoneName: matchedZone?.name || null,
      });
      const successMsg = `E-Shuttle Device ${newDeviceId.toUpperCase()} registered successfully!`;
      setRegSuccess(successMsg);
      toast.success(successMsg);
      setNewDeviceId('');
      setNewSerialNumber('');
      setNewName('');
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to register E-Shuttle.';
      setRegError(errMsg);
      toast.error(errMsg);
    } finally {
      setRegistering(false);
    }
  };

  // Handle Opening Edit Modal
  const handleOpenEditModal = (bike: EBikeDevice) => {
    setEditingBike(bike);
    setEditName(bike.name || '');
    setEditSerialNumber(bike.serialNumber || '');
    setEditZoneId(bike.zoneId || '');
    setEditStatus(bike.status || 'AVAILABLE');
    setEditError('');
  };

  // Handle Saving Edited E-Bike (Protected by Secret PIN)
  const handleSaveEditBike = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBike) return;

    if (!editName.trim() || !editSerialNumber.trim()) {
      const msg = 'Please provide both an E-Shuttle name and plate/serial number.';
      setEditError(msg);
      toast.warning(msg);
      return;
    }

    const matchedZone = zones.find((z) => z.id === editZoneId);
    const targetBike = editingBike;

    promptAdminPin({
      title: 'Authorize Edit E-Shuttle',
      actionDescription: `Enter Secret PIN to apply changes to vehicle unit "${targetBike.name}" (${targetBike.deviceId})`,
      entityName: targetBike.name,
      severity: 'warning',
      onConfirm: async () => {
        setIsSavingEdit(true);
        setEditError('');
        try {
          await updateEBike(targetBike.deviceId, {
            name: editName.trim(),
            serialNumber: editSerialNumber.trim().toUpperCase(),
            zoneId: editZoneId || null,
            zoneName: matchedZone?.name || null,
            status: editStatus,
          });

          toast.success(`E-Shuttle "${editName.trim()}" (${targetBike.deviceId}) updated successfully!`);
          setEditingBike(null);
        } catch (err: any) {
          console.error('Update e-bike error:', err);
          const errMsg = err?.message || 'Failed to update E-Shuttle.';
          setEditError(errMsg);
          toast.error(errMsg);
        } finally {
          setIsSavingEdit(false);
        }
      },
    });
  };

  // Handle Deleting E-Bike (Protected by Secret PIN)
  const handleDeleteBike = (deviceId: string) => {
    promptAdminPin({
      title: 'Authorize Remove E-Shuttle',
      actionDescription: `Enter Secret PIN to remove vehicle hardware unit "${deviceId}" from the active fleet`,
      entityName: deviceId,
      severity: 'danger',
      onConfirm: async () => {
        try {
          await deleteEBike(deviceId);
          toast.success(`E-Shuttle "${deviceId.toUpperCase()}" removed from fleet.`);
        } catch (err: any) {
          console.error('Delete error:', err);
          toast.error(err?.message || 'Failed to remove E-Shuttle.');
        }
      },
    });
  };

  // Handle Pairing RFID Card (Protected by Secret PIN)
  const handlePairRfid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriverForRfid || !rfidInput) {
      toast.warning('Please select a driver and enter an RFID Card UID.');
      return;
    }
    const drv = drivers.find((d) => d.uid === selectedDriverForRfid);

    promptAdminPin({
      title: 'Authorize RFID Hardware Pairing',
      actionDescription: `Enter Secret PIN to pair RFID card "${rfidInput.toUpperCase()}" to driver "${drv?.fullName || selectedDriverForRfid}"`,
      entityName: drv?.fullName,
      severity: 'warning',
      onConfirm: async () => {
        setPairingLoading(true);
        setPairSuccess('');

        try {
          await pairDriverRfidCard(selectedDriverForRfid, rfidInput);
          const successMsg = `RFID Tag [${rfidInput.toUpperCase()}] paired to driver ${drv?.fullName || ''}!`;
          setPairSuccess(successMsg);
          toast.success(successMsg);
          setRfidInput('');
        } catch (err: any) {
          console.error('Pairing error:', err);
          toast.error(err?.message || 'Failed to pair RFID card.');
        } finally {
          setPairingLoading(false);
        }
      },
    });
  };

  // Handle Simulated RFID Tap
  const handleSimulateRfidTap = async () => {
    if (!simBikeId || !simRfid) {
      const err = 'Select an E-Shuttle and enter/select or type an RFID Card UID.';
      setSimActionMsg({ text: err, success: false });
      toast.warning(err);
      return;
    }

    try {
      if (simRegMode) {
        await sendAdminRegistrationScan(simRfid);
        const msg = `⚡ ADMIN REGISTRATION SCAN: RFID Card [${simRfid.toUpperCase()}] broadcast from device ${simBikeId}! Sent to Driver RFID Pairing directory without binding driver to bike.`;
        setSimActionMsg({
          text: msg,
          success: true,
        });
        toast.info(msg);
      } else {
        const res = await processRfidTapEvent(simBikeId, simRfid);
        setSimActionMsg({ text: res.message, success: res.success });
        if (res.success) {
          toast.success(res.message);
        } else {
          toast.warning(res.message);
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Tap event failed.';
      setSimActionMsg({ text: errMsg, success: false });
      toast.error(errMsg);
    }
  };

  // Handle Simulated GPS Movement
  const handleSendSimulatedGps = async () => {
    if (!simBikeId) return;
    try {
      await updateEBikeGpsLocation(simBikeId, simLat, simLng, simSpeed);
      const msg = `GPS Telemetry pushed for ${simBikeId}: (${simLat.toFixed(5)}, ${simLng.toFixed(5)}) @ ${simSpeed} km/h`;
      setSimActionMsg({
        text: msg,
        success: true,
      });
      toast.info(msg);
    } catch (err: any) {
      const errMsg = err?.message || 'GPS telemetry update failed.';
      setSimActionMsg({ text: errMsg, success: false });
      toast.error(errMsg);
    }
  };

  // Automated GPS route motion simulator loop
  useEffect(() => {
    let interval: any = null;
    if (gpsSimulating && simBikeId) {
      interval = setInterval(() => {
        // Slightly nudge lat/lng in a small circle around Manila center
        setSimLat((prev) => prev + (Math.random() - 0.5) * 0.0008);
        setSimLng((prev) => prev + (Math.random() - 0.5) * 0.0008);
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gpsSimulating, simBikeId]);

  // Sync automated GPS loop with Firebase
  useEffect(() => {
    if (gpsSimulating && simBikeId) {
      updateEBikeGpsLocation(simBikeId, simLat, simLng, simSpeed);
    }
  }, [simLat, simLng, gpsSimulating, simBikeId]);

  // ESP32 Direct Firebase REST C++ Arduino Code Snippet with SSD1306 OLED Display
  const esp32ArduinoCode = `/*
  ==============================================================
  ESP32 E-SHUTTLE CONTROLLER WITH 0.96" OLED DISPLAY & ADMIN REGISTRATION
  Firmware: SSD1306 OLED (I2C), GPS Telemetry, MFRC522 RFID, Push-Button
  Protocol: Direct Firebase REST API (No third-party server required)
  Required Libraries: Adafruit SSD1306, Adafruit GFX Library, TinyGPSPlus, MFRC522
  ==============================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <Wire.h>
#include <MFRC522.h>
#include <TinyGPSPlus.h>
#include <HardwareSerial.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// --- OLED DISPLAY CONFIGURATION ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1  // Reset pin # (or -1 if sharing ESP32 reset pin)
#define SCREEN_ADDRESS 0x3C // 0x3C for 128x64 OLED

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- WIFI CONFIGURATION ---
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// --- FIREBASE REST CONFIGURATION ---
const char* PROJECT_ID  = "YOUR_FIREBASE_PROJECT_ID"; 
const char* DATABASE_ID = "(default)"; // or your Firestore Database ID
const char* API_KEY     = "YOUR_FIREBASE_WEB_API_KEY";
const char* DEVICE_ID   = "${simBikeId || 'ESP32-EBIKE-001'}"; // Set this E-Shuttle's Device ID

// --- PIN DEFINITIONS ---
#define SS_PIN         5   // RFID RC522 SS/SDA Pin
#define RST_PIN        22  // RFID RC522 Reset Pin
#define GPS_RX         16  // GPS Module TX -> ESP32 RX2
#define GPS_TX         17  // GPS Module RX -> ESP32 TX2
#define REG_BUTTON_PIN 4   // Push Button Pin (GPIO 4) -> Internal Pullup
#define REG_LED_PIN    2   // Built-in LED / Indicator Pin (GPIO 2)
// OLED I2C Pins: SDA -> GPIO 21, SCL -> GPIO 22

MFRC522 rfid(SS_PIN, RST_PIN);
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

bool isRegistrationMode = false;
unsigned long lastButtonPress = 0;
unsigned long lastGpsSync = 0;
const unsigned long GPS_INTERVAL_MS = 3000; // Send GPS telemetry every 3 seconds

String currentStatusMsg = "SWIPE DRIVER RFID";

void drawOledDisplay(String topStatus, String line1, String line2, String line3) {
  display.clearDisplay();
  
  // Header bar
  display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setTextSize(1);
  display.setCursor(2, 2);
  display.print(topStatus);

  // Body text
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(2, 16);
  display.print(line1);

  display.setCursor(2, 30);
  display.setTextSize(1);
  display.print(line2);

  display.setCursor(2, 46);
  display.print(line3);

  display.display();
}

void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  
  pinMode(REG_BUTTON_PIN, INPUT_PULLUP);
  pinMode(REG_LED_PIN, OUTPUT);
  digitalWrite(REG_LED_PIN, LOW);

  // Initialize OLED
  Wire.begin(21, 22); // SDA = GPIO 21, SCL = GPIO 22
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 OLED allocation failed!"));
  } else {
    display.clearDisplay();
    drawOledDisplay("E-SHUTTLE", "BOOTING SYSTEM...", "CONNECTING WIFI", "ESP32 READY");
  }

  SPI.begin();
  rfid.PCD_Init();

  Serial.println("=============================================");
  Serial.println("Initializing ESP32 E-Shuttle Controller...");
  Serial.println("=============================================");

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Connected!");
  drawOledDisplay("WIFI CONNECTED", "ONLINE: READY", "SWIPE DRIVER RFID", "GPS SEARCHING...");
}

void loop() {
  // 1. Check Push-Button for Admin Registration Mode Toggle
  if (digitalRead(REG_BUTTON_PIN) == LOW && (millis() - lastButtonPress > 400)) {
    lastButtonPress = millis();
    isRegistrationMode = !isRegistrationMode;
    digitalWrite(REG_LED_PIN, isRegistrationMode ? HIGH : LOW);

    if (isRegistrationMode) {
      Serial.println("\\n[ADMIN REGISTRATION MODE ACTIVE]");
      drawOledDisplay("ADMIN REG MODE", "SWIPE CARD NOW", "BROADCAST TO WEB", "NO VEHICLE ASSIGN");
    } else {
      Serial.println("\\n[NORMAL E-SHUTTLE MODE] Returned to standard E-Shuttle Operation.");
      drawOledDisplay("E-SHUTTLE", "OPERATIONAL", "SWIPE DRIVER RFID", "READY FOR PASSENGERS");
    }
  }

  // 2. Process GPS Serial Stream
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Send GPS Telemetry periodically
  if (millis() - lastGpsSync > GPS_INTERVAL_MS) {
    lastGpsSync = millis();
    if (gps.location.isValid()) {
      double lat = gps.location.lat();
      double lng = gps.location.lng();
      double spd = gps.speed.kmph();
      
      sendGpsTelemetryToFirebase(lat, lng, spd);

      if (!isRegistrationMode) {
        String gpsStr = "GPS: " + String(lat, 4) + ", " + String(lng, 4);
        String spdStr = "SPD: " + String(spd, 1) + " KM/H";
        drawOledDisplay("E-SHUTTLE ONLINE", "GPS LOCK OK", spdStr, gpsStr);
      }
    }
  }

  // 3. Check for RFID Card Scan
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String rfidUid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      if (i > 0) rfidUid += "-";
      if (rfid.uid.uidByte[i] < 0x10) rfidUid += "0";
      rfidUid += String(rfid.uid.uidByte[i], HEX);
    }
    rfidUid.toUpperCase();

    if (isRegistrationMode) {
      Serial.println("[ADMIN REGISTRATION SCAN] Card Tag: " + rfidUid);
      drawOledDisplay("ADMIN SCAN OK", "UID: " + rfidUid, "SENT TO ADMIN WEB", "REGISTRATION MODE");
      sendAdminRegistrationScanToFirebase(rfidUid);
    } else {
      Serial.println("[DRIVER E-SHUTTLE SWIPE] Card Tag: " + rfidUid);
      drawOledDisplay("DRIVER CARD TAP", "UID: " + rfidUid, "VERIFYING DRIVER...", "LINKING VEHICLE");
      sendRfidTapToFirebase(rfidUid);
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    delay(2000); // Debounce card scans
  }
}

// --- DIRECT FIREBASE REST API FUNCTIONS ---

void sendAdminRegistrationScanToFirebase(String rfidUid) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/" + String(PROJECT_ID) +
               "/databases/" + String(DATABASE_ID) + "/documents/system/adminRegistration" +
               "?updateMask.fieldPaths=lastScannedRegistrationRfid" +
               "&key=" + String(API_KEY);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String jsonPayload = "{\\"fields\\": {"
                       "\\"lastScannedRegistrationRfid\\": {\\"stringValue\\": \\"" + rfidUid + "\\""
                       "}}}";

  int httpCode = http.PATCH(jsonPayload);
  Serial.printf("[ADMIN REST] Card registration broadcast response: %d\\n", httpCode);
  http.end();
}

void sendGpsTelemetryToFirebase(double lat, double lng, double speed) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/" + String(PROJECT_ID) +
               "/databases/" + String(DATABASE_ID) + "/documents/ebikes/" + String(DEVICE_ID) +
               "?updateMask.fieldPaths=location.latitude&updateMask.fieldPaths=location.longitude&updateMask.fieldPaths=speedKmH" +
               "&key=" + String(API_KEY);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String jsonPayload = "{\\"fields\\": {"
                       "\\"location\\": {\\"mapValue\\": {\\"fields\\": {"
                       "\\"latitude\\": {\\"doubleValue\\": " + String(lat, 6) + "},"
                       "\\"longitude\\": {\\"doubleValue\\": " + String(lng, 6) + "}"
                       "}}}"
                       "\\"speedKmH\\": {\\"doubleValue\\": " + String(speed, 1) + "}"
                       "}}";

  int httpCode = http.PATCH(jsonPayload);
  Serial.printf("[GPS REST] Telemetry response: %d\\n", httpCode);
  http.end();
}

void sendRfidTapToFirebase(String rfidUid) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/" + String(PROJECT_ID) +
               "/databases/" + String(DATABASE_ID) + "/documents/ebikes/" + String(DEVICE_ID) +
               "?updateMask.fieldPaths=lastRfidCardUid" +
               "&key=" + String(API_KEY);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String jsonPayload = "{\\"fields\\": {"
                       "\\"lastRfidCardUid\\": {\\"stringValue\\": \\"" + rfidUid + "\\""
                       "}}}";

  int httpCode = http.PATCH(jsonPayload);
  Serial.printf("[DRIVER REST] E-Shuttle Swipe response: %d\\n", httpCode);
  http.end();
}
`;

  const copyCodeToClipboard = () => {
    navigator.clipboard.writeText(esp32ArduinoCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="space-y-6 text-[#0D47A1]">
      {/* Subtabs Selector Header */}
      <div className="flex items-center gap-1 bg-white border-2 border-[#0D47A1] p-1 rounded-2xl text-xs overflow-x-auto shadow-sm">
        <button
          onClick={() => setActiveTab('map')}
          title="View live GPS map of all e-shuttle devices"
          className={`px-3.5 py-2 rounded-xl font-black transition-colors whitespace-nowrap uppercase tracking-wider flex items-center gap-1.5 ${
            activeTab === 'map' ? 'bg-[#0D47A1] text-white shadow-md' : 'text-[#0D47A1] hover:bg-[#E3F2FD]'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Map</span>
        </button>

        <button
          onClick={() => setActiveTab('shuttles')}
          title="Manage registered e-shuttle hardware units"
          className={`px-3.5 py-2 rounded-xl font-black transition-colors whitespace-nowrap uppercase tracking-wider flex items-center gap-1.5 ${
            activeTab === 'shuttles' ? 'bg-[#0D47A1] text-white shadow-md' : 'text-[#0D47A1] hover:bg-[#E3F2FD]'
          }`}
        >
          <Bike className="w-4 h-4" />
          <span>E-Shuttles ({ebikes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('rfid')}
          title="Pair RFID cards to driver accounts"
          className={`px-3.5 py-2 rounded-xl font-black transition-colors whitespace-nowrap uppercase tracking-wider flex items-center gap-1.5 ${
            activeTab === 'rfid' ? 'bg-[#0D47A1] text-white shadow-md' : 'text-[#0D47A1] hover:bg-[#E3F2FD]'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Driver RFID</span>
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          title="Test GPS movements and RFID badge taps"
          className={`px-3.5 py-2 rounded-xl font-black transition-colors whitespace-nowrap uppercase tracking-wider flex items-center gap-1.5 ${
            activeTab === 'simulator' ? 'bg-[#0D47A1] text-white shadow-md' : 'text-[#0D47A1] hover:bg-[#E3F2FD]'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Simulator</span>
        </button>

        <button
          onClick={() => setActiveTab('esp32_code')}
          title="View and copy ESP32 C++ firmware"
          className={`px-3.5 py-2 rounded-xl font-black transition-colors whitespace-nowrap uppercase tracking-wider flex items-center gap-1.5 ${
            activeTab === 'esp32_code' ? 'bg-[#0D47A1] text-white shadow-md' : 'text-[#0D47A1] hover:bg-[#E3F2FD]'
          }`}
        >
          <Code2 className="w-4 h-4" />
          <span>ESP32 Code</span>
        </button>
      </div>

      {/* 0. LIVE MAP SUBTAB */}
      {activeTab === 'map' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <AdminEBikeMap ebikes={ebikes} drivers={drivers} height="600px" />
        </div>
      )}

      {/* 1. E-SHUTTLE MANAGEMENT TAB */}
      {activeTab === 'shuttles' && (
        <div className="space-y-6">
          {/* Add New E-Bike Hardware Form */}
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-black text-[#0D47A1] flex items-center gap-2">
              <span>Register E-Shuttle</span>
            </h3>

            <form onSubmit={handleRegisterBike} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Device ID (e.g. EBIKE-001)</label>
                <input
                  type="text"
                  placeholder="e.g. ESP32-EBIKE-001"
                  value={newDeviceId}
                  onChange={(e) => setNewDeviceId(e.target.value)}
                  className="w-full mt-1 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold placeholder:text-slate-400 uppercase focus:outline-none focus:border-[#1565C0] focus:bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Plate Number / Shuttle ID</label>
                <input
                  type="text"
                  placeholder="e.g. EB-88402-X or ABC-1234"
                  value={newSerialNumber}
                  onChange={(e) => setNewSerialNumber(e.target.value)}
                  className="w-full mt-1 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold placeholder:text-slate-400 uppercase focus:outline-none focus:border-[#1565C0] focus:bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">E-Shuttle Name</label>
                <input
                  type="text"
                  placeholder="e.g. EcoGlide Shuttle #1"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full mt-1 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold placeholder:text-slate-400 focus:outline-none focus:border-[#1565C0] focus:bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Assigned Operational Zone</label>
                <select
                  value={newZoneId}
                  onChange={(e) => setNewZoneId(e.target.value)}
                  className="w-full mt-1 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:outline-none focus:border-[#1565C0] focus:bg-white"
                >
                  <option value="">-- No Specific Zone --</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 lg:col-span-4 pt-1">
                {regError && <div className="text-xs text-rose-600 mb-2 font-semibold">{regError}</div>}
                {regSuccess && <div className="text-xs text-emerald-700 mb-2 font-semibold">{regSuccess}</div>}
                <button
                  type="submit"
                  disabled={registering}
                  title="Add new e-shuttle device"
                  className="w-full py-2.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl font-black text-xs shadow-lg active:scale-95 transition-transform uppercase tracking-wider"
                >
                  {registering ? 'Adding...' : 'Add E-Shuttle'}
                </button>
              </div>
            </form>
          </div>

          {/* E-Bikes List */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">
              Registered E-Shuttles ({ebikes.length})
            </h3>

            {ebikes.length === 0 ? (
              <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-8 text-center text-slate-500 text-xs shadow-md font-medium">
                No E-Shuttles registered yet. Fill in the form above to add your first E-Shuttle.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ebikes.map((bike) => {
                  const assignedDriver = drivers.find((d) => d.uid === bike.currentDriverId);

                  return (
                    <div
                      key={bike.deviceId}
                      className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 space-y-3 shadow-md relative text-[#0D47A1]"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-[#0D47A1]">{bike.name}</span>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                                bike.status === 'IN_USE'
                                  ? 'bg-[#E3F2FD] text-[#0D47A1] border-[#0D47A1]'
                                  : bike.status === 'AVAILABLE'
                                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-300'
                              }`}
                            >
                              {bike.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span>ID: <b className="text-[#0D47A1]">{bike.deviceId}</b> | Plate #: {bike.serialNumber}</span>
                            {bike.zoneName && (
                              <span className="bg-[#0D47A1] text-white px-2 py-0.5 rounded-md font-sans font-bold text-[9px] uppercase">
                                📍 {bike.zoneName}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(bike)}
                            className="px-2.5 py-1 bg-[#E3F2FD] hover:bg-[#BBDEFB] text-[#0D47A1] border border-[#0D47A1]/40 rounded-lg text-[10px] font-black uppercase transition-colors flex items-center gap-1 shadow-xs"
                            title="Edit E-Shuttle Details"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          <button
                            onClick={() => handleDeleteBike(bike.deviceId)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
                            title="Remove Shuttle"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Driver & RFID Status */}
                      <div className="bg-[#F8FAFC] border border-[#0D47A1]/40 rounded-2xl p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Assigned Driver:</span>
                          {bike.currentDriverId ? (
                            <span className="font-black text-[#0D47A1] flex items-center gap-1.5">
                              <span className="w-2 h-2 bg-[#0D47A1] rounded-full animate-ping"></span>
                              <span>{bike.currentDriverName || assignedDriver?.fullName || 'Active Driver'}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic font-medium">No driver assigned</span>
                          )}
                        </div>

                        {bike.lastRfidCardUid && (
                          <div className="flex flex-col gap-1 text-[11px] border-t border-[#0D47A1]/20 pt-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-medium">Last Scanned Card:</span>
                              <span className="font-mono text-[#0D47A1] font-bold bg-[#E3F2FD] px-2 py-0.5 rounded-lg border border-[#0D47A1]">
                                {bike.lastRfidCardUid}
                              </span>
                            </div>

                            {(() => {
                              const matchedDrv = drivers.find(
                                (d) =>
                                  d.rfidCardUid &&
                                  d.rfidCardUid.trim().toUpperCase() === bike.lastRfidCardUid?.trim().toUpperCase()
                              );

                              if (!matchedDrv) {
                                return (
                                  <div className="text-[10px] text-amber-700 italic font-medium">
                                    * RFID tag not yet linked to any driver in system.
                                  </div>
                                );
                              }

                              if (bike.currentDriverId !== matchedDrv.uid) {
                                return (
                                  <div className="flex items-center justify-between pt-1">
                                    <span className="text-[10px] font-bold text-[#0D47A1]">
                                      Recognized Driver: {matchedDrv.fullName}
                                    </span>
                                    <button
                                      onClick={() => processRfidTapEvent(bike.deviceId, bike.lastRfidCardUid!)}
                                      title="Manually bind driver to this e-shuttle"
                                      className="px-2.5 py-1 bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-[10px] rounded-lg shadow uppercase"
                                    >
                                      Assign {matchedDrv.fullName}
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <div className="text-[10px] font-bold text-[#0D47A1] flex items-center gap-1">
                                  <span>✓ Driver Active:</span>
                                  <span className="text-[#0D47A1]">{matchedDrv.fullName}</span>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* GPS & Speed */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <div className="text-slate-600 font-medium">
                          <span>
                            {bike.location
                              ? `GPS: (${bike.location.latitude.toFixed(4)}, ${bike.location.longitude.toFixed(4)})`
                              : 'No GPS data'}
                          </span>
                        </div>
                        <div className="font-black text-[#0D47A1]">
                          {bike.speedKmH ? `${bike.speedKmH} km/h` : '0 km/h'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. DRIVER RFID PAIRING TAB */}
      {activeTab === 'rfid' && (
        <div className="space-y-6">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 shadow-xl space-y-4 max-w-lg text-[#0D47A1]">
            <h3 className="text-sm font-black text-[#0D47A1] flex items-center justify-between">
              <span>Link Driver RFID Card</span>
              <span className="text-[10px] text-[#0D47A1] bg-[#E3F2FD] px-2.5 py-0.5 rounded-full border border-[#0D47A1] uppercase font-mono flex items-center gap-1 font-bold">
                <Cpu className="w-3 h-3 text-[#0D47A1]" />
                <span>MFRC522 + Button Trigger</span>
              </span>
            </h3>

            {/* Live Hardware Scan Alert Banner */}
            {latestAdminScan && (
              <div className="p-3 bg-[#E3F2FD] border border-[#0D47A1] rounded-2xl flex items-center justify-between text-xs text-[#0D47A1] shadow-sm animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#0D47A1] rounded-full animate-ping shrink-0" />
                  <span>
                    <strong>ESP32 Hardware Scan:</strong> UID <code className="font-mono bg-white px-1.5 py-0.5 rounded text-[#0D47A1] font-bold border border-[#0D47A1]">{latestAdminScan.rfidUid}</code>
                  </span>
                </div>
                <span className="text-[9px] text-[#0D47A1] font-bold uppercase">Auto-filled</span>
              </div>
            )}

            {/* Instruction Tip */}
            <div className="p-3 bg-[#E3F2FD] border border-[#0D47A1]/40 rounded-2xl text-[11px] text-[#0D47A1] space-y-1">
              <div className="font-bold text-[#0D47A1] flex items-center justify-between">
                <span className="flex items-center gap-1">💡 Rapid Registration Tip</span>
                <button
                  type="button"
                  onClick={() => setShowTipExplanation(!showTipExplanation)}
                  title="Explain tip"
                  className="w-5 h-5 rounded-full bg-white text-[#0D47A1] font-black text-[11px] flex items-center justify-center border border-[#0D47A1]/40 hover:bg-[#0D47A1] hover:text-white transition-all shadow-xs"
                >
                  ?
                </button>
              </div>
              {showTipExplanation && (
                <p className="text-slate-600 text-[10px] leading-relaxed font-medium pt-1 animate-in fade-in duration-200">
                  Press the physical Push-Button (GPIO 4) on <strong>ANY ESP32 device</strong> to put it into <strong>Admin Registration Mode</strong>. Swipe driver cards on the reader to instantly populate card UIDs here without binding to the e-shuttle!
                </p>
              )}
            </div>

            {selectedDriverForRfid && (
              <div className="p-3 bg-[#E3F2FD] border border-[#0D47A1] rounded-2xl flex items-center justify-between text-xs text-[#0D47A1]">
                <span className="font-semibold">
                  ⚡ Target Driver: <strong className="text-[#0D47A1]">{drivers.find((d) => d.uid === selectedDriverForRfid)?.fullName || 'Selected Driver'}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDriverForRfid('')}
                  className="text-[10px] text-[#0D47A1] hover:underline font-bold uppercase"
                >
                  Clear Selection
                </button>
              </div>
            )}

            <form onSubmit={handlePairRfid} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Select Approved Driver</label>
                <select
                  value={selectedDriverForRfid}
                  onChange={(e) => {
                    setSelectedDriverForRfid(e.target.value);
                    const drv = drivers.find((d) => d.uid === e.target.value);
                    if (drv?.rfidCardUid) setRfidInput(drv.rfidCardUid);
                  }}
                  className="w-full mt-1 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:outline-none focus:border-[#1565C0] focus:bg-white"
                >
                  <option value="">-- Choose Driver --</option>
                  {drivers.map((drv) => (
                    <option key={drv.uid} value={drv.uid}>
                      {drv.fullName} ({drv.phone}) {drv.rfidCardUid ? `[Card: ${drv.rfidCardUid}]` : '[No RFID]'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">
                  RFID Card Tag UID (e.g., A3-4F-89-12 or Hex Code)
                </label>
                <input
                  type="text"
                  placeholder="Scan or enter RFID UID"
                  value={rfidInput}
                  onChange={(e) => setRfidInput(e.target.value)}
                  className="w-full mt-1 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono font-bold uppercase placeholder:text-slate-400 focus:outline-none focus:border-[#1565C0] focus:bg-white"
                />
              </div>

              {pairSuccess && <div className="text-xs text-emerald-700 font-semibold">{pairSuccess}</div>}

              <button
                type="submit"
                disabled={pairingLoading || !selectedDriverForRfid || !rfidInput}
                title="Pair RFID UID to the selected driver"
                className="w-full py-2.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl font-black text-xs shadow-lg active:scale-95 transition-transform disabled:opacity-50 uppercase tracking-wider"
              >
                {pairingLoading ? 'Linking...' : 'Link RFID Card'}
              </button>
            </form>
          </div>

          {/* Drivers RFID Master Directory */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">
              Driver RFID Directory ({drivers.length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {drivers.map((drv) => (
                <div
                  key={drv.uid}
                  className="bg-white border-2 border-[#0D47A1] rounded-2xl p-4 flex items-center justify-between shadow-md text-[#0D47A1]"
                >
                  <div>
                    <div className="text-xs font-black text-[#0D47A1]">{drv.fullName}</div>
                    <div className="text-[10px] text-slate-500 font-medium">{drv.phone}</div>
                  </div>

                  {drv.rfidCardUid ? (
                    <div className="text-right">
                      <span className="font-mono text-xs font-black text-[#0D47A1] bg-[#E3F2FD] border border-[#0D47A1] px-2.5 py-1 rounded-xl">
                        {drv.rfidCardUid}
                      </span>
                      <div className="text-[9px] text-[#0D47A1] font-bold mt-1">Paired & Ready</div>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded-lg font-medium">
                      No Card Paired
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. VIRTUAL ESP32 HARDWARE SIMULATOR TAB */}
      {activeTab === 'simulator' && (
        <div className="space-y-6">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 shadow-xl space-y-5 text-[#0D47A1]">
            <div className="flex items-center justify-between border-b border-[#0D47A1]/30 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-[#0D47A1]">Virtual Hardware & Telemetry Simulator</h3>
              </div>
              <span className="text-[10px] font-black text-[#0D47A1] bg-[#E3F2FD] border border-[#0D47A1] px-2.5 py-1 rounded-full uppercase">
                Direct Firestore REST
              </span>
            </div>

            {/* Hardware Mode Button Trigger Toggle */}
            <div className="p-3 bg-[#F8FAFC] border border-[#0D47A1]/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="space-y-0.5">
                <div className="text-xs font-black text-[#0D47A1] flex items-center gap-2">
                  <span>ESP32 Hardware Button: Admin Registration Mode</span>
                  <span
                    className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                      simRegMode
                        ? 'bg-amber-50 text-amber-800 border-amber-300 font-extrabold animate-pulse'
                        : 'bg-[#E3F2FD] text-[#0D47A1] border-[#0D47A1]'
                    }`}
                  >
                    {simRegMode ? 'REGISTRATION MODE ACTIVE' : 'NORMAL E-SHUTTLE OPERATION'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">
                  {simRegMode
                    ? '⚡ ESP32 acts as an Admin Scanner tool. Card scans broadcast directly for driver account registration without binding to the e-shuttle.'
                    : 'Standard E-Shuttle mode: Card swipes check-in or check-out drivers on this vehicle.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSimRegMode(!simRegMode)}
                title="Toggle hardware push-button state"
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors shrink-0 shadow-sm ${
                  simRegMode
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-[#0D47A1] text-white hover:bg-[#1565C0]'
                }`}
              >
                {simRegMode ? 'Disable Mode' : 'Push Button'}
              </button>
            </div>

            {/* Select Target Bike & Virtual OLED Hardware Screen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Select Target E-Shuttle Device</label>
                  <select
                    value={simBikeId}
                    onChange={(e) => setSimBikeId(e.target.value)}
                    className="w-full mt-1 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:outline-none focus:border-[#1565C0] focus:bg-white"
                  >
                    {ebikes.map((b) => (
                      <option key={b.deviceId} value={b.deviceId}>
                        {b.name} ({b.deviceId}) — {b.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Select Driver RFID Card to Tap</label>
                  <select
                    value={simRfid}
                    onChange={(e) => setSimRfid(e.target.value)}
                    className="w-full mt-1 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-mono font-bold focus:outline-none focus:border-[#1565C0] focus:bg-white"
                  >
                    <option value="">-- Choose RFID Card --</option>
                    {drivers
                      .filter((d) => d.rfidCardUid)
                      .map((d) => (
                        <option key={d.uid} value={d.rfidCardUid}>
                          {d.rfidCardUid} ({d.fullName})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* REALISTIC ESP32 0.96" OLED DISPLAY HARDWARE SCREEN */}
              <div className="bg-[#E3F2FD] border-2 border-[#0D47A1] rounded-2xl p-3 shadow-md relative">
                <div className="flex items-center justify-between text-[9px] font-mono text-slate-600 mb-1.5 uppercase tracking-wider font-bold">
                  <span>SSD1306 OLED (128x64 I2C)</span>
                  <span className="flex items-center gap-1 text-[#0D47A1] font-bold">
                    <span className="w-1.5 h-1.5 bg-[#0D47A1] rounded-full animate-ping"></span>
                    GPIO 21 (SDA) / 22 (SCL)
                  </span>
                </div>

                {/* OLED Display Screen Frame */}
                <div className="bg-[#0D47A1] border-4 border-[#0D47A1]/80 rounded-lg p-2.5 font-mono text-[#E3F2FD] min-h-[110px] flex flex-col justify-between shadow-inner relative overflow-hidden select-none">
                  {/* Glowing header bar */}
                  <div className="bg-[#90CAF9] text-[#0D47A1] font-extrabold text-[10px] px-2 py-0.5 rounded flex items-center justify-between tracking-tighter uppercase">
                    <span>{simRegMode ? 'ADMIN REG MODE' : 'E-SHUTTLE ONLINE'}</span>
                    <span>WiFi: OK</span>
                  </div>

                  {/* Body Text telemetry lines */}
                  <div className="space-y-0.5 text-[11px] font-bold leading-tight mt-1">
                    <div className="text-white flex items-center justify-between">
                      <span>SHUTTLE: {simBikeId || 'ESP32-001'}</span>
                      <span className="text-[10px] text-[#90CAF9]">{simSpeed} KM/H</span>
                    </div>

                    <div className="text-[#90CAF9] text-[10px] truncate">
                      {simRegMode
                        ? 'SWIPE DRIVER CARD NOW'
                        : simRfid
                        ? `TAG: ${simRfid}`
                        : 'READY FOR RFID SWIPE'}
                    </div>

                    <div className="text-slate-300 text-[9px]">
                      GPS: {simLat.toFixed(4)}, {simLng.toFixed(4)}
                    </div>
                  </div>

                  {/* Bottom indicator status */}
                  <div className="border-t border-[#2196F3]/50 pt-1 text-[9px] text-[#90CAF9] flex items-center justify-between uppercase">
                    <span>{simRegMode ? 'MODE: BROADCAST' : 'STATE: OPERATIONAL'}</span>
                    <span className="animate-pulse">● LIVE</span>
                  </div>
                </div>
              </div>
            </div>

            {/* RFID TAP SIMULATION BUTTON */}
            <div className="pt-1">
              <button
                onClick={handleSimulateRfidTap}
                title="Simulate NFC/RFID card tap event on the hardware scanner"
                className="w-full py-3 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl font-black text-xs shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-transform uppercase tracking-wider"
              >
                <span>Simulate RFID Card Tap</span>
              </button>
            </div>

            {/* Action Response Banner */}
            {simActionMsg && (
              <div
                className={`p-3 rounded-2xl text-xs font-semibold flex items-center gap-2 border animate-in fade-in ${
                  simActionMsg.success
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-rose-50 border-rose-300 text-rose-800'
                }`}
              >
                <span>{simActionMsg.text}</span>
              </div>
            )}

            {/* GPS Telemetry Controls */}
            <div className="border-t border-[#0D47A1]/30 pt-4 space-y-3">
              <h4 className="text-xs font-black text-[#0D47A1] flex items-center justify-between">
                <span>GPS Live Telemetry Broadcast</span>
                <span className="text-[10px] text-slate-500 font-normal">Push location coordinates to map</span>
              </h4>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] text-slate-500 uppercase font-bold">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={simLat}
                    onChange={(e) => setSimLat(Number(e.target.value))}
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2 text-xs text-[#0D47A1] font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-slate-500 uppercase font-bold">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={simLng}
                    onChange={(e) => setSimLng(Number(e.target.value))}
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2 text-xs text-[#0D47A1] font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-slate-500 uppercase font-bold">Speed (km/h)</label>
                  <input
                    type="number"
                    value={simSpeed}
                    onChange={(e) => setSimSpeed(Number(e.target.value))}
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2 text-xs text-[#0D47A1] font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSendSimulatedGps}
                  title="Broadcast single GPS coordinate update"
                  className="flex-1 py-2.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 uppercase shadow-sm"
                >
                  <span>Push Single GPS Update</span>
                </button>

                <button
                  onClick={() => setGpsSimulating(!gpsSimulating)}
                  title="Toggle continuous route simulation"
                  className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors uppercase ${
                    gpsSimulating
                      ? 'bg-amber-600 hover:bg-amber-700 text-white animate-pulse'
                      : 'bg-[#0D47A1] hover:bg-[#1565C0] text-white'
                  }`}
                >
                  <span>{gpsSimulating ? 'Stop Auto GPS' : 'Auto Move Route'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. ESP32 FIRMWARE ARDUINO C++ CODE GENERATOR */}
      {activeTab === 'esp32_code' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-[#0D47A1]">
                <span>ESP32 Arduino C++ Firmware Code</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Direct Firebase REST API implementation for ESP32 + MFRC522 RFID + GPS NEO-6M.
              </p>
            </div>

            <button
              onClick={copyCodeToClipboard}
              className="px-3.5 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95 transition-transform uppercase"
            >
              <span>{copiedCode ? 'Copied Code!' : 'Copy Code'}</span>
            </button>
          </div>

          <div className="bg-[#0D47A1] border-2 border-[#0D47A1] rounded-3xl p-4 font-mono text-xs text-[#E3F2FD] overflow-x-auto max-h-[500px] shadow-2xl relative">
            <pre>{esp32ArduinoCode}</pre>
          </div>
        </div>
      )}

      {/* 5. EDIT E-SHUTTLE MODAL */}
      {editingBike && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-6 shadow-2xl max-w-lg w-full space-y-5 relative text-[#0D47A1]">
            <div className="flex items-center justify-between pb-3 border-b border-[#0D47A1]/20">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-[#E3F2FD] border border-[#0D47A1] flex items-center justify-center text-[#0D47A1]">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0D47A1]">Edit E-Shuttle</h3>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Hardware ID: <span className="font-bold text-[#0D47A1]">{editingBike.deviceId}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBike(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditBike} className="space-y-4">
              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Device Identifier (Hardware UID)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingBike.deviceId}
                    className="w-full bg-slate-100 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-600 font-mono font-bold cursor-not-allowed uppercase"
                  />
                  <span className="text-[9px] text-slate-400 mt-0.5 block">
                    Permanent hardware identifier linked to microcontroller firmware.
                  </span>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    E-Shuttle Display Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. EcoGlide Shuttle #1"
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold placeholder:text-slate-400 focus:outline-none focus:border-[#1565C0] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Plate Number / Hardware Serial
                  </label>
                  <input
                    type="text"
                    value={editSerialNumber}
                    onChange={(e) => setEditSerialNumber(e.target.value)}
                    placeholder="e.g. EB-88402-X or ABC-1234"
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold placeholder:text-slate-400 uppercase focus:outline-none focus:border-[#1565C0] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Operational Geofence Zone
                  </label>
                  <select
                    value={editZoneId}
                    onChange={(e) => setEditZoneId(e.target.value)}
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:outline-none focus:border-[#1565C0] focus:bg-white"
                  >
                    <option value="">-- No Specific Zone Assigned --</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Fleet Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as EBikeStatus)}
                    className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:outline-none focus:border-[#1565C0] focus:bg-white"
                  >
                    <option value="AVAILABLE">AVAILABLE (Ready for Driver Pairing)</option>
                    <option value="IN_USE">IN_USE (Active Route Operation)</option>
                    <option value="MAINTENANCE">MAINTENANCE (Offline for Repairs/Inspection)</option>
                  </select>
                </div>

                {editStatus === 'MAINTENANCE' && editingBike.currentDriverId && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2 text-[11px] text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Warning:</strong> Saving with <strong>MAINTENANCE</strong> status will automatically release the assigned driver ({editingBike.currentDriverName || 'Active Driver'}) and mark vehicle as offline.
                    </span>
                  </div>
                )}

                {editError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-600 font-bold">
                    {editError}
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#0D47A1]/20">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingBike(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors uppercase tracking-wider"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl font-black text-xs shadow-lg active:scale-95 transition-transform flex items-center gap-1.5 uppercase tracking-wider"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
