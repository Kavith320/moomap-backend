// src/services/geofenceEngine.js
// Pure state machine for one (cattle, fence) pair. No DB access.
//
// State shape: { status: "inside" | "outside" | null, pendingStatus, pendingCount }
//
// A status change is only confirmed after `confirmCount` consecutive readings
// agree, which filters out single-reading GPS jitter at the fence edge.
// The very first reading inside a fence is accepted silently; a first reading
// outside goes through confirmation and then raises an "exit".

function evaluateFence(prev, isInside, confirmCount = 2) {
  const observed = isInside ? "inside" : "outside";
  const status = (prev && prev.status) || null;
  const settled = (s) => ({ status: s, pendingStatus: null, pendingCount: 0 });

  if (observed === status) {
    return { state: settled(status), transition: null };
  }

  if (status === null && observed === "inside") {
    return { state: settled("inside"), transition: null };
  }

  const count =
    prev && prev.pendingStatus === observed ? (prev.pendingCount || 0) + 1 : 1;

  if (count >= Math.max(1, confirmCount)) {
    return {
      state: settled(observed),
      transition: observed === "outside" ? "exit" : "enter",
    };
  }

  return {
    state: { status, pendingStatus: observed, pendingCount: count },
    transition: null,
  };
}

module.exports = { evaluateFence };
