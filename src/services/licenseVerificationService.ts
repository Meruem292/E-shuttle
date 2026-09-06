import { createWorker } from 'tesseract.js';
import { LTO_DRIVER_LICENSE_REGEX, formatDriverLicense } from '../utils/validation';

export interface LicenseVerificationResult {
  isValid: boolean;
  confidence: number; // 0 to 100
  detectedLicenseNumber?: string;
  matchedKeywords: string[];
  feedbackMessage: string;
  isOfficialLTO: boolean;
  rawText?: string;
}

// Key official phrases found on Philippine Land Transportation Office Driver's Licenses
const OFFICIAL_GOV_HEADERS = [
  'REPUBLIC OF THE PHILIPPINES',
  'DEPARTMENT OF TRANSPORTATION',
  'LAND TRANSPORTATION OFFICE',
  'PILIPINAS',
  'LTO',
];

const OFFICIAL_LICENSE_MARKERS = [
  "DRIVER'S LICENSE",
  'DRIVER LICENSE',
  'DRIVERS LICENSE',
  'NON-PROFESSIONAL',
  'PROFESSIONAL',
  'STUDENT PERMIT',
  'LICENSE NO',
  'DL NO',
  'RESTRICTIONS',
  'CONDITIONS',
  'EXPIRATION DATE',
  'BLOOD TYPE',
  'AGENCY CODE',
  'NATIONALITY',
];

/**
 * Pre-checks image dimensions to ensure it meets minimum resolution and aspect ratio for an ID card.
 */
function checkImageGeometry(imageUrl: string): Promise<{ width: number; height: number; aspectRatio: number; isAdequateResolution: boolean }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      const aspectRatio = width / (height || 1);
      const isAdequateResolution = width >= 250 && height >= 180;
      resolve({ width, height, aspectRatio, isAdequateResolution });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0, aspectRatio: 1, isAdequateResolution: false });
    };
    img.src = imageUrl;
  });
}

/**
 * Verifies an uploaded Driver's License image using open-source Tesseract.js OCR.
 * Checks for legitimate Philippine Land Transportation Office (LTO) card markers and license number.
 */
export async function verifyDriverLicenseImage(
  imageSource: string | File | Blob,
  onProgress?: (status: string, progress: number) => void
): Promise<LicenseVerificationResult> {
  let objectUrl: string | null = null;
  let imageUrl: string;

  if (typeof imageSource === 'string') {
    imageUrl = imageSource;
  } else {
    objectUrl = URL.createObjectURL(imageSource);
    imageUrl = objectUrl;
  }

  try {
    onProgress?.('Checking card image dimensions...', 10);
    const geometry = await checkImageGeometry(imageUrl);

    if (!geometry.isAdequateResolution && geometry.width > 0) {
      return {
        isValid: false,
        confidence: 15,
        matchedKeywords: [],
        isOfficialLTO: false,
        feedbackMessage: 'Image resolution is too low for verification. Please upload a clearer, higher-resolution picture of your license.',
      };
    }

    onProgress?.('Initializing open-source OCR engine...', 25);

    // Initialize Tesseract worker
    const worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const p = 30 + Math.floor((m.progress || 0) * 60);
          onProgress?.(`Scanning license card details (${Math.floor((m.progress || 0) * 100)}%)...`, p);
        }
      },
    });

    onProgress?.('Analyzing document text and security headers...', 65);
    const ret = await worker.recognize(imageUrl);
    await worker.terminate();

    const text = (ret.data.text || '').toUpperCase();
    onProgress?.('Verifying Philippine LTO markers...', 95);

    // Look for matched official keywords
    const matchedHeaders = OFFICIAL_GOV_HEADERS.filter((h) => text.includes(h));
    const matchedMarkers = OFFICIAL_LICENSE_MARKERS.filter((m) => text.includes(m));
    const allMatched = [...matchedHeaders, ...matchedMarkers];

    // Attempt to extract license number using regex pattern:
    // Typical LTO license: [Letter][2 Digits]-[2 Digits]-[6 Digits] (e.g. N01-23-456789 or N0123456789)
    let detectedLicenseNumber: string | undefined;
    const ltoRegex = /([A-Z][0-9]{2}[-\s]?[0-9]{2}[-\s]?[0-9]{6})/i;
    const match = text.match(ltoRegex);

    if (match && match[1]) {
      const raw = match[1].replace(/[\s-]/g, '');
      if (raw.length === 11) {
        detectedLicenseNumber = formatDriverLicense(raw);
      }
    }

    // Scoring system:
    // - Header match: 35 points
    // - License marker match: 20 points each (max 40)
    // - Detected LTO license number: 25 points
    let score = 0;
    if (matchedHeaders.length > 0) score += 35;
    score += Math.min(matchedMarkers.length * 15, 40);
    if (detectedLicenseNumber && LTO_DRIVER_LICENSE_REGEX.test(detectedLicenseNumber)) {
      score += 25;
    }

    const isOfficialLTO = matchedHeaders.length > 0 || score >= 40;
    const isValid = score >= 35;

    let feedbackMessage = '';
    if (isValid) {
      if (detectedLicenseNumber) {
        feedbackMessage = `Valid Philippine Driver's License detected (License No: ${detectedLicenseNumber}).`;
      } else {
        feedbackMessage = "Valid Philippine LTO Driver's License credentials detected.";
      }
    } else {
      feedbackMessage =
        "The uploaded card does not appear to be an official Philippine Driver's License. Please ensure the card is well-lit and clearly shows LTO headers.";
    }

    return {
      isValid,
      confidence: Math.min(score, 100),
      detectedLicenseNumber,
      matchedKeywords: allMatched,
      isOfficialLTO,
      feedbackMessage,
      rawText: text.slice(0, 500),
    };
  } catch (err: any) {
    console.warn('OCR verification warning:', err);
    // Graceful fallback if OCR fails or cannot load worker
    return {
      isValid: true, // Allow submission with warning so offline users are not blocked
      confidence: 50,
      matchedKeywords: [],
      isOfficialLTO: false,
      feedbackMessage: 'Card photo uploaded. Automated pre-scan was bypassed; our administrators will inspect your card manually.',
    };
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
