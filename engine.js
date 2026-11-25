// ENGINE: how the game plays. Nothing in here touches the menus or the network.
// Sections: config, state, effects, physics, grapple, tag rules (+ variants), practice bot, drawing,
// dev tools, and the platformer lab (experimental movement and game ideas, dev mode only).

/** Filled in by app.js so the engine can reach the menus and the network without importing them. */
export const bridge = { send() {}, pushState() {}, toast() {}, updateHud() {}, respawn() {}, mapChanged() {} };

// ===========================================================================
// CONFIG
// ===========================================================================

/** Values you can tune live from the dev panel. DEFAULTS never changes; T is what the game reads. */
export const DEFAULTS = {
    GRAVITY: 1220,
    GROUND_ACCEL: 2900,
    AIR_ACCEL: 2100,
    MAX_VX: 295,
    GROUND_FRICTION: 0.80,
    AIR_DRAG: 0.96,
    JUMP_VEL: -530,
    DOUBLE_JUMP_VEL: -475,
    WALL_JUMP_VX: 340,
    WALL_JUMP_VY: -515,
    DASH_SPEED: 640,
    DASH_COOLDOWN: 0.25,      // Tag (and its variants)
    DASH_COOLDOWN_PF: 0.1,    // Platformer
    MAX_GRAPPLE_DIST: 410,
    SLIDE_STACK_MUL: 1.25,    // Platformer slide stacking: a chained slide keeps this much of your speed...
    SLIDE_STACK_ADD: 130,     // ...and adds this much
    SLIDE_CAP_STEP: 0.5,      // every stack raises the speed limit by this many run speeds
    SLIDE_CAP_MAX: 3.4,       // the most (in run speeds) stacking can reach
};
export const T = { ...DEFAULTS };

export const COYOTE_TIME_MAX = 0.12;
export const JUMP_BUFFER_MAX = 0.13;
export const WALL_SLIDE_MAX_VY = 105;
export const DASH_DURATION = 0.14;
export const FAST_FALL_SPEED = 780;
export const SWING_PUMP_FORCE = 880;
export const SWING_DAMPING = 0.996;
export const STEP_TOLERANCE = 7;   // px a runner may sink into a surface and still be lifted on top of it
export const SOLID_CARDS = true;   // false = course cards are one-way ledges
export const TAG_FREEZE = 0.65;    // seconds nobody can be tagged after a tag
export const BOT_PAUSE = 0.5;      // "Always IT" practice: the bot stands still this long after tagging you
export const POTATO_FUSE = 12;         // Hot Potato: seconds the IT player holds the potato
export const FROZEN_AUTO_THAW = 12;    // Freeze Tag: seconds before a frozen player thaws by themselves
export const ROUND_PAUSE = 3;      // seconds the round banner shows before the next round
export const SWARM_EXTRA = 5;      // Infection: bots keep swarming the player this long into the next round
export const MAX_BOTS = 8;
const STAND_H = 18;
const SLIDE_H = 10;

/**
 * Server types. `dev: true` means it can only be joined with developer mode on (add ?dev=1 to the link).
 * Everything except "platformer" is a flavor of tag and shares the IT rules below.
 */
export const MODES = {
    tag:        { label: 'Tag' },
    infection:  { label: 'Infection (dev)',   dev: true },
    freeze:     { label: 'Freeze Tag (dev)',  dev: true },
    potato:     { label: 'Hot Potato (dev)',  dev: true },
    platformer: { label: 'Platformer (dev)',  dev: true },
};
export const TAG_MODES = ['tag', 'infection', 'freeze', 'potato'];

/** Bot difficulty. speed scales run speed; reaction is how often the bot updates where it thinks you are
 *  (seconds, bigger = more out of date); grapple / dash / jump are the chance it uses that move when it could. */
export const AI_LEVELS = {
    easy:   { label: 'Easy',   speed: 0.62, reaction: 0.45, grapple: 0,   dash: 0,   jump: 0.55 },
    normal: { label: 'Normal', speed: 0.82, reaction: 0.22, grapple: 0.6, dash: 0.5, jump: 0.85 },
    hard:   { label: 'Hard',   speed: 1,    reaction: 0.05, grapple: 1,   dash: 1,   jump: 1 },
};

export const PALETTES = [
    { body: '#2563eb', scarf: '#60a5fa', hat: '#1d4ed8', name: 'Cobalt' },
    { body: '#e11d48', scarf: '#fb7185', hat: '#be123c', name: 'Crimson' },
    { body: '#059669', scarf: '#34d399', hat: '#047857', name: 'Emerald' },
    { body: '#7c3aed', scarf: '#a78bfa', hat: '#6d28d9', name: 'Violet' },
    { body: '#d97706', scarf: '#fbbf24', hat: '#b45309', name: 'Amber' },
    { body: '#0891b2', scarf: '#22d3ee', hat: '#0e7490', name: 'Cyan' },
    { body: '#db2777', scarf: '#f472b6', hat: '#be185d', name: 'Magenta' },
    { body: '#4f46e5', scarf: '#818cf8', hat: '#4338ca', name: 'Indigo' },
    { body: '#16a34a', scarf: '#86efac', hat: '#15803d', name: 'Lime' },
    { body: '#ea580c', scarf: '#fdba74', hat: '#c2410c', name: 'Tangerine' },
];

// Developer mode: visit the site with ?dev=1 once (it is remembered), ?dev=0 turns it off again.
const params = new URLSearchParams(location.search);
const devStore = {
    get() { try { return localStorage.getItem('scb-dev'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem('scb-dev', v); } catch (e) {} },
};
const devParam = params.get('dev');
if (devParam !== null) devStore.set(devParam === '0' ? '' : '1');
export const DEV = devParam !== null ? devParam !== '0' : !!devStore.get();

// ===========================================================================
// SHARED STATE
// ===========================================================================
export const $ = (id) => document.getElementById(id);
export const canvas = $('ui-tag-canvas');
export const ctx = canvas.getContext('2d');
export const keys = {};

/**
 * The game world ("design space"). It is always ~1440 units wide whatever the window size or browser
 * zoom, so every player runs at the same speed relative to the screen. Page elements are converted
 * into this space when the map is scanned, and the canvas is drawn scaled back up.
 */
export const view = { w: 1440, h: 800, s: 1, ox: 0, oy: 0 }; // ox/oy: where the world starts on screen (letterbox)
const REF_W = 1440;
export const LEVEL_W = 1440;  // the Platformer's fixed world size
export const LEVEL_H = 810;
const MIN_SCALE = 0.7;
const MAX_SCALE = 2.2;

export function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const cleanRoom = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || 'UCAS-1';
export const cleanMode = (v) => {
    const m = MODES[v];
    return m && (!m.dev || DEV) ? v : 'tag';
};

const playerId = `guest-${crypto.randomUUID().slice(0, 8)}`;

export const G = {
    active: false,
    mode: cleanMode(params.get('mode')),
    room: cleanRoom(params.get('room')),
    playerId,
    paletteIndex: hashString(playerId) % PALETTES.length,
    name: '',
    botEnabled: true,
    botManual: false,
    botAlwaysIt: false, // Tag practice: the bots are permanently IT and you only run
    botCount: null,     // null = default for the mode (1 in Tag, 2 in the variants); the dev panel can change it
    botLevel: 'normal', // 'easy' | 'normal' | 'hard' | 'mixed'
    swarm: 0,           // Infection: seconds left of the bots rushing the player
    platforms: [],      // one-way ledges
    solids: [],         // fully solid boxes (course cards)
    remotes: new Map(),
    particles: [],
    afterimages: [],
    texts: [],
    tagFreeze: 0,
    clock: 0,           // game time in seconds (only runs while playing, follows dev slow-motion)
    round: { timer: 0, text: '' }, // tag variants: banner + countdown between rounds
    fps: 60,
    dev: { hitboxes: false, stats: false, fly: false, infJumps: false, teleport: false, timeScale: 1 },
};

export const roomKey = () => `${G.mode}-${G.room}`.toLowerCase();
export const palette = () => PALETTES[G.paletteIndex % PALETTES.length];
export const playerName = () => G.name.trim() || `${palette().name} Runner`;
export const isTag = () => TAG_MODES.includes(G.mode);
export const isPlatformer = () => G.mode === 'platformer';

export function makeRunner(id, over = {}) {
    return {
        id, x: 0, y: 0, w: 14, h: STAND_H, vx: 0, vy: 0,
        grounded: false, coyoteTimer: 0, jumpBufferTimer: 0, wallSide: 0, jumpsLeft: 2,
        dropThroughTimer: 0, fastFalling: false, facing: 1,
        bodyColor: '#2563eb', scarfColor: '#60a5fa', hatColor: '#1d4ed8',
        label: 'Runner',
        isIt: false, itChangedAt: 0, itSince: 0, tagsScored: 0,
        frozen: false, frozenAt: 0, out: false, ghost: false,
        walkCycle: 0, dashTimer: 0, dashCooldown: 0, dashDir: 1, dashX: 1, dashY: null, dashCharges: 1, pauseTimer: 0,
        sliding: false, slideTime: 0, slideAge: 0, slideStack: 0, prevDown: false, speedScale: 1,
        fly: false, infJumps: false,
        grapple: { active: false, ax: 0, ay: 0, length: 0, limit: 0 },
        ...over,
    };
}

const pal = palette();
export const local = makeRunner(playerId, {
    x: 240, y: 80, isIt: isTag(), itChangedAt: Date.now(),
    bodyColor: pal.body, scarfColor: pal.scarf, hatColor: pal.hat,
});

const BOT_COLORS = [
    ['#e11d48', '#fb7185', '#be123c'], ['#0891b2', '#22d3ee', '#0e7490'], ['#16a34a', '#86efac', '#15803d'], ['#d97706', '#fbbf24', '#b45309'],
    ['#7c3aed', '#a78bfa', '#6d28d9'], ['#db2777', '#f472b6', '#be185d'], ['#4f46e5', '#818cf8', '#4338ca'], ['#ea580c', '#fdba74', '#c2410c'],
];
/** The practice bots. Only the first few are active (see botCountFor); each is simulated by this game alone. */
export const bots = Array.from({ length: MAX_BOTS }, (_, i) => makeRunner(i === 0 ? 'local-bot' : `local-bot-${i}`, {
    x: 680 + i * 60, y: 80, facing: -1, dashDir: -1, dashX: -1, label: `Bot ${i + 1}`,
    bodyColor: BOT_COLORS[i][0], scarfColor: BOT_COLORS[i][1], hatColor: BOT_COLORS[i][2],
    aiJumpTimer: 0, aiGrappleTimer: 0, aiHookTime: 0, aiDashTimer: 0,
    level: 'normal', speedScale: AI_LEVELS.normal.speed, seen: { x: 0, y: 0, w: 14, h: 18 }, seenTimer: 0, seenWho: null,
}));
export const bot = bots[0];
export const botCountFor = () => clamp(G.botCount ?? (G.mode === 'tag' ? 1 : 2), 0, MAX_BOTS);
export const activeBots = () => (isTag() && G.botEnabled ? bots.slice(0, botCountFor()) : []);
export const botActive = () => activeBots().length > 0;

/** Give each bot its level. 'mixed' cycles Normal, Hard, Easy across the bots. */
export function setBotLevel(level) {
    G.botLevel = level;
    bots.forEach((b, i) => {
        b.level = level === 'mixed' ? ['normal', 'hard', 'easy'][i % 3] : level;
        b.speedScale = AI_LEVELS[b.level].speed;
    });
}

/**
 * Platformer lab: experimental movement and game ideas. They only apply in the Platformer server type
 * with developer mode on, and each can be switched on and off from the dev panel.
 */
export const PF = {
    grappleMode: 'auto',   // 'auto' = lock onto the nearest card | 'aimed' = pick a target (keyboard friendly)
    dashMode: 'cooldown',  // 'cooldown' (0.1s in the Platformer) | 'charges' (one dash, refilled by landing, touching a wall or hooking)
    dash8: true,           // dash in the direction you are holding, including up and down
    springs: true,         // spring pads in the level bounce you
    slide: true,           // hold S while running to slide
    slideStack: true,      // click S again after the cooldown, before the slide ends: a faster slide
    dimensions: false,     // Tab flips which half of the level is solid (cards, ledges and springs have a dimension)
    dim: 0,
    game: 'race',          // 'sandbox' | 'tide' (rising overdue floor) | 'race' (run through the flags, race your ghost)
    nextMap: true,         // finishing a built-in map moves you on to the next one
    aim: { cands: [], target: null, index: 0, manualUntil: 0, mx: 0, my: 0, mouseAt: 0 },
    tide: { t: 0, level: 0, collected: 0, best: 0 },
    collected: new Set(),
    pickups: [],
    race: { flags: [], next: 0, t: 0, done: false, doneAt: 0, best: null, ghost: [], rec: [], recT: 0, ghostRunner: null, sig: '' },
};
const labOn = () => isPlatformer() && DEV;

/** Match the design space to the window. Call on load, on every resize / zoom change, and when the mode changes.
 *  Tag and its variants fit the page. The Platformer is a fixed LEVEL_W x LEVEL_H world, scaled to fit and centered. */
export function resizeView() {
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (isPlatformer()) {
        view.w = LEVEL_W;
        view.h = LEVEL_H;
        view.s = Math.min(W / LEVEL_W, H / LEVEL_H);
        view.ox = (W - LEVEL_W * view.s) / 2;
        view.oy = (H - LEVEL_H * view.s) / 2;
    } else {
        view.s = clamp(W / REF_W, MIN_SCALE, MAX_SCALE);
        view.w = W / view.s;
        view.h = H / view.s;
        view.ox = 0;
        view.oy = 0;
    }
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
}

/** Screen pixels to design space. */
export const toDesign = (clientX, clientY) => ({ x: (clientX - view.ox) / view.s, y: (clientY - view.oy) / view.s });

/** Clear the canvas and set the transform so drawing uses design-space units. */
export function beginFrame() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = window.devicePixelRatio || 1;
    const k = dpr * view.s;
    ctx.setTransform(k, 0, 0, k, view.ox * dpr, view.oy * dpr);
}

export function clearScreen() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ===========================================================================
// EFFECTS
// ===========================================================================
export function spawnParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 45 + Math.random() * 140;
        G.particles.push({
            x, y, color,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 40,
            size: 2 + Math.random() * 2.5,
            life: 0.35 + Math.random() * 0.25,
            maxLife: 0.6,
        });
    }
}

export const addAfterimage = (r) =>
    G.afterimages.push({ x: r.x, y: r.y, w: r.w, h: r.h, color: r.scarfColor, life: 0.16, maxLife: 0.16 });

/** Floating text that rises and fades (e.g. "TAGGED!"). */
export const popText = (x, y, text, color, life = 0.8) => G.texts.push({ x, y, text, color, life, maxLife: life });

export function drawEffects(dt) {
    for (let i = G.afterimages.length - 1; i >= 0; i--) {
        const img = G.afterimages[i];
        if ((img.life -= dt) <= 0) { G.afterimages.splice(i, 1); continue; }
        ctx.globalAlpha = (img.life / img.maxLife) * 0.45;
        ctx.fillStyle = img.color;
        ctx.beginPath();
        ctx.roundRect(img.x + 1, img.y + 3, img.w - 2, img.h - 5, 4);
        ctx.fill();
    }
    for (let i = G.particles.length - 1; i >= 0; i--) {
        const p = G.particles[i];
        if ((p.life -= dt) <= 0) { G.particles.splice(i, 1); continue; }
        p.vy += 420 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = G.texts.length - 1; i >= 0; i--) {
        const t = G.texts[i];
        t.life -= dt;
        t.y -= 24 * dt;
        if (t.life <= 0) { G.texts.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = Math.min(1, t.life * 2);
        ctx.font = '900 14px Lato, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = t.color;
        ctx.shadowColor = 'rgba(15, 23, 42, 0.9)';
        ctx.shadowBlur = 5;
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
    }
}

// ===========================================================================
// PHYSICS & COLLISION
// ===========================================================================
const TOL = STEP_TOLERANCE;
const EPS = 1e-3;
const NO_INPUT = { left: false, right: false, up: false, down: false };

/** Strict AABB overlap with a tiny tolerance so flush surfaces do not count as touching. */
export const overlaps = (a, b) =>
    a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;

/** Read the world: the Platformer's level, or the page layout for Tag. Course cards are solid; the rest are one-way ledges. */
export function scanWorld() {
    if (isPlatformer()) { buildLevelWorld(); return; }
    const s = view.s;
    const box = (r, top = r.top, height = r.height) => ({ x: r.left / s, y: top / s, w: r.width / s, h: height / s });
    const platforms = [];
    const solids = [];
    document.querySelectorAll('[data-obstacle="true"]').forEach((el) => {
        if (el.offsetParent === null) return;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        (SOLID_CARDS && el.classList.contains('canvas-card') ? solids : platforms).push(box(r));
    });
    const header = document.querySelector('header');
    if (header) {
        const r = header.getBoundingClientRect();
        platforms.push(box(r, r.bottom, 4));
    }
    PF.pickups = [];
    G.platforms = platforms;
    G.solids = solids;
}

function land(r, surfaceY) {
    if (r.fastFalling) {
        spawnParticles(r.x + r.w / 2, surfaceY, r.scarfColor, 14);
        r.fastFalling = false;
    }
    r.y = surfaceY - r.h;
    r.vy = 0;
    r.grounded = true;
    r.coyoteTimer = COYOTE_TIME_MAX;
    r.jumpsLeft = 2;
}

const overLedgeX = (r, p) => r.x + r.w - 2 > p.x && r.x + 2 < p.x + p.w;

/** Horizontal pass: stop against the side of a solid box. */
function resolveX(r, prevX) {
    for (const s of G.solids) {
        if (!overlaps(r, s)) continue;
        if (r.vy >= 0 && r.y + r.h - s.y <= TOL) continue; // feet barely inside the top edge: the vertical pass lands us
        if (prevX + r.w / 2 < s.x + s.w / 2) {
            r.x = s.x - r.w;
            if (r.vx > 0) r.vx = 0;
        } else {
            r.x = s.x + s.w;
            if (r.vx < 0) r.vx = 0;
        }
    }
}

/** Vertical pass: land on top of solids, bump the head underneath them. */
function resolveY(r, prevTop, prevBottom) {
    for (const s of G.solids) {
        if (!overlaps(r, s)) continue;
        if (r.vy >= 0 && prevBottom <= s.y + TOL) land(r, s.y);
        else if (r.vy < 0 && prevTop >= s.y + s.h - TOL) { r.y = s.y + s.h; r.vy = 0; }
    }
}

/** One-way ledges: only catch a runner that was above them last step and is falling. Springs launch you. */
function landOnLedges(r, prevBottom) {
    if (r.vy < 0 || r.dropThroughTimer > 0) return;
    for (const p of G.platforms) {
        if (!(overLedgeX(r, p) && prevBottom <= p.y + TOL && r.y + r.h >= p.y)) continue;
        land(r, p.y);
        if (p.spring && labOn() && PF.springs) {
            r.vy = -830;
            r.grounded = false;
            r.jumpsLeft = 1;
            spawnParticles(r.x + r.w / 2, p.y, '#4ade80', 10);
        }
        return;
    }
}

/** Safety net: if a runner ends up inside a solid (layout changed, rope snap), push out the shortest way. */
function depenetrate(r) {
    for (const s of G.solids) {
        if (!overlaps(r, s)) continue;
        const up = r.y + r.h - s.y;
        const down = s.y + s.h - r.y;
        const left = r.x + r.w - s.x;
        const right = s.x + s.w - r.x;
        const m = Math.min(up, down, left, right);
        if (m === up) land(r, s.y);
        else if (m === down) { r.y = s.y + s.h; if (r.vy < 0) r.vy = 0; }
        else if (m === left) { r.x = s.x - r.w; if (r.vx > 0) r.vx = 0; }
        else { r.x = s.x + s.w; if (r.vx < 0) r.vx = 0; }
    }
}

/** What is directly under the runner's feet: 'floor' | 'solid' | 'ledge' | null. */
export function supportOf(r) {
    const feet = r.y + r.h;
    if (feet >= view.h - 0.5) return 'floor';
    if (G.solids.some((s) => r.x < s.x + s.w && r.x + r.w > s.x && Math.abs(feet - s.y) < 0.75)) return 'solid';
    if (r.dropThroughTimer <= 0 && G.platforms.some((p) => overLedgeX(r, p) && Math.abs(feet - p.y) < 0.75)) return 'ledge';
    return null;
}

/** -1 / 1 if a wall (card side or screen edge) touches the left / right side, else 0. */
function detectWall(r) {
    if (r.x <= 2.5) return -1;
    if (r.x + r.w >= view.w - 2.5) return 1;
    for (const s of G.solids) {
        if (r.y + r.h <= s.y + 4 || r.y >= s.y + s.h - 4) continue;
        if (Math.abs(r.x + r.w - s.x) <= 1.5) return 1;
        if (Math.abs(r.x - (s.x + s.w)) <= 1.5) return -1;
    }
    return 0;
}

/** Keep the runner within the rope length and remove outward velocity, preserving swing energy. */
function applyRope(r) {
    const g = r.grapple;
    const dx = r.x + r.w / 2 - g.ax;
    const dy = r.y + 5 - g.ay;
    const dist = Math.hypot(dx, dy);
    if (dist <= g.length || dist < 0.001) return;
    const nx = dx / dist;
    const ny = dy / dist;
    r.x = g.ax + nx * g.length - r.w / 2;
    r.y = g.ay + ny * g.length - 5;
    const radial = r.vx * nx + r.vy * ny;
    if (radial > 0) {
        r.vx -= radial * nx;
        r.vy -= radial * ny;
    }
}

function keepInBounds(r) {
    if (r.x < 2) { r.x = 2; if (r.vx < 0) r.vx = 0; }
    if (r.x + r.w > view.w - 2) { r.x = view.w - r.w - 2; if (r.vx > 0) r.vx = 0; }
    if (r.y < 0) { r.y = 0; if (r.vy < 0) r.vy = 0; }
    if (r.y + r.h >= view.h) land(r, view.h);
}

/** Move in small sub-steps so fast dashes/falls cannot tunnel through thin ledges. */
function moveAndCollide(r, dt) {
    const steps = Math.min(8, Math.max(1, Math.ceil((Math.max(Math.abs(r.vx), Math.abs(r.vy)) * dt) / 6)));
    const h = dt / steps;
    r.grounded = false;
    for (let i = 0; i < steps; i++) {
        const prevX = r.x;
        const prevTop = r.y;
        const prevBottom = r.y + r.h;
        r.x += r.vx * h;
        resolveX(r, prevX);
        r.y += r.vy * h;
        resolveY(r, prevTop, prevBottom);
        landOnLedges(r, prevBottom);
        if (r.grapple.active) applyRope(r);
        depenetrate(r);
        keepInBounds(r);
    }
    // Standing still on a surface produces no landing event, so confirm support explicitly.
    if (!r.grounded && r.vy >= 0 && supportOf(r)) {
        r.grounded = true;
        r.vy = 0;
        r.coyoteTimer = COYOTE_TIME_MAX;
        r.jumpsLeft = 2;
    }
    r.wallSide = detectWall(r);
}

// --- slide (lab) -----------------------------------------------------------
const standClear = (r) => !G.solids.some((s) => overlaps({ x: r.x, y: r.y - (STAND_H - SLIDE_H), w: r.w, h: STAND_H }, s));

/** Slide tuning. A slide lasts DURATION seconds. After COOLDOWN seconds you can click S again for a faster slide. */
const SLIDE = { DURATION: 0.8, COOLDOWN: 0.4, BOOST: 160, CAP: 1.5, MAX_STACK: 6, FRICTION: 0.99 };

/** Start a slide, or (chain) start the next one from inside a slide for a bit more speed. */
function startSlide(r, chain) {
    if (!r.sliding) {
        r.sliding = true;
        r.y += STAND_H - SLIDE_H;
        r.h = SLIDE_H;
    }
    r.slideTime = SLIDE.DURATION;
    r.slideAge = 0;
    r.slideStack = chain ? Math.min(r.slideStack + 1, SLIDE.MAX_STACK) : 0;
    const cap = T.MAX_VX * Math.min(T.SLIDE_CAP_MAX, SLIDE.CAP + T.SLIDE_CAP_STEP * r.slideStack);
    const speed = chain ? Math.abs(r.vx) * T.SLIDE_STACK_MUL + T.SLIDE_STACK_ADD : Math.abs(r.vx) + SLIDE.BOOST;
    r.vx = (Math.sign(r.vx) || r.facing) * Math.min(speed, cap);
    spawnParticles(r.x + r.w / 2, r.y + r.h, chain ? '#fbbf24' : '#cbd5e1', chain ? 10 : 6);
}

function endSlide(r) {
    r.sliding = false;
    r.slideStack = 0;
    r.y -= STAND_H - SLIDE_H;
    r.h = STAND_H;
}

// --- actions ---------------------------------------------------------------
/** Dash. In the dash lab, `vec` is the direction held ({x, y}) and a charge replaces the cooldown. */
export function triggerDash(r, dir, vec = null) {
    if (r.dashTimer > 0 || r.frozen) return;
    const charges = labOn() && PF.dashMode === 'charges';
    if (charges ? r.dashCharges <= 0 : r.dashCooldown > 0) return;
    if (charges) r.dashCharges--; else r.dashCooldown = isPlatformer() ? T.DASH_COOLDOWN_PF : T.DASH_COOLDOWN;

    r.grapple.active = false;
    r.fastFalling = false;
    const face = dir || r.facing || 1;
    let dx = face;
    let dy = null;
    if (vec && labOn() && PF.dash8 && (vec.x || vec.y)) {
        const m = Math.hypot(vec.x, vec.y);
        dx = vec.x / m;
        dy = vec.y / m;
    }
    r.dashDir = dx ? Math.sign(dx) : face;
    r.facing = r.dashDir;
    r.dashX = dx;
    r.dashY = dy;
    r.dashTimer = DASH_DURATION;
    r.vx = dx * T.DASH_SPEED;
    r.vy = dy === null ? -40 : dy * T.DASH_SPEED;
    spawnParticles(r.x + r.w / 2, r.y + r.h / 2, r.scarfColor, 10);
}

export function handleJump(r) {
    if (r.frozen) return;
    // Sliding: stand up first (and carry the speed into the jump).
    if (r.sliding) {
        if (!standClear(r)) return;
        endSlide(r);
        r.vx *= 1.15;
    }
    // 1. Release from the grapple: keeps swing momentum and adds a boost.
    if (r.grapple.active) {
        r.grapple.active = false;
        r.jumpBufferTimer = 0;
        r.fastFalling = false;
        r.vy = Math.min(r.vy - 210, -450);
        r.vx *= 1.24;
        r.jumpsLeft = 1;
        spawnParticles(r.x + r.w / 2, r.y + r.h / 2, '#fbbf24', 10);
        return;
    }
    // 2. Ground / coyote-time jump
    if (r.grounded || r.coyoteTimer > 0) {
        r.vy = T.JUMP_VEL;
        r.grounded = false;
        r.coyoteTimer = 0;
        r.jumpBufferTimer = 0;
        r.fastFalling = false;
        r.jumpsLeft = 1;
        spawnParticles(r.x + r.w / 2, r.y + r.h, '#94a3b8', 6);
        return;
    }
    // 3. Wall-jump
    if (r.wallSide !== 0) {
        r.vx = -r.wallSide * T.WALL_JUMP_VX;
        r.vy = T.WALL_JUMP_VY;
        r.facing = -r.wallSide;
        r.wallSide = 0;
        r.jumpBufferTimer = 0;
        r.fastFalling = false;
        r.jumpsLeft = 1;
        spawnParticles(r.x + (r.facing === 1 ? 0 : r.w), r.y + r.h / 2, '#cbd5e1', 8);
        return;
    }
    // 4. Double jump (unlimited with the dev "infinite jumps" switch)
    if (r.jumpsLeft > 0 || r.infJumps) {
        r.vy = T.DOUBLE_JUMP_VEL;
        if (!r.infJumps) r.jumpsLeft = 0;
        r.jumpBufferTimer = 0;
        r.fastFalling = false;
        spawnParticles(r.x + r.w / 2, r.y + r.h, r.scarfColor, 8);
    }
}

/** Mid-air S / Down: dive straight down. */
export function fastFall(r) {
    if (r.grounded || r.grapple.active || r.vy <= -180 || r.frozen) return;
    r.fastFalling = true;
    r.vy = Math.max(r.vy, FAST_FALL_SPEED);
    spawnParticles(r.x + r.w / 2, r.y, r.scarfColor, 6);
}

/** Dev fly mode: no gravity, no collisions, move freely with the movement keys. */
function flyStep(r, dt, { left, right, up, down }) {
    const speed = T.MAX_VX * 1.6;
    r.vx = ((right ? 1 : 0) - (left ? 1 : 0)) * speed;
    r.vy = ((down ? 1 : 0) - (up ? 1 : 0)) * speed;
    if (r.vx) r.facing = Math.sign(r.vx);
    r.x = clamp(r.x + r.vx * dt, 0, view.w - r.w);
    r.y = clamp(r.y + r.vy * dt, 0, view.h - r.h);
    r.grapple.active = false;
    r.grounded = false;
}

/** Advance one runner by `dt` seconds. input = { left, right, up, down } booleans. */
export function stepRunner(r, dt, rawInput) {
    // Frozen runners (Freeze Tag) cannot act at all.
    if (r.frozen) {
        r.vx = 0;
        r.dashTimer = 0;
        r.grapple.active = false;
    }
    const input = r.frozen ? NO_INPUT : rawInput;
    const { left, right, up, down } = input;
    const pressed = down && !r.prevDown; // a fresh press of S, not a held key
    r.prevDown = down;

    for (const k of ['dropThroughTimer', 'dashCooldown', 'coyoteTimer', 'jumpBufferTimer']) {
        if (r[k] > 0) r[k] -= dt;
    }
    if (r.fly) { flyStep(r, dt, input); return; }

    // Drop through a one-way ledge (never through solid cards or the floor)
    if (down && r.grounded && !r.grapple.active && !r.sliding && supportOf(r) === 'ledge') {
        r.dropThroughTimer = 0.22;
        r.grounded = false;
        r.coyoteTimer = 0;
        r.y += 4;
    }

    // Slide (lab): hold S while running on the floor or a card. With stacking on, click S again after the
    // cooldown and before the slide ends to slide again with more speed.
    if (labOn() && PF.slide) {
        const support = supportOf(r);
        const slideSurface = r.grounded && (support === 'floor' || support === 'solid');
        if (r.sliding) r.slideAge += dt;
        if (!r.sliding) {
            if (down && slideSurface && Math.abs(r.vx) > 150 && !r.grapple.active && r.dashTimer <= 0) startSlide(r, false);
        } else if (PF.slideStack && pressed && r.slideAge >= SLIDE.COOLDOWN && slideSurface && Math.abs(r.vx) > 100) {
            startSlide(r, true);
        }
        if (r.sliding) {
            r.slideTime -= dt;
            const released = !PF.slideStack && !down && r.slideAge >= SLIDE.COOLDOWN;
            if (r.slideTime <= 0 || released || !r.grounded || Math.abs(r.vx) < 60) {
                if (standClear(r)) endSlide(r); else r.slideTime = 0.05; // stay low until there is room to stand
            }
        }
    } else if (r.sliding) endSlide(r);

    // Horizontal control
    if (r.dashTimer > 0) {
        r.dashTimer -= dt;
        r.vx = r.dashX * T.DASH_SPEED;
        if (r.dashY !== null) r.vy = r.dashY * T.DASH_SPEED;
        if (r.dashTimer <= 0 && r.dashY !== null) { r.vx *= 0.55; r.vy *= 0.45; } // do not overshoot after a free-direction dash
        if (Math.random() < 0.75) addAfterimage(r);
    } else if (r.grapple.active) {
        // Pump the pendulum along its tangent
        const rx = r.x + r.w / 2 - r.grapple.ax;
        const ry = r.y + 5 - r.grapple.ay;
        const dist = Math.max(1, Math.hypot(rx, ry));
        const dir = (right ? 1 : 0) - (left ? 1 : 0);
        if (dir) {
            r.vx += dir * (ry / dist) * SWING_PUMP_FORCE * dt;
            r.vy += dir * (-rx / dist) * SWING_PUMP_FORCE * dt;
            r.facing = dir;
        }
        const damp = Math.pow(SWING_DAMPING, dt * 60);
        r.vx *= damp;
        r.vy *= damp;
    } else if (r.sliding) {
        r.vx *= Math.pow(SLIDE.FRICTION, dt * 60); // very little friction
    } else {
        const accel = (r.grounded ? T.GROUND_ACCEL : T.AIR_ACCEL) * r.speedScale;
        const maxVx = T.MAX_VX * r.speedScale;
        // Carrying extra speed from stacked slides: running does not add to it, and it fades out gradually
        // instead of snapping back to the run speed.
        const carrying = labOn() && PF.slideStack && Math.abs(r.vx) > maxVx;
        if (left) { if (!(carrying && r.vx < 0)) r.vx -= accel * dt; r.facing = -1; }
        if (right) { if (!(carrying && r.vx > 0)) r.vx += accel * dt; r.facing = 1; }
        if (!left && !right) r.vx *= Math.pow(r.grounded ? T.GROUND_FRICTION : T.AIR_DRAG, dt * 60);
        if (carrying && Math.abs(r.vx) > maxVx) r.vx = Math.sign(r.vx) * (maxVx + (Math.abs(r.vx) - maxVx) * Math.pow(0.25, dt));
        else r.vx = clamp(r.vx, -maxVx, maxVx);
    }

    // Gravity (lighter near the jump apex)
    if (r.dashTimer <= 0) {
        const apex = !r.grounded && !r.grapple.active && Math.abs(r.vy) < 95 ? 0.68 : 1;
        r.vy += T.GRAVITY * apex * dt;
    }

    // Reel the grapple cable
    if (r.grapple.active) {
        if (up) r.grapple.length = Math.max(20, r.grapple.length - 255 * dt);
        else if (down) r.grapple.length = Math.min(r.grapple.limit || T.MAX_GRAPPLE_DIST, r.grapple.length + 210 * dt);
    }

    const wasGrounded = r.grounded;
    moveAndCollide(r, dt);

    // One dash charge comes back whenever you touch ground, a wall, or hang from a hook.
    if (r.grounded || r.wallSide !== 0 || r.grapple.active) r.dashCharges = 1;

    // Wall slide
    const pushingWall = (r.wallSide < 0 && left) || (r.wallSide > 0 && right);
    if (pushingWall && !r.grounded && r.vy > WALL_SLIDE_MAX_VY && !r.grapple.active) {
        r.vy = WALL_SLIDE_MAX_VY;
        if (Math.random() < 0.25) spawnParticles(r.wallSide > 0 ? r.x + r.w : r.x, r.y + r.h * 0.7, '#cbd5e1', 1);
    }

    if (wasGrounded && !r.grounded && r.vy >= 0) r.coyoteTimer = COYOTE_TIME_MAX; // walked off a ledge
    if (r.grounded && r.jumpBufferTimer > 0) handleJump(r);                         // buffered jump

    r.walkCycle = r.grounded && Math.abs(r.vx) > 15 ? r.walkCycle + Math.abs(r.vx) * dt * 0.14 : 0;
}

// ===========================================================================
// GRAPPLE
// ===========================================================================
function attachHook(r, x, y, dist) {
    const g = r.grapple;
    g.active = true;
    g.ax = x;
    g.ay = y;
    g.length = Math.max(24, dist * 0.92);
    g.limit = Math.max(T.MAX_GRAPPLE_DIST, g.length); // far hooks may be longer than the normal range
    r.grounded = false;
    r.fastFalling = false;
    r.jumpsLeft = 1;
    r.dashCharges = 1;
    if (Math.abs(r.vx) < 90) r.vx += r.facing * 115; // small kick when dropping from rest
    spawnParticles(x, y, '#fbbf24', 9);
}

/** Fire the hook diagonally (or straight up). It always locks onto a card: first whatever the aim hits,
 *  then a nearby ledge corner, then simply the nearest card at any distance. Toggles off if already hooked. */
export function toggleGrapple(r, straightUp = false) {
    if (r.grapple.active) { r.grapple.active = false; return; }
    if (r.frozen) return;

    const ox = r.x + r.w / 2;
    const oy = r.y + 4;
    let dx = straightUp ? 0 : r.facing * 0.65;
    let dy = straightUp ? -1 : -0.76;
    const mag = Math.hypot(dx, dy);
    dx /= mag;
    dy /= mag;

    const anchors = [...G.solids, ...G.platforms];
    const range = T.MAX_GRAPPLE_DIST;
    let bestDist = range;
    let hitX = null;
    let hitY = null;

    // 1. Walk along the aim until something is hit.
    for (let d = 18; d <= range && hitX === null; d += 4) {
        const px = ox + dx * d;
        const py = oy + dy * d;
        if (py <= 3 || px <= 3 || px >= view.w - 3) {
            bestDist = d;
            hitX = clamp(px, 3, view.w - 3);
            hitY = Math.max(3, py);
        } else if (anchors.some((p) => px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h)) {
            bestDist = d;
            hitX = px;
            hitY = py;
        }
    }

    // 2. Nothing on the ray: snap to the best nearby ledge corner in the aiming direction.
    if (hitX === null) {
        let bestScore = Infinity;
        for (const p of anchors) {
            for (const c of [{ x: p.x + 4, y: p.y + 2 }, { x: p.x + p.w - 4, y: p.y + 2 }, { x: p.x + p.w / 2, y: p.y + 2 }]) {
                const vx = c.x - ox;
                const vy = c.y - oy;
                const dist = Math.hypot(vx, vy);
                if (dist <= 24 || dist > range || vy >= -10) continue;
                const dot = (vx / dist) * dx + (vy / dist) * dy;
                const score = dist * (1.2 - dot);
                if (dot > 0.68 && score < bestScore) { bestScore = score; bestDist = dist; hitX = c.x; hitY = c.y; }
            }
        }
    }

    // 3. Still nothing: lock onto the nearest card anyway, at any distance.
    if (hitX === null) {
        let nearest = Infinity;
        for (const p of G.solids.length ? G.solids : anchors) {
            const px = clamp(ox, p.x + 4, p.x + p.w - 4);
            const py = clamp(oy - 20, p.y + 2, p.y + p.h);
            const dist = Math.hypot(px - ox, py - oy);
            if (dist > 24 && dist < nearest) { nearest = dist; bestDist = dist; hitX = px; hitY = py; }
        }
    }

    if (hitX === null) {
        spawnParticles(ox + dx * 65, oy + dy * 65, '#94a3b8', 4);
        return;
    }
    attachHook(r, hitX, hitY, bestDist);
}

// --- aimed grapple (lab) ---------------------------------------------------
// Keyboard first: the nearest hookable point is highlighted, E fires, R picks the next one.
// The pointer (or a trackpad tap) is optional: point near a spot and it is highlighted instead.
const aim = PF.aim;

/** Pointer moved: highlight the point nearest to it (coordinates are screen pixels). */
export function aimPointer(clientX, clientY) {
    const p = toDesign(clientX, clientY);
    aim.mx = p.x;
    aim.my = p.y;
    aim.mouseAt = performance.now();
    aim.manualUntil = 0;
}

/** R key: cycle through the hookable points, nearest first. */
export function aimCycle() {
    aim.index++;
    aim.manualUntil = performance.now() + 3000;
}

function aimCandidates(r) {
    const ox = r.x + r.w / 2;
    const oy = r.y + 4;
    const pts = [];
    for (const b of G.solids) {
        for (const [x, y] of [[b.x + 4, b.y + 2], [b.x + b.w - 4, b.y + 2], [b.x + b.w / 2, b.y + b.h - 2], [b.x + 4, b.y + b.h - 2], [b.x + b.w - 4, b.y + b.h - 2]]) pts.push({ x, y });
    }
    for (const b of G.platforms) pts.push({ x: b.x + 4, y: b.y + 2 }, { x: b.x + b.w - 4, y: b.y + 2 }, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
    return pts
        .map((p) => ({ ...p, d: Math.hypot(p.x - ox, p.y - oy) }))
        .filter((p) => p.y < oy + 8 && p.d > 24 && p.d <= T.MAX_GRAPPLE_DIST)
        .sort((a, b) => a.d - b.d);
}

/** Refresh the candidate list and the highlighted target. Runs every frame while aimed mode is on. */
export function updateAim() {
    const r = local;
    const cands = aimCandidates(r);
    aim.cands = cands;
    if (!cands.length) { aim.target = null; return; }
    const now = performance.now();
    if (now < aim.manualUntil) {
        aim.target = cands[aim.index % cands.length];
    } else if (now - aim.mouseAt < 2000) {
        aim.target = cands.reduce((best, c) => (Math.hypot(c.x - aim.mx, c.y - aim.my) < Math.hypot(best.x - aim.mx, best.y - aim.my) ? c : best));
    } else {
        const ahead = cands.filter((c) => (c.x - r.x) * r.facing > 0);
        aim.target = (ahead.length ? ahead : cands)[0];
        aim.index = cands.indexOf(aim.target);
    }
}

/** E key. Classic: lock onto the nearest card. Aimed lab mode: hook the highlighted point (cards and ledges only, never players). */
export function grappleAction(r) {
    if (r.grapple.active) { r.grapple.active = false; return; }
    if (r.frozen) return;
    if (labOn() && PF.grappleMode === 'aimed' && r === local) {
        updateAim();
        const t = aim.target;
        if (t) attachHook(r, t.x, t.y, t.d);
        else spawnParticles(r.x + r.w / 2, r.y - 20, '#94a3b8', 4);
        return;
    }
    toggleGrapple(r, false);
}

// ===========================================================================
// TAG RULES (and the Infection / Freeze Tag / Hot Potato variants)
// ===========================================================================
// Whoever is IT tags another runner by touching them. This game only decides tags for the runners it
// simulates: you and the practice bots. Other players' games decide theirs.
//   tag        classic: IT passes to the person you touch
//   infection  the tagger stays IT and the tagged runner becomes IT too; round ends when everyone is IT,
//              then the bots swarm the player for a few seconds
//   freeze     the tagged runner freezes until a free runner touches them; round ends when all are frozen
//   potato     like classic, but IT has a fuse; when it runs out IT is out for the round; last one standing wins
// The variants pick the first IT at random every round.
const touching = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const participants = () => [local, ...G.remotes.values(), ...activeBots()];
const simulated = () => [local, ...activeBots()];
const humans = () => [local, ...G.remotes.values()].filter((p) => !p.out);
const isRemote = (p) => p !== local && !bots.includes(p);
const nameOf = (p) => (p === local ? playerName() : p.label || 'Runner');
/** The lowest-id human makes the shared decisions (who starts as IT). */
const isHost = () => [local, ...G.remotes.values()].sort((a, b) => a.id.localeCompare(b.id))[0] === local; // counts players who are out too

/** Make sure the right humans are IT. Called whenever the roster changes. */
export function reconcileIt() {
    if (!isTag() || G.remotes.size === 0) return;
    const all = humans();
    if (!all.length) return;
    const its = all.filter((p) => p.isIt);
    if (its.length === 0) {
        // Nobody is IT: the lowest id volunteers, so every client agrees.
        all.sort((a, b) => a.id.localeCompare(b.id));
        if (all[0] === local) { local.isIt = true; local.itChangedAt = Date.now();
local.itSince = G.clock; }
    } else if (its.length > 1 && G.mode !== 'infection') {
        // Several IT: the most recently changed one wins. (Infection is supposed to have several.)
        its.sort((a, b) => (b.itChangedAt || 0) - (a.itChangedAt || 0));
        if (its[0] !== local) local.isIt = false;
    }
    bridge.updateHud();
}

function setIt(p) {
    p.isIt = true;
    p.itChangedAt = Date.now();
p.itSince = G.clock;
    if (isRemote(p)) bridge.send({ type: 'start-it', targetId: p.id, room: roomKey() });
}

/** Pick the first IT at random from everyone playing (you, other players, bots). Only the lowest-id human
 *  picks; they tell the others, so everyone agrees on one tagger. */
export function assignRandomIt() {
    for (const p of participants()) p.isIt = false;
    if (!isHost()) return;
    const pool = participants().filter((p) => !p.out);
    setIt(pool[Math.floor(Math.random() * pool.length)]);
    bridge.updateHud();
    bridge.pushState();
}

/** The host picked us to start as IT. */
export function startAsIt() {
    if (!isTag() || local.out) return;
    local.isIt = true;
    local.itChangedAt = Date.now();
local.itSince = G.clock;
    bridge.updateHud();
    bridge.pushState();
}

/** A remote player tagged us. */
export function becomeIt() {
    if (!isTag() || local.isIt || local.out) return;
    local.isIt = true;
    local.itChangedAt = Date.now();
local.itSince = G.clock;
    G.tagFreeze = 0.55;
    local.vy = -240;
    local.grapple.active = false;
    spawnParticles(local.x + 7, local.y + 9, '#fbbf24', 18);
    bridge.updateHud();
    bridge.pushState();
}

/** A remote player froze us (Freeze Tag). */
export function freezeLocal() {
    if (G.mode !== 'freeze' || local.frozen || local.isIt) return;
    local.frozen = true;
    local.frozenAt = G.clock;
    local.vx = 0;
    popText(local.x + local.w / 2, local.y - 10, 'FROZEN!', '#93c5fd', 0.9);
    spawnParticles(local.x + 7, local.y + 9, '#bfdbfe', 16);
    bridge.pushState();
}

/** A teammate thawed us (or the timer did). */
export function thawLocal() {
    if (!local.frozen) return;
    local.frozen = false;
    popText(local.x + local.w / 2, local.y - 10, 'THAWED', '#86efac', 0.8);
    spawnParticles(local.x + 7, local.y + 9, '#86efac', 12);
    bridge.pushState();
}

/** Clear per-round state (frozen, out, banner). Used on room changes and between rounds. */
export function resetRoundState() {
    for (const r of [local, ...bots]) { r.frozen = false; r.out = false; }
    G.round.timer = 0;
    G.round.text = '';
    G.swarm = 0;
}

function startNextRound() {
    resetRoundState();
    for (const rp of G.remotes.values()) { rp.frozen = false; rp.out = false; }
    assignRandomIt();
}

function endRound(text) {
    G.round.text = text;
    G.round.timer = ROUND_PAUSE;
    if (G.mode === 'infection') G.swarm = ROUND_PAUSE + SWARM_EXTRA; // bots rush the player through the next round's opening
    bridge.toast(text);
}

function explode(p) {
    p.out = true;
    p.isIt = false;
    popText(p.x + p.w / 2, p.y - 12, 'BOOM!', '#fb923c', 1);
    spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#fb923c', 30);
    if (p === local) bridge.pushState();
}

/** Round bookkeeping for the variants: fuses, auto-thaw, and end-of-round checks. */
function tickRound(dt) {
    G.clock += dt;
    if (G.swarm > 0) G.swarm -= dt;
    const R = G.round;
    if (R.timer > 0) {
        R.timer -= dt;
        if (R.timer <= 0) startNextRound();
        return;
    }
    const all = participants();
    if (G.mode === 'freeze') {
        for (const r of simulated()) if (r.frozen && G.clock - r.frozenAt > FROZEN_AUTO_THAW) { if (r === local) thawLocal(); else r.frozen = false; }
    }
    if (G.mode === 'potato') {
        for (const r of simulated()) if (r.isIt && !r.out && all.length > 1 && G.clock - r.itSince > POTATO_FUSE) explode(r);
    }
    if (all.length < 2 || G.mode === 'tag') return;
    const alive = all.filter((p) => !p.out);
    // Nobody is IT (the IT player blew up or left): the host picks someone new at random.
    if (alive.length > 1 && !alive.some((p) => p.isIt) && isHost()) {
        setIt(alive[Math.floor(Math.random() * alive.length)]);
        bridge.updateHud();
        bridge.pushState();
        return;
    }
    if (G.mode === 'infection' && alive.every((p) => p.isIt)) endRound('Everyone is infected!');
    else if (G.mode === 'freeze') {
        const runners = alive.filter((p) => !p.isIt);
        if (runners.length && runners.every((p) => p.frozen)) endRound('IT froze everyone!');
    } else if (G.mode === 'potato' && alive.length === 1) endRound(`${nameOf(alive[0])} wins!`);
}

/** `a` (simulated here) tags `b`. */
function applyTag(a, b) {
    const dir = a.x < b.x ? -1 : 1; // direction `a` is knocked
    const burstX = (a.x + b.x) / 2 + 7;
    const burstY = (a.y + b.y) / 2 + 9;
    const now = Date.now();
    const bIsBot = bots.includes(b);
    a.tagsScored++;

    if (G.mode === 'freeze') {
        b.frozen = true;
        b.frozenAt = G.clock;
        b.vx = 0;
        if (isRemote(b)) bridge.send({ type: 'frozen', targetId: b.id, room: roomKey() });
        popText(b.x + b.w / 2, b.y - 10, 'FROZEN!', '#93c5fd', 0.9);
        spawnParticles(burstX, burstY, '#bfdbfe', 16);
        G.tagFreeze = 0.3;
    } else if (G.mode === 'infection') {
        b.isIt = true;
        b.itChangedAt = Date.now();
b.itSince = G.clock;
        if (isRemote(b)) bridge.send({ type: 'tagged', targetId: b.id, room: roomKey() });
        popText(b.x + b.w / 2, b.y - 10, 'INFECTED!', '#a3e635', 0.9);
        spawnParticles(burstX, burstY, '#a3e635', 16);
        G.tagFreeze = 0.3;
    } else if (G.mode === 'tag' && G.botAlwaysIt && bots.includes(a) && b === local) {
        // Practice: the bot stays IT, but freezes briefly so you get a head start and can see you were tagged.
        a.pauseTimer = BOT_PAUSE;
        a.vx = 0;
        a.dashTimer = 0;
        a.grapple.active = false;
        popText(b.x + b.w / 2, b.y - 10, 'TAGGED!', '#f87171', 0.9);
        spawnParticles(burstX, burstY, '#f87171', 18);
        b.vx = -dir * 280;
        b.vy = -220;
        b.grapple.active = false;
        G.tagFreeze = TAG_FREEZE;
    } else { // classic and potato: pass IT on
        a.isIt = false;
        a.itChangedAt = Date.now();
a.itSince = G.clock;
        b.isIt = true;
        b.itChangedAt = Date.now();
b.itSince = G.clock;
        if (isRemote(b)) bridge.send({ type: 'tagged', targetId: b.id, room: roomKey() });
        a.vx = dir * 285;
        a.vy = -220;
        a.grapple.active = false;
        if (b === local || bIsBot) { b.vx = -dir * 285; b.vy = -220; b.grapple.active = false; }
        spawnParticles(burstX, burstY, '#fbbf24', 20);
        G.tagFreeze = TAG_FREEZE;
    }
    bridge.updateHud();
    bridge.pushState();
}

export function runTag(dt) {
    if (!isTag()) return;
    tickRound(dt);
    if (G.tagFreeze > 0) { G.tagFreeze -= dt; return; }
    if (G.round.timer > 0) return;

    for (const a of simulated()) {
        if (a.out || a.frozen || a.pauseTimer > 0) continue;
        for (const b of participants()) {
            if (a === b || b.out || !touching(a, b)) continue;
            // Freeze Tag: a free runner touching a frozen teammate thaws them.
            if (G.mode === 'freeze' && !a.isIt && !b.isIt && b.frozen) {
                b.frozen = false;
                if (isRemote(b)) bridge.send({ type: 'thaw', targetId: b.id, room: roomKey() });
                popText(b.x + b.w / 2, b.y - 10, 'THAWED', '#86efac', 0.8);
                spawnParticles((a.x + b.x) / 2 + 7, (a.y + b.y) / 2 + 9, '#86efac', 14);
                continue;
            }
            if (a.isIt && !b.isIt && !b.frozen) { applyTag(a, b); return; }
        }
    }
}

// ===========================================================================
// PRACTICE BOTS
// ===========================================================================
// Each bot has a level (Easy, Normal, Hard, see AI_LEVELS): slower to react, slower on its feet, and less
// willing to hook and dash on the lower levels. A bot chases when IT and runs away when not. It never
// reels up past its target and lets go of the hook when you are below it, so it cannot get stuck on the ceiling.
// In Freeze Tag free bots also rescue frozen teammates; after an Infection round they swarm the player.

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearestOf = (from, list) => (list.length ? list.reduce((best, p) => (dist2(from, p) < dist2(from, best) ? p : best)) : null);

/** Who this bot is going after (chase) or running from (flee). */
function botGoal(b) {
    const others = participants().filter((p) => p !== b && !p.out);
    if (G.mode === 'infection' && G.swarm > 0) return { who: local, chase: true };
    if (b.isIt) return { who: nearestOf(b, others.filter((p) => !p.isIt && !p.frozen)) || local, chase: true };
    const danger = nearestOf(b, others.filter((p) => p.isIt));
    if (G.mode === 'freeze') {
        const frozenMates = others.filter((p) => p.frozen && !p.isIt);
        if (frozenMates.length && (!danger || dist2(b, danger) > 220)) return { who: nearestOf(b, frozenMates), chase: true };
    }
    return { who: danger || local, chase: false };
}

/** Step every active bot. */
export function stepBots(dt) {
    for (const b of activeBots()) stepOneBot(b, dt);
}

function stepOneBot(b, dt) {
    if (b.pauseTimer > 0) { // frozen in place after tagging you (Always IT practice)
        b.pauseTimer -= dt;
        b.vx *= Math.pow(0.001, dt);
        stepRunner(b, dt, NO_INPUT);
        return;
    }
    if (b.frozen || b.out) { stepRunner(b, dt, NO_INPUT); return; }
    const goal = botGoal(b);
    const ai = AI_LEVELS[b.level] || AI_LEVELS.normal;
    // Bots only "see" where the target was a moment ago; slower levels see older positions.
    b.seenTimer -= dt;
    if (b.seenTimer <= 0 || b.seenWho !== goal.who) {
        b.seen = { x: goal.who.x, y: goal.who.y, w: goal.who.w, h: goal.who.h };
        b.seenWho = goal.who;
        b.seenTimer = ai.reaction;
    }
    stepRunner(b, dt, botInput(b, b.seen, dt, goal.chase));
}

export function botInput(bot, target, dt, chase = bot.isIt) {
    const ai = AI_LEVELS[bot.level] || AI_LEVELS.normal;
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const dist = Math.hypot(dx, dy);
    const hunting = chase;
    const targetBelow = hunting && dy > 40;

    const toward = Math.abs(dx) < 10 ? bot.facing : Math.sign(dx); // no jitter when directly above/below
    const wantDir = hunting ? toward : -(Math.sign(dx) || 1);
    let left = wantDir < 0;
    let right = wantDir > 0;
    let up = false;
    let down = false;

    // Standing on a solid card with you below: walk to the nearest edge and step off (S cannot drop through a card).
    if (targetBelow && bot.grounded && !bot.grapple.active) {
        const card = G.solids.find((s) => bot.x + bot.w > s.x && bot.x < s.x + s.w && Math.abs(bot.y + bot.h - s.y) < 1);
        if (card && target.x + target.w > card.x - 6 && target.x < card.x + card.w + 6) {
            const toLeft = bot.x - card.x;
            const toRight = card.x + card.w - (bot.x + bot.w);
            left = toLeft <= toRight;
            right = !left;
        }
    }

    if (!hunting) { // keep away from the screen edges while fleeing
        if (bot.x < 110) { left = false; right = true; }
        if (bot.x > view.w - 130) { right = false; left = true; }
    }

    bot.aiJumpTimer -= dt;
    bot.aiGrappleTimer -= dt;
    bot.aiDashTimer -= dt;

    if (bot.grapple.active) {
        bot.aiHookTime += dt;
        if (targetBelow) {
            bot.grapple.active = false; // you are below: let go (no upward boost) and come back down
            bot.aiGrappleTimer = 1.2;
        } else {
            // Reel up only while there is something higher to reach (or to flee to).
            if (bot.grapple.ay < bot.y - 20 && (!hunting || dy < -40)) up = true;
            if (bot.y <= bot.grapple.ay + 24 || (hunting && dist < 85) || bot.aiHookTime > 1.4) {
                handleJump(bot);
                bot.aiGrappleTimer = 1.1 + Math.random() * 0.8;
            }
        }
    } else {
        bot.aiHookTime = 0;
        if (bot.aiGrappleTimer <= 0) {
            const targetMuchHigher = hunting && dy < -95 && dist < 340;
            const fallingLow = !targetBelow && bot.vy > 210 && bot.y > view.h * 0.58; // recover from a low fall, unless you are below
            const panicEscape = !hunting && dist < 130 && bot.y > 140;
            if ((targetMuchHigher || fallingLow || panicEscape) && Math.random() < ai.grapple) {
                bot.facing = right ? 1 : left ? -1 : bot.facing;
                toggleGrapple(bot, Math.abs(dx) < 55);
                bot.aiGrappleTimer = 1.4 + Math.random() * 0.9;
            } else if (targetMuchHigher || fallingLow || panicEscape) bot.aiGrappleTimer = 0.8;
        }
    }

    if (bot.aiJumpTimer <= 0 && !bot.grapple.active) {
        const wallJump = bot.wallSide !== 0 && !targetBelow;
        if ((hunting && dy < -35) || (!hunting && dist < 150 && bot.grounded) || wallJump) {
            if (Math.random() < ai.jump) handleJump(bot);
            bot.aiJumpTimer = 0.35 + Math.random() * 0.35;
        } else if (targetBelow && bot.grounded) {
            down = true; // drop through a ledge toward you (cards are walked off instead)
            bot.aiJumpTimer = 0.4;
        }
    }
    if (targetBelow && !bot.grounded && !bot.grapple.active && dy > 120 && bot.vy > 0) fastFall(bot);

    if (bot.dashCooldown <= 0 && bot.aiDashTimer <= 0 && !bot.grapple.active) {
        if ((hunting && Math.abs(dy) < 35 && dist > 90 && dist < 210) || (!hunting && dist < 75)) {
            if (Math.random() < ai.dash) triggerDash(bot, wantDir || bot.facing);
            bot.aiDashTimer = 0.8;
        }
    }

    return { left, right, up, down };
}

// ===========================================================================
// DRAWING
// ===========================================================================
export function drawRunner(r, label = null) {
    const { x, y, w, h } = r;
    const cx = x + w / 2;
    ctx.save();
    if (r.pauseTimer > 0 || r.ghost) ctx.globalAlpha = 0.55; // bot frozen after a tag, or a race ghost
    if (r.out) ctx.globalAlpha = 0.28;                        // out of the round (Hot Potato)

    if (r.grounded && !r.sliding) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
        ctx.beginPath();
        ctx.ellipse(cx, y + h, 7, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Scarf
    const wave = Math.sin(performance.now() * 0.015 + hashString(String(r.id))) * 2.5;
    ctx.fillStyle = r.scarfColor;
    ctx.beginPath();
    ctx.moveTo(cx, y + (r.sliding ? 3 : 7));
    ctx.lineTo(cx - r.facing * 9, y + (r.sliding ? 2 : 5) + wave);
    ctx.lineTo(cx - r.facing * 7, y + (r.sliding ? 5 : 9) + wave);
    ctx.closePath();
    ctx.fill();

    if (r.sliding) {
        // Low profile: no legs, flattened body
        ctx.fillStyle = r.bodyColor;
        ctx.beginPath();
        ctx.roundRect(x, y + 1, w + 2, h - 1, 4);
        ctx.fill();
        ctx.fillStyle = r.hatColor;
        ctx.beginPath();
        ctx.arc(cx + r.facing * 4, y + 2, 4.5, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(r.facing === 1 ? x + 9 : x + 3, y + 3, 2.3, 2.3);
    } else {
        // Legs
        const swing = r.grounded ? Math.sin(r.walkCycle) * 3.2 : 2.5;
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 13);
        ctx.lineTo(x + 5 - swing, y + h);
        ctx.moveTo(x + 9, y + 13);
        ctx.lineTo(x + 9 + swing, y + h);
        ctx.stroke();
        // Body, cap, eye
        ctx.fillStyle = r.bodyColor;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 4, w - 4, 10, 4);
        ctx.fill();
        ctx.fillStyle = r.hatColor;
        ctx.beginPath();
        ctx.arc(cx, y + 4.5, 5.2, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(r.facing === 1 ? x + 8.5 : x + 3, y + 4.2, 2.3, 2.3);
    }

    if (r.frozen) { // ice
        ctx.fillStyle = 'rgba(147, 197, 253, 0.6)';
        ctx.fillRect(x - 1, y + 1, w + 2, h);
        ctx.strokeStyle = 'rgba(219, 234, 254, 0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 1, y + 1, w + 2, h);
    }

    if (label) {
        ctx.font = '700 8px Lato, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.fillText(label, cx, y - 3);
    }
    if (isTag() && r.isIt && !r.out) {
        ctx.shadowColor = 'rgba(245, 158, 11, 0.85)';
        ctx.shadowBlur = 6;
        ctx.font = '900 8px Lato, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = G.mode === 'infection' ? '#84cc16' : '#f59e0b';
        ctx.fillText(G.mode === 'potato' ? 'POTATO' : 'IT!', cx, y - (label ? 13 : 6) + Math.sin(performance.now() * 0.008) * 2 - 3);
        ctx.shadowBlur = 0;
        if (G.mode === 'potato') { // the fuse burning down
            const left = clamp(1 - (G.clock - r.itSince) / POTATO_FUSE, 0, 1);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
            ctx.fillRect(x - 3, y - (label ? 21 : 14), w + 6, 3);
            ctx.fillStyle = left > 0.35 ? '#fbbf24' : '#ef4444';
            ctx.fillRect(x - 3, y - (label ? 21 : 14), (w + 6) * left, 3);
        }
    }
    ctx.restore();
}

export function drawGrapple(r) {
    if (!r.grapple.active) return;
    const sx = r.x + r.w / 2;
    const sy = r.y + 5;
    const { ax, ay } = r.grapple;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = r.scarfColor;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
}

/** Small readout pill at the top of the screen. */
function hudPill(text, row = 0, color = '#e2e8f0') {
    ctx.save();
    ctx.font = '700 12px Lato, sans-serif';
    ctx.textAlign = 'center';
    const wd = ctx.measureText(text).width + 22;
    const y = 10 + row * 26;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.beginPath();
    ctx.roundRect(view.w / 2 - wd / 2, y, wd, 21, 10);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, view.w / 2, y + 15);
    ctx.restore();
}

/** Round info for the tag variants. */
export function drawVariantHud() {
    if (!isTag() || G.mode === 'tag') return;
    const all = participants();
    const alive = all.filter((p) => !p.out);
    if (G.mode === 'infection') hudPill(`Infected ${alive.filter((p) => p.isIt).length} / ${alive.length}`, 0, '#bef264');
    if (G.mode === 'freeze') {
        const runners = alive.filter((p) => !p.isIt);
        hudPill(`Frozen ${runners.filter((p) => p.frozen).length} / ${runners.length}   (touch a frozen runner to thaw)`, 0, '#bfdbfe');
    }
    if (G.mode === 'potato') {
        const left = Math.max(0, POTATO_FUSE - (G.clock - local.itSince));
        hudPill(local.isIt && !local.out ? `FUSE ${left.toFixed(1)}s: pass it on!` : `${alive.length} left`, 0, local.isIt ? '#fdba74' : '#e2e8f0');
        if (local.out) hudPill('You are out this round', 1, '#fca5a5');
    }
    if (G.round.timer > 0) hudPill(`${G.round.text}  Next round in ${Math.ceil(G.round.timer)}`, 1, '#fde68a');
}

// ===========================================================================
// DEV TOOLS (only reachable with developer mode on)
// ===========================================================================
/** Apply the dev switches to the local runner. */
export function applyDevFlags() {
    local.fly = DEV && G.dev.fly;
    local.infJumps = DEV && G.dev.infJumps;
}

/** Click-to-teleport: screen pixels in, design space out. */
export function teleportLocal(clientX, clientY) {
    const p = toDesign(clientX, clientY);
    local.x = clamp(p.x - local.w / 2, 0, view.w - local.w);
    local.y = clamp(p.y - local.h / 2, 0, view.h - local.h);
    local.vx = local.vy = 0;
    local.grapple.active = false;
}

export function resetTuning() { Object.assign(T, DEFAULTS); }

/** Only the values that differ from the defaults, ready to paste into DEFAULTS. */
export function changedTuning() {
    return Object.fromEntries(Object.entries(T).filter(([k, v]) => v !== DEFAULTS[k]));
}

export function drawDebug() {
    if (!DEV) return;
    const d = G.dev;
    ctx.save();
    if (d.hitboxes) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
        G.solids.forEach((s) => ctx.strokeRect(s.x, s.y, s.w, s.h));
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
        G.platforms.forEach((p) => { ctx.strokeStyle = p.spring ? 'rgba(74, 222, 128, 0.95)' : 'rgba(34, 211, 238, 0.9)'; ctx.strokeRect(p.x, p.y, p.w, p.h); });
        ctx.strokeStyle = 'rgba(74, 222, 128, 1)';
        for (const r of [local, ...G.remotes.values(), ...activeBots()]) ctx.strokeRect(r.x, r.y, r.w, r.h);
        if (local.grapple.active) {
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
            ctx.beginPath();
            ctx.arc(local.grapple.ax, local.grapple.ay, local.grapple.length, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    if (d.stats) {
        const lines = [
            `${G.fps.toFixed(0)} fps   ${G.mode}/${G.room}   players ${1 + G.remotes.size}`,
            `pos ${local.x.toFixed(0)}, ${local.y.toFixed(0)}   vel ${local.vx.toFixed(0)}, ${local.vy.toFixed(0)}`,
            `grounded ${local.grounded}  wall ${local.wallSide}  jumps ${local.jumpsLeft}  dash ${labOn() && PF.dashMode === 'charges' ? 'charge ' + local.dashCharges : 'cd ' + Math.max(0, local.dashCooldown).toFixed(2)}`,
            `world ${view.w.toFixed(0)}x${view.h.toFixed(0)}  scale ${view.s.toFixed(2)}  solids ${G.solids.length}  ledges ${G.platforms.length}`,
        ];
        ctx.font = '600 10px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'left';
        const wd = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(view.w - wd - 8, 8, wd, lines.length * 14 + 8);
        ctx.fillStyle = '#e2e8f0';
        lines.forEach((l, i) => ctx.fillText(l, view.w - wd - 2, 23 + i * 14));
    }
    ctx.restore();
}

// ===========================================================================
// LEVELS & THE LEVEL EDITOR (Platformer)
// ===========================================================================
// The Platformer plays on its own level instead of the page. A level is a plain JSON file (see README):
//   cards   solid boxes        ledges  one-way platforms      springs  bouncy pads
//   flags   checkpoints, in order (the last one finishes the race)       pickups  coins for the Overdue game
//   spawn   where you start (the point your feet stand on)
// Every level is LEVEL_W x LEVEL_H design units, (0, 0) is the top-left corner and the floor is y = LEVEL_H.
// Anything that comes from outside (a file, a link, another player) goes through sanitizeLevel first.

const MAX_OBJECTS = 200;
const DIMS = ['both', 'a', 'b'];
const LEVEL_KEY = 'scb-level';

/** The starting map. This is the same as maps/basic.json and is used if the maps folder cannot be read. */
export function defaultLevel() {
    return {
        name: 'Basic',
        spawn: { x: 310, y: 500 },
        cards: [
            { x: 300, y: 500, w: 160, h: 120, dim: 'both' },
            { x: 470, y: 500, w: 160, h: 120, dim: 'both' },
            { x: 640, y: 500, w: 160, h: 120, dim: 'both' },
            { x: 810, y: 500, w: 160, h: 120, dim: 'both' },
        ],
        ledges: [],
        springs: [],
        flags: [{ x: 960, y: 500 }],
        pickups: [],
    };
}

const finite = (v, lo, hi, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(clamp(n, lo, hi) * 10) / 10 : fallback;
};

function cleanRect(o, minW, minH, fixedH) {
    if (!o || typeof o !== 'object') return null;
    const w = finite(o.w, minW, LEVEL_W, NaN);
    const h = fixedH ?? finite(o.h, minH, LEVEL_H, NaN);
    const x = finite(o.x, 0, LEVEL_W - w, NaN);
    const y = finite(o.y, 0, LEVEL_H - h, NaN);
    if (![w, h, x, y].every(Number.isFinite)) return null;
    return { x, y, w, h, dim: DIMS.includes(o.dim) ? o.dim : 'both' };
}

function cleanPoint(o) {
    if (!o || typeof o !== 'object') return null;
    const x = finite(o.x, 0, LEVEL_W, NaN);
    const y = finite(o.y, 0, LEVEL_H, NaN);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

const cleanList = (list, fn) => (Array.isArray(list) ? list.slice(0, MAX_OBJECTS).map(fn).filter(Boolean) : []);

/** Turn anything into a safe level, or null if it is not a level at all. Builds a fresh object, so nothing
 *  from the input (extra keys, huge lists, odd types) survives. */
export function sanitizeLevel(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!['spawn', 'cards', 'ledges', 'springs', 'flags', 'pickups'].some((k) => k in raw)) return null; // not a level at all
    const name = String(raw.name ?? 'Untitled').replace(/[^\w .\-]/g, '').trim().slice(0, 40) || 'Untitled';
    return {
        name,
        spawn: cleanPoint(raw.spawn) || { x: 100, y: LEVEL_H },
        cards: cleanList(raw.cards, (o) => cleanRect(o, 8, 8)),
        ledges: cleanList(raw.ledges, (o) => cleanRect(o, 8, 4, 12)),
        springs: cleanList(raw.springs, (o) => cleanRect(o, 16, 4, 14)),
        flags: cleanList(raw.flags, cleanPoint),
        pickups: cleanList(raw.pickups, cleanPoint),
    };
}

function loadSavedLevel() {
    try {
        const raw = localStorage.getItem(LEVEL_KEY);
        return raw ? sanitizeLevel(JSON.parse(raw)) : null;
    } catch (e) { return null; }
}

/** The level being played or edited. */
export const LEVEL = { data: defaultLevel() };

/** The built-in maps in play order (read from maps/index.json). index is -1 while you are on your own map. */
export const MAPS = { list: [{ name: LEVEL.data.name, level: defaultLevel() }], index: 0 };
PF.race.sig = levelSignature(); // the ghost belongs to this exact map

function saveLevelLocal() {
    try { localStorage.setItem(LEVEL_KEY, levelToJson()); } catch (e) {}
}

/** The readable file format: one object per line, so it is easy to read and to edit by hand. */
export function levelToJson(L = LEVEL.data) {
    const rows = (a) => (a.length ? `[\n${a.map((o) => '    ' + JSON.stringify(o)).join(',\n')}\n  ]` : '[]');
    return `{
  "format": "super-class-bros-level",
  "version": 1,
  "name": ${JSON.stringify(L.name)},
  "size": [${LEVEL_W}, ${LEVEL_H}],
  "spawn": ${JSON.stringify(L.spawn)},
  "cards": ${rows(L.cards)},
  "ledges": ${rows(L.ledges)},
  "springs": ${rows(L.springs)},
  "flags": ${rows(L.flags)},
  "pickups": ${rows(L.pickups)}
}
`;
}

/** Use a level (already sanitized). index is its place in the built-in maps, or -1 for your own map.
 *  Every map starts in dimension A. */
function setLevel(data, index = -1) {
    LEVEL.data = data;
    MAPS.index = index;
    PF.dim = 0;
    EDIT.sel = null;
    EDIT.drag = null;
    levelChanged(false);
}

/** Load a level from untrusted data (a file, a link, another player). Returns true if it was usable.
 *  It becomes "your map". */
export function applyLevel(raw) {
    const data = sanitizeLevel(raw);
    if (!data) return false;
    setLevel(data);
    saveLevelLocal();
    return true;
}

export function clearLevel() {
    setLevel({ name: 'Untitled', spawn: { x: 100, y: LEVEL_H }, cards: [], ledges: [], springs: [], flags: [], pickups: [] });
    saveLevelLocal();
}

export function setLevelName(name) {
    LEVEL.data.name = String(name).replace(/[^\w .\-]/g, '').trim().slice(0, 40) || 'Untitled';
    MAPS.index = -1;
    saveLevelLocal();
    bridge.mapChanged();
}

/** Anything about the map that matters for a race. The ghost only makes sense on exactly this map. */
function levelSignature(L = LEVEL.data) {
    return JSON.stringify([L.spawn, L.cards, L.ledges, L.springs, L.flags, L.pickups]);
}

/** Forget the best time and the ghost. Happens by itself whenever the map changes; also on the G key. */
export function resetGhost(announce = false) {
    const R = PF.race;
    const had = R.ghost.length > 0 || R.best !== null;
    R.best = null;
    R.ghost = [];
    R.rec = [];
    R.sig = levelSignature();
    if (announce) bridge.toast('Ghost reset');
    else if (had) bridge.toast('The map changed, so the ghost was reset');
    return had;
}

/** The map changed: rebuild the collision world, and drop the ghost if it no longer fits this map. */
function levelChanged(edited = true) {
    scanWorld();
    if (edited) { // you changed a map: it is now your own copy, and it is remembered by the browser
        MAPS.index = -1;
        saveLevelLocal();
    }
    if (levelSignature() !== PF.race.sig) resetGhost(false);
    bridge.mapChanged();
}

// --- the built-in maps -----------------------------------------------------
function loadMap(i) { setLevel(sanitizeLevel(MAPS.list[i].level), i); }

/** Replace the built-in maps with the ones read from the maps folder (raw JSON, checked here). */
export function setBuiltinMaps(raws) {
    const list = (Array.isArray(raws) ? raws : []).slice(0, 50).map(sanitizeLevel).filter(Boolean).map((level) => ({ name: level.name, level }));
    if (!list.length) return false;
    const showingBuiltin = MAPS.index >= 0;
    MAPS.list = list;
    if (showingBuiltin && !EDIT.on) { // show the file's version of the map you are on
        loadMap(Math.min(MAPS.index, list.length - 1));
        if (G.active && isPlatformer()) bridge.respawn();
    } else bridge.mapChanged();
    return true;
}

/** Go to built-in map number i (wraps around). Returns its name. */
export function selectMap(i) {
    const n = MAPS.list.length;
    const index = ((i % n) + n) % n;
    loadMap(index);
    if (G.active && isPlatformer()) bridge.respawn(); // start at the new map's spawn
    return MAPS.list[index].name;
}

export const nextMap = (step = 1) => selectMap((MAPS.index < 0 ? 0 : MAPS.index) + step);

/** Back to the first built-in map (the editor's "First map" button). */
export function resetLevel() { loadMap(0); }

/** Go back to the map you last edited or loaded. */
export function useSavedMap() {
    const saved = loadSavedLevel();
    if (!saved) return false;
    setLevel(saved);
    if (G.active && isPlatformer()) bridge.respawn();
    return true;
}

/** "Map 2/5: Jump" or "Your map: Name" */
export function mapLabel() {
    return MAPS.index >= 0 ? `Map ${MAPS.index + 1}/${MAPS.list.length}: ${LEVEL.data.name}` : `Your map: ${LEVEL.data.name}`;
}

/** Top-left of the runner when it spawns. */
export function levelSpawn() {
    const s = LEVEL.data.spawn;
    return { x: s.x - local.w / 2, y: s.y - STAND_H };
}

/** Level objects as collision boxes. Only the active dimension is solid (all of them while editing). */
function buildLevelWorld() {
    const L = LEVEL.data;
    const useDim = PF.dimensions && !EDIT.on;
    const cur = PF.dim ? 'b' : 'a';
    const show = (o) => !useDim || o.dim === 'both' || o.dim === cur;
    const box = (o, extra = {}) => ({ x: o.x, y: o.y, w: o.w, h: o.h, ...extra });
    G.solids = L.cards.filter(show).map((o) => box(o));
    G.platforms = [...L.ledges.filter(show).map((o) => box(o)), ...L.springs.filter(show).map((o) => box(o, { spring: true }))];
    PF.pickups = L.pickups.map((p, id) => ({ id, x: p.x, y: p.y }));
}

// --- editor model ----------------------------------------------------------
// The app draws the toolbar and forwards the pointer; everything about what a click does is here.
export const EDIT = { on: false, tool: 'select', snap: 10, dim: 'both', sel: null, drag: null, hover: { x: 0, y: 0 } };

const TOOL_KIND = { card: 'cards', ledge: 'ledges', spring: 'springs', flag: 'flags', pickup: 'pickups' };
const RECT_SPEC = {
    cards: { minW: 16, minH: 16, defW: 160, defH: 120 },
    ledges: { minW: 16, fixedH: 12, defW: 120 },
    springs: { minW: 24, fixedH: 14, defW: 80 },
};
const isRectKind = (k) => k in RECT_SPEC;
const snapv = (v) => (EDIT.snap ? Math.round(v / EDIT.snap) * EDIT.snap : Math.round(v));

export function setEditing(on) {
    EDIT.on = !!on;
    EDIT.drag = null;
    if (!on) EDIT.sel = null;
    scanWorld(); // everything is solid while editing, the dimension filter returns afterwards
}

export function setEditorTool(tool) {
    EDIT.tool = tool;
    EDIT.drag = null;
}

/** The selected object: { kind, index, item } or null. */
export function selectedItem() {
    const s = EDIT.sel;
    if (!s) return null;
    const item = s.kind === 'spawn' ? LEVEL.data.spawn : LEVEL.data[s.kind]?.[s.index];
    return item ? { kind: s.kind, index: s.index, item } : null;
}

/** The area an object occupies (for picking and for drawing the selection). */
function boundsOf(kind, o) {
    if (kind === 'spawn') return { x: o.x - 8, y: o.y - STAND_H, w: 16, h: STAND_H };
    if (kind === 'flags') return { x: o.x - 12, y: o.y - 34, w: 30, h: 34 };
    if (kind === 'pickups') return { x: o.x - 9, y: o.y - 9, w: 18, h: 18 };
    return { x: o.x, y: o.y, w: o.w, h: o.h };
}

const inside = (b, x, y, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;

/** What is under this point? Thin things (springs, ledges) win over cards; the corner of a box is a resize handle. */
function hitTest(x, y) {
    const L = LEVEL.data;
    if (inside(boundsOf('spawn', L.spawn), x, y, 2)) return { kind: 'spawn' };
    for (const kind of ['flags', 'pickups']) {
        for (let i = L[kind].length - 1; i >= 0; i--) if (inside(boundsOf(kind, L[kind][i]), x, y, 2)) return { kind, index: i };
    }
    for (const kind of ['springs', 'ledges', 'cards']) {
        for (let i = L[kind].length - 1; i >= 0; i--) {
            const o = L[kind][i];
            if (!inside(boundsOf(kind, o), x, y, kind === 'cards' ? 0 : 3)) continue;
            const handle = x >= o.x + o.w - 10 && y >= o.y + o.h - 10 && o.w >= 24;
            return { kind, index: i, handle: handle && kind !== 'spawn' };
        }
    }
    return null;
}

function removeItem({ kind, index }) {
    if (kind === 'spawn') return;
    LEVEL.data[kind].splice(index, 1);
    EDIT.sel = null;
}

/** Keep an object inside the level. */
function fit(kind, o) {
    if (isRectKind(kind)) {
        o.w = clamp(o.w, RECT_SPEC[kind].minW, LEVEL_W);
        o.h = RECT_SPEC[kind].fixedH ?? clamp(o.h, RECT_SPEC[kind].minH, LEVEL_H);
        o.x = clamp(o.x, 0, LEVEL_W - o.w);
        o.y = clamp(o.y, 0, LEVEL_H - o.h);
    } else if (kind === 'spawn') {
        o.x = clamp(o.x, 8, LEVEL_W - 8);
        o.y = clamp(o.y, STAND_H, LEVEL_H);
    } else {
        o.x = clamp(o.x, 0, LEVEL_W);
        o.y = clamp(o.y, 0, LEVEL_H);
    }
}

/** Pointer events in design units. type: 'down' | 'move' | 'up'. */
export function editorPointer(type, rawX, rawY) {
    if (!EDIT.on) return;
    const x = clamp(rawX, 0, LEVEL_W);
    const y = clamp(rawY, 0, LEVEL_H);
    EDIT.hover = { x, y };
    const L = LEVEL.data;

    if (type === 'down') {
        const tool = EDIT.tool;
        if (tool === 'select') {
            const hit = hitTest(x, y);
            EDIT.sel = hit ? { kind: hit.kind, index: hit.index } : null;
            EDIT.drag = hit ? { mode: hit.handle ? 'resize' : 'move', sx: x, sy: y, orig: { ...selectedItem().item } } : null;
        } else if (tool === 'erase') {
            const hit = hitTest(x, y);
            if (hit && hit.kind !== 'spawn') { removeItem(hit); levelChanged(); }
        } else if (tool === 'spawn') {
            L.spawn = { x: snapv(x), y: snapv(y) };
            fit('spawn', L.spawn);
            EDIT.sel = { kind: 'spawn' };
            EDIT.drag = { mode: 'move', sx: x, sy: y, orig: { ...L.spawn } };
        } else if (tool === 'flag' || tool === 'pickup') {
            const kind = TOOL_KIND[tool];
            if (L[kind].length >= MAX_OBJECTS) return;
            const p = { x: snapv(x), y: snapv(y) };
            fit(kind, p);
            L[kind].push(p);
            EDIT.sel = { kind, index: L[kind].length - 1 };
            EDIT.drag = { mode: 'move', sx: x, sy: y, orig: { ...p } };
        } else if (TOOL_KIND[tool]) { // card, ledge, spring: drag out a box
            const kind = TOOL_KIND[tool];
            if (L[kind].length >= MAX_OBJECTS) return;
            const o = { x: snapv(x), y: snapv(y), w: 0, h: RECT_SPEC[kind].fixedH ?? 0, dim: EDIT.dim };
            L[kind].push(o);
            EDIT.sel = { kind, index: L[kind].length - 1 };
            EDIT.drag = { mode: 'create', sx: o.x, sy: o.y };
        }
        return;
    }

    const d = EDIT.drag;
    const sel = selectedItem();
    if (!d || !sel) { if (type === 'up') EDIT.drag = null; return; }
    const { kind, item } = sel;

    if (type === 'move') {
        if (d.mode === 'create') {
            const spec = RECT_SPEC[kind];
            const x2 = snapv(x);
            const y2 = snapv(y);
            item.x = Math.min(d.sx, x2);
            item.w = Math.abs(x2 - d.sx);
            if (!spec.fixedH) { item.y = Math.min(d.sy, y2); item.h = Math.abs(y2 - d.sy); }
        } else if (d.mode === 'move') {
            item.x = snapv(d.orig.x + (x - d.sx));
            item.y = snapv(d.orig.y + (y - d.sy));
            if (isRectKind(kind)) { item.w = d.orig.w; item.h = d.orig.h; }
            fit(kind, item);
        } else if (d.mode === 'resize') {
            item.w = snapv(d.orig.w + (x - d.sx));
            if (!RECT_SPEC[kind].fixedH) item.h = snapv(d.orig.h + (y - d.sy));
            fit(kind, item);
        }
    } else if (type === 'up') {
        if (d.mode === 'create') { // a plain click makes a default-sized box
            const spec = RECT_SPEC[kind];
            if (item.w < 10 && (spec.fixedH || item.h < 10)) { item.w = spec.defW; item.h = spec.fixedH ?? spec.defH; }
            fit(kind, item);
        }
        EDIT.drag = null;
        levelChanged();
    }
}

/** Delete key / button: remove the selected object. */
export function editorDelete() {
    const sel = selectedItem();
    if (!sel || sel.kind === 'spawn') return false;
    removeItem(sel);
    levelChanged();
    return true;
}

/** Number boxes and the dimension picker: change the selected object. */
export function updateSelected(patch) {
    const sel = selectedItem();
    if (!sel) return false;
    const { kind, item } = sel;
    for (const k of ['x', 'y', 'w', 'h']) {
        if (k in patch && Number.isFinite(Number(patch[k])) && (isRectKind(kind) || k === 'x' || k === 'y')) item[k] = Number(patch[k]);
    }
    if (patch.dim && DIMS.includes(patch.dim) && isRectKind(kind)) item.dim = patch.dim;
    fit(kind, item);
    levelChanged();
    return true;
}

// --- drawing ---------------------------------------------------------------
const DIM_COLOR = { both: '#86a689', a: '#7dd3fc', b: '#c4b5fd' };

function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/** Draw the level (under the runners). */
export function drawLevel() {
    const L = LEVEL.data;
    const useDim = PF.dimensions && !EDIT.on;
    const cur = PF.dim ? 'b' : 'a';
    const faded = (o) => useDim && o.dim !== 'both' && o.dim !== cur;
    ctx.save();
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, LEVEL_W, LEVEL_H);
    if (!EDIT.on) {
        ctx.font = '700 12px Lato, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(mapLabel(), 14, 24);
    }
    if (EDIT.on) { // grid
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= LEVEL_W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, LEVEL_H); }
        for (let y = 0; y <= LEVEL_H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(LEVEL_W, y); }
        ctx.stroke();
    }

    for (const c of L.cards) {
        ctx.globalAlpha = faded(c) ? 0.25 : 1;
        ctx.setLineDash(faded(c) ? [5, 4] : []);
        rrect(c.x, c.y, c.w, c.h, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#c7cdd1';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = DIM_COLOR[c.dim];
        ctx.fillRect(c.x + 1, c.y + 1, c.w - 2, Math.min(26, c.h * 0.4));
        ctx.fillStyle = '#e2e8f0';
        for (let ly = c.y + Math.min(26, c.h * 0.4) + 10; ly < c.y + c.h - 8; ly += 12) ctx.fillRect(c.x + 8, ly, Math.max(0, (c.w - 16) * (0.5 + 0.4 * Math.abs(Math.sin(ly)))), 4);
    }
    ctx.setLineDash([]);

    for (const l of L.ledges) {
        ctx.globalAlpha = faded(l) ? 0.25 : 1;
        rrect(l.x, l.y, l.w, l.h, 3);
        ctx.fillStyle = l.dim === 'both' ? '#94a3b8' : DIM_COLOR[l.dim];
        ctx.fill();
    }
    for (const s of L.springs) {
        ctx.globalAlpha = faded(s) ? 0.25 : 1;
        rrect(s.x, s.y, s.w, s.h, 4);
        ctx.fillStyle = '#22c55e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = s.x + 6, up = true; x < s.x + s.w - 4; x += 8, up = !up) ctx.lineTo(x, s.y + (up ? 3 : s.h - 3));
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (EDIT.on || PF.game === 'tide') { // coins
        L.pickups.forEach((p, i) => {
            if (!EDIT.on && PF.collected.has(i)) return;
            ctx.fillStyle = '#facc15';
            ctx.strokeStyle = '#a16207';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y + (EDIT.on ? 0 : Math.sin(performance.now() * 0.005 + i) * 2), 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }

    L.flags.forEach((f, i) => { // flags (the race checkpoints, in order)
        const R = PF.race;
        const racing = PF.game === 'race' && !EDIT.on;
        const state = !racing ? 'idle' : i < R.next ? 'done' : i === R.next ? 'next' : 'later';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x, f.y - 34);
        ctx.stroke();
        ctx.fillStyle = state === 'done' ? '#4ade80' : state === 'next' ? `rgba(250, 204, 21, ${0.7 + Math.sin(performance.now() * 0.008) * 0.3})` : state === 'later' ? '#94a3b8' : '#ef4444';
        ctx.beginPath();
        ctx.moveTo(f.x, f.y - 34);
        ctx.lineTo(f.x + 20, f.y - 27);
        ctx.lineTo(f.x, f.y - 20);
        ctx.fill();
        if (L.flags.length > 1) {
            ctx.font = '800 9px Lato, sans-serif';
            ctx.fillStyle = '#0f172a';
            ctx.textAlign = 'center';
            ctx.fillText(i + 1, f.x + 6, f.y - 23);
        }
    });

    if (EDIT.on) { // where you start
        const b = boundsOf('spawn', L.spawn);
        ctx.strokeStyle = '#2563eb';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);
        ctx.font = '800 9px Lato, sans-serif';
        ctx.fillStyle = '#2563eb';
        ctx.textAlign = 'center';
        ctx.fillText('START', L.spawn.x, b.y - 4);
    }

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, LEVEL_W, LEVEL_H);
    ctx.restore();
}

/** Editor overlay (after the runners): selection, handles and cursor position. */
export function drawEditor() {
    if (!EDIT.on) return;
    ctx.save();
    const sel = selectedItem();
    if (sel) {
        const b = boundsOf(sel.kind, sel.item);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
        ctx.setLineDash([]);
        if (isRectKind(sel.kind)) {
            ctx.fillStyle = '#2563eb';
            ctx.fillRect(b.x + b.w - 7, b.y + b.h - 7, 9, 9);
        }
    }
    ctx.font = '600 10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#334155';
    ctx.fillText(`${Math.round(EDIT.hover.x)}, ${Math.round(EDIT.hover.y)}`, Math.min(EDIT.hover.x + 12, LEVEL_W - 70), Math.max(EDIT.hover.y - 8, 12));
    ctx.restore();
    hudPill(`LEVEL EDITOR: ${LEVEL.data.name}   (the game is paused)`, 0, '#bfdbfe');
}

// ===========================================================================
// PLATFORMER LAB (IN PROGRESS)
// ===========================================================================
// Only runs in the "platformer" server type with developer mode on. Everything here is an experiment
// you can switch on and off from the dev panel. No tagging or bot runs in this mode.
//   Movement : aimed grapple, dash charges, 8-way dash, springs, slide (see the sections above)
//   Games    : Race (run through the level's flags, race your ghost), Overdue (rising floor + coins)
//   Puzzle   : dimension flip (Tab)
// The level and its editor are in the section above.

/** Start the selected lab game over. The app calls this on respawn and when the game changes. */
export function labRestart() {
    PF.tide.t = 0;
    PF.tide.level = 0;
    PF.tide.collected = 0;
    PF.collected.clear();
    const R = PF.race;
    Object.assign(R, { next: 0, t: 0, done: false, doneAt: 0, rec: [], recT: 0 });
    local.dashCharges = 1;
    if (PF.dim !== 0) { // every attempt starts in dimension A
        PF.dim = 0;
        if (isPlatformer()) scanWorld();
    }
}

/** Tab key: flip to the other dimension. */
export function flipDimension() {
    if (!labOn() || !PF.dimensions) return;
    PF.dim ^= 1;
    scanWorld();
    spawnParticles(local.x + local.w / 2, local.y + local.h / 2, PF.dim ? '#a78bfa' : '#60a5fa', 24);
    popText(local.x + local.w / 2, local.y - 14, `Dimension ${PF.dim ? 'B' : 'A'}`, PF.dim ? '#c4b5fd' : '#93c5fd', 1);
}

// --- Overdue: the page's due date rises like a tide --------------------------
const TIDE_GRACE = 4;

function tideUpdate(dt) {
    const td = PF.tide;
    td.t += dt;
    if (td.t > TIDE_GRACE) td.level += Math.min(70, 16 + (td.t - TIDE_GRACE) * 0.5) * dt;

    const cx = local.x + local.w / 2;
    const cy = local.y + local.h / 2;
    for (const p of PF.pickups) {
        if (PF.collected.has(p.id) || Math.hypot(p.x - cx, p.y - cy) > 16) continue;
        PF.collected.add(p.id);
        td.collected++;
        td.level = Math.max(0, td.level - 90);
        popText(p.x, p.y - 8, 'ON TIME +1', '#facc15', 0.8);
        spawnParticles(p.x, p.y, '#facc15', 10);
    }
    if (PF.pickups.length && PF.pickups.every((p) => PF.collected.has(p.id))) PF.collected.clear(); // refill the page

    if (td.level > 0 && local.y + local.h > view.h - td.level + 6) {
        td.best = Math.max(td.best, td.t);
        bridge.toast(`Overdue! You lasted ${td.t.toFixed(1)}s (best ${td.best.toFixed(1)}s)`);
        bridge.respawn(); // respawn calls labRestart
    }
}

function tideDraw() {
    const td = PF.tide;
    if (td.level > 0) {
        const top = view.h - td.level;
        ctx.save();
        const wave = performance.now() * 0.004;
        ctx.fillStyle = 'rgba(220, 38, 38, 0.34)';
        ctx.beginPath();
        ctx.moveTo(0, view.h);
        for (let x = 0; x <= view.w; x += 20) ctx.lineTo(x, top + Math.sin(x * 0.03 + wave) * 4);
        ctx.lineTo(view.w, view.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(254, 202, 202, 0.9)';
        ctx.font = '900 12px Lato, sans-serif';
        ctx.textAlign = 'center';
        for (let x = 120; x < view.w; x += 320) ctx.fillText('OVERDUE', x, Math.min(view.h - 6, top + 22));
        ctx.restore();
    }
    const risingIn = Math.ceil(TIDE_GRACE - td.t);
    hudPill(risingIn > 0 ? `Overdue rising in ${risingIn}... find high ground` : `OVERDUE   ${td.t.toFixed(1)}s   best ${td.best.toFixed(1)}s   on time ${td.collected}`, 0, '#fecaca');
}

// --- Race: run through the level's flags in order, race your ghost ------------
function raceUpdate(dt) {
    const R = PF.race;
    R.flags = LEVEL.data.flags;
    if (R.done) {
        if ((R.doneAt -= dt) <= 0) {
            if (PF.nextMap && MAPS.index >= 0 && MAPS.list.length > 1) bridge.toast(`Next map: ${nextMap(1)}`); // starts it too
            else bridge.respawn(); // respawn calls labRestart
        }
        return;
    }
    R.t += dt;
    if ((R.recT += dt) >= 0.1) { R.recT -= 0.1; R.rec.push([+local.x.toFixed(1), +local.y.toFixed(1), local.facing]); }

    const f = R.flags[R.next];
    if (!f || !touching(local, { x: f.x - 14, y: f.y - 44, w: 30, h: 44 })) return;
    popText(f.x, f.y - 46, R.flags.length > 1 ? `${R.next + 1}/${R.flags.length}  ${R.t.toFixed(1)}s` : `${R.t.toFixed(2)}s`, '#4ade80', 0.9);
    spawnParticles(f.x, f.y - 24, '#4ade80', 12);
    if (++R.next < R.flags.length) return;
    R.done = true;
    R.doneAt = 3;
    if (R.best === null || R.t < R.best) {
        R.best = R.t;
        R.ghost = R.rec.slice();
        bridge.toast(`Finish! ${R.t.toFixed(2)}s, a new best`);
    } else bridge.toast(`Finish! ${R.t.toFixed(2)}s (best ${R.best.toFixed(2)}s)`);
}

function raceDraw() {
    const R = PF.race;
    // Ghost of your best run (the flags themselves are drawn with the level)
    if (R.ghost.length && !R.done) {
        if (!R.ghostRunner) R.ghostRunner = makeRunner('ghost', { ghost: true, bodyColor: '#94a3b8', scarfColor: '#cbd5e1', hatColor: '#64748b' });
        const k = R.t / 0.1;
        const a = R.ghost[Math.min(R.ghost.length - 1, Math.floor(k))];
        const b = R.ghost[Math.min(R.ghost.length - 1, Math.floor(k) + 1)];
        const f = k - Math.floor(k);
        Object.assign(R.ghostRunner, { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, facing: a[2] });
        drawRunner(R.ghostRunner, 'Best');
    }
    if (!R.flags.length) { hudPill('RACE: this level has no flag. Add one in the level editor.', 0, '#fde68a'); return; }
    hudPill(R.done ? `Finished in ${R.t.toFixed(2)}s   best ${R.best.toFixed(2)}s` : `RACE  ${R.next} / ${R.flags.length}   ${R.t.toFixed(1)}s${R.best !== null ? `   best ${R.best.toFixed(1)}s` : ''}`, 0, '#bbf7d0');
}

/** Runs every frame in Platformer mode, before drawing. */
export function platformerUpdate(dt) {
    if (!labOn() || EDIT.on) return;
    if (PF.grappleMode === 'aimed') updateAim();
    if (PF.game === 'tide') tideUpdate(dt);
    else if (PF.game === 'race') raceUpdate(dt);
}

/** Runs every frame in Platformer mode, after the runners are drawn. */
export function platformerDraw() {
    if (!labOn()) return;
    if (PF.dimensions && PF.dim) {
        ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
        ctx.fillRect(0, 0, view.w, view.h);
    }
    if (EDIT.on) { drawEditor(); return; }
    if (PF.game === 'tide') tideDraw();
    else if (PF.game === 'race') raceDraw();

    // Aimed grapple: dots on every hookable point, a ring on the one E will fire at
    if (PF.grappleMode === 'aimed' && !local.grapple.active) {
        ctx.save();
        for (const c of PF.aim.cands) {
            ctx.fillStyle = 'rgba(250, 204, 21, 0.55)';
            ctx.beginPath();
            ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
        const t = PF.aim.target;
        if (t) {
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(local.x + local.w / 2, local.y + 4);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(t.x, t.y, 8 + Math.sin(performance.now() * 0.01) * 1.5, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Dash charge pip above your head
    if (PF.dashMode === 'charges') {
        ctx.fillStyle = local.dashCharges > 0 ? '#ffffff' : 'rgba(148, 163, 184, 0.35)';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(local.x + local.w / 2, local.y - 8, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    const tips = [];
    if (PF.dimensions) tips.push(`Dimension ${PF.dim ? 'B' : 'A'} (Tab flips)`);
    if (PF.grappleMode === 'aimed') tips.push('E hooks the ringed point, R picks the next');
    if (tips.length) hudPill(tips.join('   ·   '), PF.game === 'sandbox' ? 0 : 1, '#c4b5fd');
}
