// Cattle movement in local metres (x = east, y = north).
//
// Normal behaviour is a state machine: graze (slow random walk), walk (to a spot in the
// pasture), rest (still). Cows drift back toward the herd if they stray, and turn around
// at the fence. Two forced modes drive test scenarios:
//   wander – head out through the fence to a point beyond it
//   home   – walk back to the middle of the pasture, then resume normal behaviour
const { pointInPolygon, distToEdge, centroid } = require("./geo");

const SPEED = { graze: 0.15, walk: 0.7, rest: 0, wander: 0.9, home: 0.9, goto: 0.8 }; // m/s
const LOITER_RADIUS_M = 25; // how far cows spread around a spot they were driven to
const COHESION_M = 70; // beyond this distance from the herd centre, bias toward it

class Cow {
  constructor({ cattleId, name, collarId, role, x, y }, rnd) {
    Object.assign(this, { cattleId, name, collarId, role, x, y });
    this.rnd = rnd;
    this.heading = rnd.range(0, 2 * Math.PI);
    this.mode = "normal";
    this.state = "graze";
    this.stateLeft = rnd.range(60, 600);
    this.target = null;
  }

  get pos() {
    return { x: this.x, y: this.y };
  }

  wander(pasture) {
    // pick the nearest edge direction from the herd centre and go 150 m beyond it
    const c = centroid(pasture);
    const angle = Math.atan2(this.y - c.y, this.x - c.x) + this.rnd.range(-0.3, 0.3);
    let r = 0;
    while (pointInPolygon({ x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) }, pasture) && r < 5000) r += 10;
    this.target = { x: c.x + (r + 150) * Math.cos(angle), y: c.y + (r + 150) * Math.sin(angle) };
    this.mode = "wander";
  }

  // Drop the cow at a point (e.g. dragged on the map). Inside the fence it carries on
  // grazing; outside it stays there until sent home.
  teleport(x, y, pasture) {
    this.x = x;
    this.y = y;
    if (pointInPolygon({ x, y }, pasture)) {
      this.mode = "normal";
      this.state = "graze";
      this.stateLeft = this.rnd.range(120, 600);
      this.target = null;
    } else {
      this.mode = "loiter";
      this.anchor = { x, y };
    }
  }

  // Walk to a point; on arrival graze there (inside the fence: normal life again).
  goTo(target) {
    this.target = target;
    this.mode = "goto";
  }

  settleAt(point, pasture) {
    if (pointInPolygon(point, pasture)) {
      this.mode = "normal";
      this.state = "graze";
      this.stateLeft = this.rnd.range(120, 600);
      this.target = null;
    } else {
      this.mode = "loiter";
      this.anchor = { x: point.x, y: point.y };
    }
  }

  goHome(pasture) {
    this.target = centroid(pasture);
    this.mode = "home";
  }

  pickState(pasture) {
    const roll = this.rnd.next();
    if (roll < 0.6) {
      this.state = "graze";
      this.stateLeft = this.rnd.range(120, 900);
    } else if (roll < 0.8) {
      this.state = "walk";
      this.stateLeft = this.rnd.range(60, 300);
      this.target = randomPointInside(pasture, this.rnd);
    } else {
      this.state = "rest";
      this.stateLeft = this.rnd.range(300, 1800);
    }
  }

  step(dt, pasture, herdCentre) {
    let speed;
    if (this.mode === "goto") {
      // walking to a chosen spot (fences don't stop a driven herd)
      speed = SPEED.goto;
      const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      if (d < speed * dt) {
        this.x = this.target.x;
        this.y = this.target.y;
        this.settleAt(this.target, pasture);
        return;
      }
      this.heading = Math.atan2(this.target.y - this.y, this.target.x - this.x) + this.rnd.gauss(0, 0.1);
      this.move(speed * dt);
      return;
    }
    if (this.mode === "loiter") {
      // grazing around the spot the herd was taken to, outside the pasture
      const fromAnchor = Math.hypot(this.anchor.x - this.x, this.anchor.y - this.y);
      this.heading =
        fromAnchor > LOITER_RADIUS_M
          ? Math.atan2(this.anchor.y - this.y, this.anchor.x - this.x)
          : this.heading + this.rnd.gauss(0, 0.4);
      this.move(SPEED.graze * dt);
      return;
    }
    if (this.mode === "wander" || this.mode === "home") {
      speed = SPEED[this.mode];
      this.heading = Math.atan2(this.target.y - this.y, this.target.x - this.x) + this.rnd.gauss(0, 0.15);
      const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      if (d < speed * dt) {
        // arrived: a wanderer grazes outside; a cow sent home resumes normal life
        if (this.mode === "home") this.mode = "normal";
        else speed = 0.05;
      }
      this.move(speed * dt);
      return;
    }

    this.stateLeft -= dt;
    if (this.stateLeft <= 0) this.pickState(pasture);

    speed = SPEED[this.state];
    if (this.state === "walk" && this.target) {
      this.heading = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      if (Math.hypot(this.target.x - this.x, this.target.y - this.y) < 5) this.pickState(pasture);
    } else {
      this.heading += this.rnd.gauss(0, 0.35);
    }

    // herd cohesion
    const toHerd = Math.hypot(herdCentre.x - this.x, herdCentre.y - this.y);
    if (toHerd > COHESION_M && this.state !== "rest") {
      const want = Math.atan2(herdCentre.y - this.y, herdCentre.x - this.x);
      this.heading = blendAngle(this.heading, want, 0.3);
    }

    const next = this.peek(speed * dt);
    if (!pointInPolygon(next, pasture)) {
      // cows respect the fence: turn around instead of crossing
      this.heading += Math.PI + this.rnd.gauss(0, 0.5);
      return;
    }
    this.move(speed * dt);
  }

  peek(dist) {
    return { x: this.x + dist * Math.cos(this.heading), y: this.y + dist * Math.sin(this.heading) };
  }

  move(dist) {
    const n = this.peek(dist);
    this.x = n.x;
    this.y = n.y;
  }

  insideFence(pasture) {
    return pointInPolygon(this.pos, pasture);
  }

  fenceDistance(pasture) {
    const d = distToEdge(this.pos, pasture);
    return this.insideFence(pasture) ? d : -d; // negative = outside
  }
}

function blendAngle(a, b, t) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

function randomPointInside(poly, rnd) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  for (let i = 0; i < 200; i++) {
    const p = { x: rnd.range(Math.min(...xs), Math.max(...xs)), y: rnd.range(Math.min(...ys), Math.max(...ys)) };
    if (pointInPolygon(p, poly) && distToEdge(p, poly) > 15) return p;
  }
  return centroid(poly);
}

class Herd {
  constructor(cows, pasture) {
    this.cows = cows;
    this.pasture = pasture;
  }

  step(dt) {
    // integrate in ≤5 s sub-steps so fast time scales stay stable
    const steps = Math.max(1, Math.ceil(dt / 5));
    for (let i = 0; i < steps; i++) {
      const centre = centroid(this.cows.filter((c) => c.mode === "normal").map((c) => c.pos));
      for (const cow of this.cows) cow.step(dt / steps, this.pasture, centre);
    }
  }

  // Send the whole herd to a point. Each cow gets its own spot in a loose cluster
  // around it (master included, so the slaves keep their relay nearby).
  // how: "walk" (they cross the fence on the way, like being driven) or "teleport".
  moveTo(point, how = "walk") {
    const n = this.cows.length;
    const spread = 6 + 4 * Math.sqrt(n);
    this.cows.forEach((cow, i) => {
      const angle = (i / n) * 2 * Math.PI + cow.rnd.range(-0.3, 0.3);
      const r = i === 0 ? 0 : spread * Math.sqrt(cow.rnd.range(0.2, 1));
      const spot = { x: point.x + r * Math.cos(angle), y: point.y + r * Math.sin(angle) };
      if (how === "teleport") cow.teleport(spot.x, spot.y, this.pasture);
      else cow.goTo(spot);
    });
  }

  find(nameOrId) {
    const q = String(nameOrId).toLowerCase();
    return this.cows.find(
      (c) => c.name.toLowerCase() === q || c.cattleId.toLowerCase() === q || c.collarId.toLowerCase() === q
    );
  }
}

module.exports = { Cow, Herd, randomPointInside };
