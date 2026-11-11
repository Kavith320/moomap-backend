// LoRa physical-layer model: link budget, packet success and time-on-air.
//
// RSSI   = txPower - pathLoss(d) - bodyLoss + shadowing
// pathLoss(d) = FSPL(1 m) + 10 * n * log10(d)      (log-distance model)
// SNR    = RSSI - noiseFloor,  noiseFloor = -174 + 10log10(BW) + NF
// A packet is received when SNR >= the demodulation limit for the spreading factor,
// and it survives a small random loss (interference / collisions).

const SNR_LIMIT_DB = { 7: -7.5, 8: -10, 9: -12.5, 10: -15, 11: -17.5, 12: -20 };
const NOISE_FIGURE_DB = 6;

function noiseFloorDbm(bwKhz) {
  return -174 + 10 * Math.log10(bwKhz * 1000) + NOISE_FIGURE_DB;
}

function sensitivityDbm(sf, bwKhz) {
  return noiseFloorDbm(bwKhz) + SNR_LIMIT_DB[sf];
}

function pathLossDb(distanceM, freqMhz, exponent) {
  const fspl1m = 20 * Math.log10(freqMhz) - 27.55; // free-space loss at 1 m
  return fspl1m + 10 * exponent * Math.log10(Math.max(distanceM, 1));
}

// Distance at which the mean RSSI hits the sensitivity limit (no shadowing).
function nominalRangeM(cfg) {
  const budget = cfg.txPowerDbm - cfg.bodyLossDb - sensitivityDbm(cfg.sf, cfg.bwKhz);
  const fspl1m = 20 * Math.log10(cfg.freqMhz) - 27.55;
  return Math.pow(10, (budget - fspl1m) / (10 * cfg.pathLossExponent));
}

/**
 * Simulate one transmission over `distanceM`.
 * @returns {{ received: boolean, rssi: number, snr: number, reason?: string }}
 */
function transmit(distanceM, cfg, rnd) {
  const rssi =
    cfg.txPowerDbm -
    pathLossDb(distanceM, cfg.freqMhz, cfg.pathLossExponent) -
    cfg.bodyLossDb +
    rnd.gauss(0, cfg.shadowingDb);
  const snr = rssi - noiseFloorDbm(cfg.bwKhz) + rnd.gauss(0, 1);
  const round1 = (v) => Math.round(v * 10) / 10;

  if (snr < SNR_LIMIT_DB[cfg.sf]) return { received: false, rssi: round1(rssi), snr: round1(snr), reason: "weak signal" };
  if (rnd.chance(cfg.randomLoss)) return { received: false, rssi: round1(rssi), snr: round1(snr), reason: "interference" };
  return { received: true, rssi: round1(rssi), snr: round1(snr) };
}

/**
 * Semtech SX127x time-on-air (ms), explicit header, CRC on, coding rate 4/(4+cr).
 */
function timeOnAirMs(payloadBytes, sf, bwKhz, { cr = 1, preamble = 8 } = {}) {
  const tSym = (Math.pow(2, sf) / (bwKhz * 1000)) * 1000;
  const lowDataRate = tSym > 16 ? 1 : 0;
  const tPreamble = (preamble + 4.25) * tSym;
  const num = 8 * payloadBytes - 4 * sf + 28 + 16; // CRC on, explicit header (H=0)
  const payloadSymbols = 8 + Math.max(Math.ceil(num / (4 * (sf - 2 * lowDataRate))) * (cr + 4), 0);
  return tPreamble + payloadSymbols * tSym;
}

// Shortest legal interval between packets for a duty-cycle limit (e.g. 0.01 = 1%).
function minIntervalS(payloadBytes, cfg) {
  return timeOnAirMs(payloadBytes, cfg.sf, cfg.bwKhz) / 1000 / cfg.dutyCycle;
}

module.exports = {
  SNR_LIMIT_DB,
  noiseFloorDbm,
  sensitivityDbm,
  pathLossDb,
  nominalRangeM,
  transmit,
  timeOnAirMs,
  minIntervalS,
};
