// Bridge script to expose ES6 modules to global scope for vue3-sfc-loader compatibility
import { Demodulator } from "./demodulator.js";
import { processCPRPosition, decodeCPRPosition } from "./cpr-decoder.js";

// Expose to global scope
window.Demodulator = Demodulator;
window.processCPRPosition = processCPRPosition;
window.decodeCPRPosition = decodeCPRPosition;
