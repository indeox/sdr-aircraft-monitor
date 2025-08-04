/**
 * CPR decoder for ADS-B 1090ES (airborne or surface position).
 * Inputs are the raw 17-bit CPR integers for latitude/longitude.
 *
 * References:
 * - ICAO DO-260B CPR algorithm (implemented from first principles here).
 *
 * Notes:
 * - yz/xz are 17-bit integers in [0 .. 131071] extracted from the message.
 * - "odd" is a boolean indicating the message format bit (1=odd, 0=even).
 * - For global decode you need a time-coherent even+odd pair (≈10 s window airborne, ≈5 s surface).
 */

const CPR_SCALE = 131072; // 2^17
const NZ = 15; // Number of latitude zones for airborne/surface CPR
const D_LAT_EVEN = 360 / (4 * NZ); // 360/60 = 6 degrees
const D_LAT_ODD = 360 / (4 * NZ - 1); // 360/59 ≈ 6.101694915...

// --- Helpers ----------------------------------------------------------------

function mod(a, n) {
  return a - n * Math.floor(a / n);
}

function toRange180(lonDeg) {
  let x = lonDeg % 360;
  if (x >= 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

function toRange90(latDeg) {
  // Normalize latitude to [-90, 90]
  let x = latDeg;
  // First bring to [-180, 180]
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  // Then handle out of range latitudes
  if (x > 90) {
    x = 180 - x;
  } else if (x < -90) {
    x = -180 - x;
  }
  return x;
}

// NL lookup table from ICAO spec (DO-260B)
const NL_TABLE = [
  59, 59, 59, 59, 59, 59, 59, 59, 59, 59,  // 0-9
  59, 58, 58, 58, 58, 57, 57, 57, 57, 56,  // 10-19
  56, 56, 55, 55, 54, 54, 53, 53, 52, 52,  // 20-29
  51, 51, 50, 50, 49, 49, 48, 47, 47, 46,  // 30-39
  45, 45, 44, 43, 43, 42, 41, 40, 40, 39,  // 40-49
  38, 37, 36, 36, 35, 34, 33, 32, 31, 30,  // 50-59
  29, 29, 28, 27, 26, 25, 24, 23, 22, 21,  // 60-69
  20, 19, 18, 17, 16, 15, 14, 13, 12, 11,  // 70-79
  10,  9,  8,  7,  5,  4,  3,  2,  2,  2   // 80-89
];

/**
 * NL(lat): number of longitude zones at a given latitude.
 * Returns an integer >= 1 (clamped) except extremely near the poles.
 */
function NL(latDeg) {
  const lat = Math.abs(latDeg);
  if (lat >= 90) return 1;
  const index = Math.floor(lat);
  return NL_TABLE[index] || 1;
}

/**
 * Compute dLon (longitude grid width) for a given latitude & format.
 */
function DLON(latDeg, isOdd) {
  const nl = NL(latDeg);
  const ni = Math.max(nl - (isOdd ? 1 : 0), 1);
  return 360 / ni;
}

// --- Global decode (even + odd pair) ----------------------------------------

/**
 * Decode a global position from an even+odd CPR pair.
 *
 * @param {Object} even - { xz: number, yz: number, t: number }  // t in milliseconds
 * @param {Object} odd  - { xz: number, yz: number, t: number }
 * @returns {{lat:number, lon:number}|null}  // null if pair inconsistent
 */
export function decodeCPRGlobal(even, odd) {
  // Normalize to [0,1) fractions
  const x0 = even.xz / CPR_SCALE,
    y0 = even.yz / CPR_SCALE;
  const x1 = odd.xz / CPR_SCALE,
    y1 = odd.yz / CPR_SCALE;

  // Latitude reconstruction
  const j = Math.floor(59 * y0 - 60 * y1 + 0.5);

  let rlat0 = D_LAT_EVEN * (mod(j, 60) + y0);
  let rlat1 = D_LAT_ODD * (mod(j, 59) + y1);

  rlat0 = toRange90(rlat0);
  rlat1 = toRange90(rlat1);

  // Consistency check: both lats must yield same NL
  if (NL(rlat0) !== NL(rlat1)) return null;

  // Choose the latitude based on most recent frame time
  // Note: For global decoding, we use the same frame (most recent) for both lat and lon
  const useOdd = odd.t >= even.t;  // Use odd if it's more recent or equal
  const lat = useOdd ? rlat1 : rlat0;

  // Longitude reconstruction
  const nl = NL(lat);
  const niEven = Math.max(nl, 1);
  const niOdd = Math.max(nl - 1, 1);

  // m index per spec: lon_even * (NL-1) - lon_odd * NL + 0.5
  const m = Math.floor(x0 * (nl - 1) - x1 * nl + 0.5);

  let lon;
  if (useOdd) {
    const dlon = 360 / niOdd;
    lon = dlon * (mod(m, niOdd) + x1);
  } else {
    const dlon = 360 / niEven;
    lon = dlon * (mod(m, niEven) + x0);
  }

  // Debug: log the intermediate values
  if (globalThis.DEBUG_CPR) {
    console.log('CPR Debug:', {
      x0, y0, x1, y1,
      rlat0, rlat1, lat,
      nl, niEven, niOdd,
      m, 
      useOdd,
      lonBeforeRange: lon,
      lonFinal: toRange180(lon)
    });
  }

  return { lat, lon: toRange180(lon) };
}


// --- Convenience wrappers ----------------------------------------------------

/**
 * Decode CPR frames using global decode only.
 * @param {Object} frames - { even?:{xz,yz,t}, odd?:{xz,yz,t} }
 * @param {Object} [opts]
 * @param {number} [opts.maxPairAgeSec=10] - max |t_even - t_odd| to allow (airborne ~10 s)
 */
export function decodeCPR(frames, opts = {}) {
  const { even, odd } = frames;
  const maxPairAgeSec = opts.maxPairAgeSec ?? 10;

  if (!even || !odd) {
    throw new Error("Both even and odd CPR frames required for global decode.");
  }

  if (Math.abs((odd.t - even.t) / 1000) > maxPairAgeSec) {
    throw new Error(`CPR frame pair too old (${Math.abs((odd.t - even.t) / 1000).toFixed(1)}s > ${maxPairAgeSec}s).`);
  }

  const global = decodeCPRGlobal(even, odd);
  if (!global) {
    throw new Error("CPR global decode failed - frames inconsistent.");
  }

  return global;
}

// --- High-level functions for Vue app ---------------------------------------

/**
 * Process CPR position message and store frame data
 * @param {Object} aircraft - Aircraft object with cprFrames property
 * @param {Object} msg - ADS-B message with position data
 */
export function processCPRPosition(aircraft, msg) {
  // Check if this is a position message (DF17 with metype 9-18)
  if (msg.msgtype === 17 && msg.rawLatitude != null && msg.rawLongitude != null) {
    const timestamp = Date.now();
    const isOdd = !!(msg.fflag); // fflag indicates odd (1) or even (0) frame

    // Store the CPR frame
    const cprFrame = {
      xz: msg.rawLongitude,
      yz: msg.rawLatitude,
      t: timestamp,
    };

    if (!aircraft.cprFrames) {
      aircraft.cprFrames = { even: null, odd: null };
    }

    if (isOdd) {
      aircraft.cprFrames.odd = cprFrame;
    } else {
      aircraft.cprFrames.even = cprFrame;
    }

    return true; // Position message processed
  }
  return false; // Not a position message
}

/**
 * Decode CPR position using global decode only
 * @param {Object} aircraft - Aircraft object with cprFrames
 * @returns {Object|null} - Decoded position or null if unable to decode
 */
export function decodeCPRPosition(aircraft) {
  try {
    if (!aircraft.cprFrames) {
      return null;
    }

    const { even, odd } = aircraft.cprFrames;
    if (!even || !odd) {
      return null; // Need both frames for global decode
    }

    const timeDiff = Math.abs((odd.t - even.t) / 1000);
    if (timeDiff > 15) {
      return null; // Frames too old
    }

    const global = decodeCPRGlobal(even, odd);
    if (!global) {
      return null; // Global decode failed
    }

    return {
      lat: global.lat,
      lon: global.lon,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error("CPR decode failed:", error);
  }
  return null;
}

// --- Example usage -----------------------------------------------------------

// const even = { xz: 102345, yz:  23456, t: Date.now() - 2000 };
// const odd  = { xz:  94567, yz: 123456, t: Date.now() };
// const pos1 = decodeCPRGlobal(even, odd);            // -> {lat, lon}
// const pos2 = decodeCPR({ even, odd });
