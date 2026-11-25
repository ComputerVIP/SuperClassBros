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

/** Server types. Tag, Infection, Freeze Tag and Hot Potato share the IT rules below. Overdue plays on the same page
 *  with the same bots but has no IT (see OVERDUE). The Platformer has its own levels. */
export const MODES = {
    tag:        { label: 'Tag' },
    infection:  { label: 'Infection' },
    freeze:     { label: 'Freeze Tag' },
    potato:     { label: 'Hot Potato' },
    overdue:    { label: 'Overdue' },
    platformer: { label: 'Platformer' },
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
export const cleanMode = (v) => (MODES[v] ? v : 'tag');

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
export const isOverdue = () => G.mode === 'overdue';

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
export const activeBots = () => ((isTag() || isOverdue()) && G.botEnabled ? bots.slice(0, botCountFor()) : []);
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
 * Platformer settings. Omnidash, spring pads, slide and slide stacking, dimensions and moving on to the next
 * level are always on (there are no switches any more). The rest are experiments that are not offered in the menus.
 */
export const PF = {
    grappleMode: 'auto',   // 'auto' = lock onto the nearest card | 'aimed' = pick a target (keyboard friendly)
    dashMode: 'cooldown',  // 'cooldown' (0.1s in the Platformer) | 'charges' (one dash, refilled by landing, touching a wall or hooking)
    dash8: true,           // dash in the direction you are holding, including up and down
    springs: true,         // spring pads in the level bounce you
    slide: true,           // hold S while running to slide
    slideStack: true,      // click S again after the cooldown, before the slide ends: a faster slide
    dimensions: true,      // Tab flips which half of the level is solid (cards, ledges and springs have a dimension)
    dim: 0,
    game: 'race',          // 'sandbox' | 'race' (run through the flags, race your ghost)
    nextMap: true,         // finishing a built-in map moves you on to the next one
    countdown: 0,          // seconds left of the 2, 1, GO before a level starts
    aim: { cands: [], target: null, index: 0, manualUntil: 0, mx: 0, my: 0, mouseAt: 0 },
    pickups: [],
    boosts: [],            // the speed boosts in play (this dimension)
    race: { flags: [], next: 0, t: 0, done: false, doneAt: 0, best: null, ghost: [], rec: [], recT: 0, ghostRunner: null, sig: '' },
};
const pfOn = () => isPlatformer();

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
    PF.boosts = [];
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
        if (p.spring && pfOn() && PF.springs) {
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
        if (s.noWallJump || r.y + r.h <= s.y + 4 || r.y >= s.y + s.h - 4) continue; // some cards cannot be wall jumped
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
    const charges = pfOn() && PF.dashMode === 'charges';
    if (charges ? r.dashCharges <= 0 : r.dashCooldown > 0) return;
    if (charges) r.dashCharges--; else r.dashCooldown = isPlatformer() ? T.DASH_COOLDOWN_PF : T.DASH_COOLDOWN;

    r.grapple.active = false;
    r.fastFalling = false;
    const face = dir || r.facing || 1;
    let dx = face;
    let dy = null;
    if (vec && pfOn() && PF.dash8 && (vec.x || vec.y)) {
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
    if (pfOn() && PF.slide) {
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
        const carrying = pfOn() && PF.slideStack && Math.abs(r.vx) > maxVx;
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
    if (pfOn()) touchBoosts(r, dt);
}
/** Speed boosts: the moment you enter one, and every 0.1 s while you stay inside, your speed in its direction is
 *  raised to its speed (its "power") if it is lower. If you are already faster that way, nothing happens. Speed
 *  across it is kept. It works while grappling: you stay hooked and the rope turns the push into swing speed.
 *  Extra speed fades after you leave, like after a stacked slide. */
const BOOST_EVERY = 0.1;
function touchBoosts(r, dt) {
    const timers = r.boostTimers || (r.boostTimers = new Map()); // boost id -> seconds until it can push again
    for (const id of [...timers.keys()]) if (!PF.boosts.some((b) => b.id === id && overlaps(r, b))) timers.delete(id); // left it
    for (const b of PF.boosts) {
        if (!overlaps(r, b)) continue;
        const wait = (timers.get(b.id) ?? 0) - dt;
        if (wait > 0) { timers.set(b.id, wait); continue; }
        timers.set(b.id, BOOST_EVERY);
        const a = (b.dir * Math.PI) / 180;
        const dx = Math.round(Math.cos(a) * 1000) / 1000;
        const dy = -Math.round(Math.sin(a) * 1000) / 1000; // screen y grows downward
        const along = r.vx * dx + r.vy * dy;
        if (along >= b.power) continue; // already at least this fast that way
        r.vx += dx * (b.power - along);
        r.vy += dy * (b.power - along);
        const speed = Math.hypot(r.vx, r.vy);
        if (speed > BOOST_MAX_SPEED) { r.vx *= BOOST_MAX_SPEED / speed; r.vy *= BOOST_MAX_SPEED / speed; }
        r.dashTimer = 0; // a dash would overwrite the push
        r.fastFalling = false;
        if (dy < 0) { r.grounded = false; r.coyoteTimer = 0; }
        if (dx) r.facing = Math.sign(dx);
        spawnParticles(r.x + r.w / 2, r.y + r.h / 2, '#f97316', 5);
        if (Math.random() < 0.9) addAfterimage(r);
    }
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

    const cards = G.solids.filter((s) => !s.noGrapple); // no-grapple cards are not anchors: the hook passes them by
    const anchors = [...cards, ...G.platforms];
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
        for (const p of cards.length ? cards : anchors) {
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
        if (b.noGrapple) continue;
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
    if (pfOn() && PF.grappleMode === 'aimed' && r === local) {
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
    odReset();
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
// OVERDUE (its own server type: plays on the dashboard page like Tag, with the same bots, but nobody is IT)
// ===========================================================================
// A red "overdue" floor rises from the bottom of the screen after a few seconds. Climb to stay above it.
// Yellow "on time" dots sit on the page; grabbing one pushes the floor back down for everyone. The room is one
// team: the floor catches you when it reaches your feet, the round ends when everyone is caught, and the score
// is how long the team lasted (your best for each difficulty is saved in the browser). More players means fewer
// dots. The bot difficulty (Easy / Normal / Hard) also sets how fast the floor rises; Mixed counts as Normal.
// The host (the lowest id, as in the tag variants) runs the floor and the dots and shares them in its
// snapshots. Everyone else follows the host and tells it when they grab a dot.
export const OVERDUE_GRACE = 4;   // seconds before the floor starts rising
export const OVERDUE_PUSH = 90;   // how far one dot pushes the floor back down
const OD_BEST_KEY = 'scb-overdue-best';
/** How fast the floor rises at each difficulty (Normal is the original speed). */
export const OVERDUE_SPEED = { easy: 0.6, normal: 1, hard: 1.5 };
const DIFF_LABEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
/** The difficulty this game would pick for the next round: the bot level (Mixed counts as Normal). */
const pickedDifficulty = () => (OVERDUE_SPEED[G.botLevel] ? G.botLevel : 'normal');
/** Is the floor still waiting (a difficulty change would apply to this round)? */
export const overdueWaiting = () => OD.t < OVERDUE_GRACE && G.round.timer <= 0;
export const OD = {
    t: 0, level: 0, collected: 0, dots: [], nextId: 1, over: false, endText: '',
    diff: 'normal',                   // this round's difficulty (fixed for the round; the host's choice online)
    bests: loadOverdueBests(),        // your best time at each difficulty
    taken: new Map(),                 // dots we grabbed and told the host about (id -> when), hidden meanwhile
    hostAt: 0,                        // the last host snapshot we followed
    up: { x: 0, y: 0, w: 14, h: 18 }, // where a bot climbs when there is no dot worth going for
};
function loadOverdueBests() {
    const out = { easy: 0, normal: 0, hard: 0 };
    try {
        const raw = localStorage.getItem(OD_BEST_KEY);
        const v = raw && raw.trim().startsWith('{') ? JSON.parse(raw) : { normal: Number(raw) }; // older saves: one number (Normal speed)
        for (const k of Object.keys(out)) { const n = Number(v?.[k]); if (n > 0 && n < 36000) out[k] = n; }
    } catch (e) { /* storage blocked or garbage: start fresh */ }
    return out;
}
/** How fast the floor rises (units a second): nothing during the grace period, then faster the longer it goes. */
const overdueSpeed = (t) => (t < OVERDUE_GRACE ? 0 : Math.min(140, 18 + (t - OVERDUE_GRACE)) * OVERDUE_SPEED[OD.diff]);
/** The y of the floor's surface. It is measured from the bottom of the screen, like shared positions. */
export const overdueTop = () => view.h - OD.level;
/** 6 dots for one player, one fewer for each extra runner (bots count), never fewer than 2. */
const dotCount = () => clamp(7 - participants().length, 2, 6);
function odReset() {
    Object.assign(OD, { t: 0, level: 0, collected: 0, dots: [], over: false, endText: '', diff: pickedDifficulty() });
    OD.taken.clear();
}
/** A new dot: standing on a card, a to-do item or the header, well above the floor, with room above it (not tucked
 *  under another ledge, where nobody can reach it), and away from the other dots. */
function placeDot() {
    const top = overdueTop() - 150;
    const surfaces = [...G.platforms, ...G.solids];
    const spots = surfaces.filter((s) => s.w >= 30 && s.y > 30 && s.y < top);
    const covered = (p, s) => surfaces.some((o) => o !== s && p.x + 14 > o.x && p.x < o.x + o.w && o.y < p.y + 18 && o.y + o.h > p.y - 30);
    let p = null;
    for (let i = 0; i < 24; i++) {
        const s = spots[Math.floor(Math.random() * spots.length)];
        p = s ? { x: s.x + Math.random() * (s.w - 14), y: s.y - 22 } : { x: 40 + Math.random() * (view.w - 100), y: 40 + Math.random() * Math.max(10, top - 60) };
        if ((!s || !covered(p, s)) && OD.dots.every((d) => Math.hypot(d.x - p.x, d.y - p.y) > 110)) break;
    }
    OD.dots.push({ id: OD.nextId++, x: p.x, y: p.y, w: 14, h: 18 }); // a runner-sized box, so "touching" works
}
/** Every frame in Overdue: the floor, the dots, who is caught, and the rounds. */
export function runOverdue(dt) {
    if (!isOverdue()) return;
    G.clock += dt;
    const host = isHost();
    if (!host) followHost();
    const R = G.round;
    if (R.timer > 0) {
        R.timer -= dt;
        if (R.timer <= 0 && host) startOverdueRound();
        return;
    }
    if (host && OD.t < OVERDUE_GRACE) OD.diff = pickedDifficulty(); // a change before the floor moves counts for this round
    OD.t += dt;
    OD.level += overdueSpeed(OD.t) * dt; // the others run this too between the host's snapshots, so it moves smoothly
    if (host) {
        OD.dots = OD.dots.filter((d) => d.y + d.h < overdueTop() - 4); // the floor swallowed these...
        while (OD.dots.length < dotCount()) placeDot();                 // ...new ones appear higher up
    }
    for (const [id, at] of OD.taken) if (G.clock - at > 1.5) OD.taken.delete(id); // the host never heard: show it again
    for (const r of simulated()) {
        if (r.out) continue;
        for (const d of [...OD.dots]) if (!OD.taken.has(d.id) && touching(r, d)) grabDot(d, host);
        if (OD.level > 0 && r.y + r.h > overdueTop() + 6) catchRunner(r);
    }
    // Nobody can be caught during the grace period, which also covers players who have not seen the new round yet.
    if (host && OD.t > OVERDUE_GRACE && participants().every((p) => p.out)) endOverdueRound();
}
function grabDot(d, host) {
    popText(d.x + 7, d.y - 4, 'ON TIME!', '#facc15', 0.8);
    spawnParticles(d.x + 7, d.y + 9, '#facc15', 12);
    if (host) collectDot(d.id);
    else { OD.taken.set(d.id, G.clock); bridge.send({ type: 'od-dot', id: d.id, room: roomKey() }); }
}
function collectDot(id) {
    const i = OD.dots.findIndex((d) => d.id === id);
    if (i < 0) return;
    OD.dots.splice(i, 1);
    OD.level = Math.max(0, OD.level - OVERDUE_PUSH);
    OD.collected++;
    bridge.pushState();
}
/** Another player grabbed a dot. Only the host acts on it. */
export function overdueDotTaken(id) {
    if (!isOverdue() || !isHost() || G.round.timer > 0) return;
    const d = OD.dots.find((x) => x.id === id);
    if (!d) return;
    spawnParticles(d.x + 7, d.y + 9, '#facc15', 12);
    collectDot(id);
}
function catchRunner(r) {
    r.out = true;
    r.grapple.active = false;
    popText(r.x + r.w / 2, r.y - 12, 'OVERDUE!', '#f87171', 1);
    spawnParticles(r.x + r.w / 2, r.y + r.h / 2, '#ef4444', 22);
    if (r === local) bridge.pushState();
}
function endOverdueRound() {
    OD.endText = 'Overdue (' + DIFF_LABEL[OD.diff] + ')! The team lasted ' + OD.t.toFixed(1) + 's and was on time ' + OD.collected + 'x';
    G.round.timer = ROUND_PAUSE;
    roundOver();
    bridge.pushState();
}
/** The round ended (here, or on the host): banner, and your best time. */
function roundOver() {
    OD.over = true;
    G.round.text = OD.endText;
    if (OD.t > OD.bests[OD.diff]) {
        OD.bests[OD.diff] = +OD.t.toFixed(2);
        G.round.text += ', a new best!';
        try { localStorage.setItem(OD_BEST_KEY, JSON.stringify(OD.bests)); } catch (e) { /* storage blocked */ }
    }
    bridge.toast(G.round.text);
}
function startOverdueRound() {
    resetRoundState(); // everyone here is back in, and the floor and dots start over
    for (const rp of G.remotes.values()) rp.out = false;
    bridge.respawn(); // back to the top of the screen (you and the bots), not where the floor caught you
}
/** What the host shares about the round, in its state snapshots. null for everyone else. */
export function overdueSnapshot() {
    if (!isOverdue() || !isHost()) return null;
    return {
        t: +OD.t.toFixed(2), lv: +OD.level.toFixed(1), c: OD.collected, d: OD.diff, end: +Math.max(0, G.round.timer).toFixed(2), txt: OD.endText,
        dots: OD.dots.map((d) => [d.id, +(d.x / view.w).toFixed(4), +(view.h - d.y).toFixed(1)]),
    };
}
/** Not the host: use the host's floor, dots and round state (checked first, it comes from the network). */
function followHost() {
    const h = [local, ...G.remotes.values()].sort((a, b) => a.id.localeCompare(b.id))[0];
    const s = h && h.od;
    if (!s || typeof s !== 'object' || h.odAt === OD.hostAt) return;
    OD.hostAt = h.odAt;
    const num = (v, hi) => clamp(Number(v) || 0, 0, hi);
    const ending = num(s.end, ROUND_PAUSE) > 0;
    if (!ending && OD.over) { resetRoundState(); bridge.respawn(); } // the host started a new round
    OD.t = num(s.t, 36000);
    OD.level = num(s.lv, 5000);
    OD.collected = Math.floor(num(s.c, 1e6));
    if (OVERDUE_SPEED[s.d]) OD.diff = s.d; // the host's difficulty
    G.round.timer = num(s.end, ROUND_PAUSE);
    if (ending && !OD.over) { OD.endText = String(s.txt || 'Overdue!').slice(0, 120); roundOver(); }
    OD.dots = (Array.isArray(s.dots) ? s.dots : []).slice(0, 12).filter((d) => Array.isArray(d) && Number.isFinite(d[0]))
        .map(([id, nx, by]) => ({ id, x: num(nx, 1) * view.w, y: view.h - num(by, view.h), w: 14, h: 18 }));
    for (const id of OD.taken.keys()) if (!OD.dots.some((d) => d.id === id)) OD.taken.delete(id); // the host has it
    OD.nextId = Math.max(OD.nextId, ...OD.dots.map((d) => d.id + 1)); // in case we become the host
}
/** Bots: go for a dot that is safely above the floor, preferring ones that are not far below them. When the floor
 *  gets close, go for the highest dot, or just climb. */
function overdueGoal(b) {
    const feet = b.y + b.h;
    const danger = feet > overdueTop() - 170;
    const dots = OD.dots.filter((d) => !OD.taken.has(d.id) && d.y + d.h < overdueTop() - 110); // never dive at the floor
    const cost = (d) => Math.hypot(d.x - b.x, d.y - b.y) + Math.max(0, d.y - b.y) * 1.5; // going down costs extra
    let pick = !dots.length ? null : danger ? dots.reduce((a, d) => (d.y < a.y ? d : a)) : dots.reduce((a, d) => (cost(d) < cost(a) ? d : a));
    if (!pick || (danger && pick.y + pick.h > feet - 20)) {
        OD.up.x = clamp(b.x + (b.x < view.w / 2 ? 200 : -200), 20, view.w - 40);
        OD.up.y = Math.max(0, b.y - 200);
        pick = OD.up;
    }
    return { who: pick, chase: true };
}
function overdueDraw() {
    if (OD.level > 0) { // the floor
        const top = overdueTop();
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
    ctx.save();
    for (const d of OD.dots) { // the "on time" dots
        if (OD.taken.has(d.id)) continue;
        const x = d.x + 7;
        const y = d.y + 9 + Math.sin(performance.now() * 0.005 + d.id) * 2;
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#a16207';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
        ctx.beginPath();
        ctx.arc(x, y, 9 + Math.sin(performance.now() * 0.008 + d.id), 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
    const R = G.round;
    if (R.timer > 0) { hudPill(R.text + '   Next round in ' + Math.ceil(R.timer), 0, '#fde68a'); return; }
    const risingIn = Math.ceil(OVERDUE_GRACE - OD.t);
    const diff = DIFF_LABEL[OD.diff];
    hudPill(risingIn > 0 ? 'Overdue (' + diff + ') rising in ' + risingIn + '... climb!' : 'OVERDUE (' + diff + ')   ' + OD.t.toFixed(1) + 's   on time ' + OD.collected + '   best ' + OD.bests[OD.diff].toFixed(1) + 's', 0, '#fecaca');
    if (local.out) hudPill('Caught! The round ends when your whole team is caught', 1, '#fca5a5');
    else if (OD.t < 12) hudPill('Grab the yellow dots to push the floor back down', 1, '#fde68a');
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
    if (isOverdue()) return overdueGoal(b);
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

    // Under a card with the target above it: jumping only bumps its underside, so walk out from under it first.
    if (hunting && dy < -35 && !bot.grapple.active) {
        const roof = G.solids.find((s) => bot.x + bot.w > s.x && bot.x < s.x + s.w && s.y + s.h <= bot.y + 2 && s.y + s.h > bot.y - 160 && target.y < s.y + s.h);
        if (roof) {
            const toLeft = bot.x + bot.w - roof.x;
            const toRight = roof.x + roof.w - bot.x;
            left = toLeft < toRight || (toLeft === toRight && dx < 0);
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
        const wallJump = bot.wallSide !== 0 && !(hunting && dy > -10); // hunting: slide down the wall unless you are above
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
    if (r.out) ctx.globalAlpha = 0.28;                        // out of the round (Hot Potato, caught in Overdue)

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
    if (isOverdue()) { overdueDraw(); return; }
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
            `grounded ${local.grounded}  wall ${local.wallSide}  jumps ${local.jumpsLeft}  dash ${pfOn() && PF.dashMode === 'charges' ? 'charge ' + local.dashCharges : 'cd ' + Math.max(0, local.dashCooldown).toFixed(2)}`,
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
//   flags   checkpoints, in order (the last one finishes the race)       pickups  coins (editor only for now)
//   boosts  speed boost zones you pass through: they bring you up to their speed (power) their way (dir, in degrees)
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
        boosts: [],
        flags: [{ x: 960, y: 500 }],
        pickups: [],
        texts: [],
    };
}

const finite = (v, lo, hi, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(clamp(n, lo, hi) * 10) / 10 : fallback;
};

function cleanRect(o, minW, minH, fixedH, isCard = false) {
    if (!o || typeof o !== 'object') return null;
    const w = finite(o.w, minW, LEVEL_W, NaN);
    const h = fixedH ?? finite(o.h, minH, LEVEL_H, NaN);
    const x = finite(o.x, 0, LEVEL_W - w, NaN);
    const y = finite(o.y, 0, LEVEL_H - h, NaN);
    if (![w, h, x, y].every(Number.isFinite)) return null;
    const rect = { x, y, w, h, dim: DIMS.includes(o.dim) ? o.dim : 'both' };
    if (isCard && o.noWallJump === true) rect.noWallJump = true; // these two are only written when they are on
    if (isCard && o.noGrapple === true) rect.noGrapple = true;
    return rect;
}

/** Speed boosts: 8 directions (degrees, 0 = right, 90 = up), power in speed units. */
export const BOOST_DIRS = [0, 45, 90, 135, 180, 225, 270, 315];
export const BOOST_POWER = { min: 100, max: 2000, def: 700 };
const BOOST_MAX_SPEED = 2400; // a safety cap on total speed after a push (no tunnelling through cards)
function cleanBoost(o) {
    const rect = cleanRect(o, 16, 16);
    if (!rect) return null;
    const dir = Number(o.dir);
    rect.dir = BOOST_DIRS.includes(dir) ? dir : 0;
    rect.power = finite(o.power, BOOST_POWER.min, BOOST_POWER.max, BOOST_POWER.def);
    return rect;
}
/** A line of text on the map (decoration and hints). */
function cleanText(o) {
    if (!o || typeof o !== 'object') return null;
    const x = finite(o.x, 0, LEVEL_W, NaN);
    const y = finite(o.y, 0, LEVEL_H, NaN);
    const text = String(o.text ?? '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 80);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !text) return null;
    return { x, y, text, size: finite(o.size, 8, 96, 20) };
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
    if (!['spawn', 'cards', 'ledges', 'springs', 'boosts', 'flags', 'pickups', 'texts'].some((k) => k in raw)) return null; // not a level at all
    const name = String(raw.name ?? 'Untitled').replace(/[^\w .\-]/g, '').trim().slice(0, 40) || 'Untitled';
    return {
        name,
        spawn: cleanPoint(raw.spawn) || { x: 100, y: LEVEL_H },
        cards: cleanList(raw.cards, (o) => cleanRect(o, 8, 8, undefined, true)),
        ledges: cleanList(raw.ledges, (o) => cleanRect(o, 8, 4, 12)),
        springs: cleanList(raw.springs, (o) => cleanRect(o, 16, 4, 14)),
        boosts: cleanList(raw.boosts, cleanBoost),
        flags: cleanList(raw.flags, cleanPoint),
        pickups: cleanList(raw.pickups, cleanPoint),
        texts: cleanList(raw.texts, cleanText),
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

// --- best times -------------------------------------------------------------
// Every map (told apart by its layout, not its name) keeps your best time and the ghost of that run in the
// browser. Change anything about a map's layout and it is a different map with no time yet. Names and text
// are decoration and do not count.
const RECORDS_KEY = 'scb-records';
const RECORDS = loadRecords();
syncRecord(); // load this map's best time and ghost

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
  "boosts": ${rows(L.boosts)},
  "flags": ${rows(L.flags)},
  "pickups": ${rows(L.pickups)},
  "texts": ${rows(L.texts)}
}
`;
}

/** Use a level (already sanitized). index is its place in the built-in maps, or -1 for your own map.
 *  Every map starts in dimension A. */
function setLevel(data, index = -1) {
    LEVEL.data = data;
    MAPS.index = index;
    PF.dim = 0;
    setSel([]);
    EDIT.drag = null;
    EDIT.box = null;
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
    setLevel({ name: 'Untitled', spawn: { x: 100, y: LEVEL_H }, cards: [], ledges: [], springs: [], boosts: [], flags: [], pickups: [], texts: [] });
    saveLevelLocal();
}

export function setLevelName(name) {
    LEVEL.data.name = String(name).replace(/[^\w .\-]/g, '').trim().slice(0, 40) || 'Untitled';
    MAPS.index = -1;
    saveLevelLocal();
    bridge.mapChanged();
}

/** Anything about the map that matters for a race. A best time only makes sense on exactly this layout. */
function levelSignature(L = LEVEL.data) {
    const parts = [L.spawn, L.cards, L.ledges, L.springs, L.flags, L.pickups]; // not the name or the texts
    if (L.boosts.length) parts.push(L.boosts); // only when there are any, so maps without boosts keep their best times
    return JSON.stringify(parts);
}

/** A short code for a map's layout, used to find its best time. */
export function mapKey(L = LEVEL.data) {
    const s = levelSignature(L);
    return hashString(s).toString(36) + '.' + s.length;
}

function loadRecords() {
    const out = {};
    try {
        const raw = JSON.parse(localStorage.getItem(RECORDS_KEY) || '{}');
        for (const [key, rec] of Object.entries(raw).slice(0, 100)) { // anything odd in storage is ignored
            if (!/^[a-z0-9]{1,10}\.\d{1,6}$/.test(key) || !rec || typeof rec !== 'object') continue;
            const best = Number(rec.best);
            if (!(best > 0 && best < 3600)) continue;
            const ghost = Array.isArray(rec.ghost)
                ? rec.ghost.slice(0, 3000).filter((g) => Array.isArray(g) && Number.isFinite(g[0]) && Number.isFinite(g[1])).map((g) => [g[0], g[1], g[2] === -1 ? -1 : 1])
                : [];
            out[key] = { best, ghost, at: Number(rec.at) || 0 };
        }
    } catch (e) { /* no storage, or it holds garbage: start empty */ }
    return out;
}

function saveRecords() {
    const keep = new Set(MAPS.list.map((m) => mapKey(m.level))); // the campaign's times are never dropped
    const keys = Object.keys(RECORDS);
    if (keys.length > 60) { // maps from the editor pile up: drop the oldest of those
        keys.filter((k) => !keep.has(k)).sort((a, b) => RECORDS[a].at - RECORDS[b].at).slice(0, keys.length - 60).forEach((k) => delete RECORDS[k]);
    }
    try { localStorage.setItem(RECORDS_KEY, JSON.stringify(RECORDS)); } catch (e) { /* storage full or blocked */ }
}

/** Load the best time and ghost that belong to the map on screen. */
function syncRecord() {
    const R = PF.race;
    const rec = RECORDS[mapKey()];
    R.sig = levelSignature();
    R.best = rec ? rec.best : null;
    R.ghost = rec ? rec.ghost : [];
    R.rec = [];
}

/** Best time on a map (a level object), or null. */
export const bestTimeOf = (L) => RECORDS[mapKey(L)]?.best ?? null;

/** The campaign: your best time on each built-in map, and their total once every map has one. */
export function campaign() {
    const rows = MAPS.list.map((m) => ({ name: m.name, best: bestTimeOf(m.level) }));
    const done = rows.filter((r) => r.best !== null).length;
    return { rows, done, total: rows.length, sum: rows.length && done === rows.length ? rows.reduce((s, r) => s + r.best, 0) : null };
}

/** Forget the best time and ghost of a map (the one on screen unless told otherwise). */
export function resetRecord(L = LEVEL.data) {
    const key = mapKey(L);
    const had = !!RECORDS[key];
    delete RECORDS[key];
    saveRecords();
    if (key === mapKey()) { PF.race.best = null; PF.race.ghost = []; PF.race.rec = []; }
    bridge.mapChanged();
    return had;
}

/** 4.32s, or 1:05.32 */
export function fmtTime(s) {
    return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}` : `${s.toFixed(2)}s`;
}

/** The map changed: rebuild the collision world and load that map's best time and ghost. */
function levelChanged(edited = true) {
    scanWorld();
    if (edited) { // you changed a map: it is now your own copy, and it is remembered by the browser
        MAPS.index = -1;
        saveLevelLocal();
    }
    if (levelSignature() !== PF.race.sig) syncRecord(); // a different layout: a different best time
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

/** Is there a map of your own saved in this browser? */
export const hasSavedMap = () => !!loadSavedLevel();

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
    G.solids = L.cards.filter(show).map((o) => box(o, { noWallJump: !!o.noWallJump, noGrapple: !!o.noGrapple }));
    G.platforms = [...L.ledges.filter(show).map((o) => box(o)), ...L.springs.filter(show).map((o) => box(o, { spring: true }))];
    PF.pickups = L.pickups.map((p, id) => ({ id, x: p.x, y: p.y }));
    PF.boosts = L.boosts.map((o, id) => ({ ...o, id })).filter(show);
}

// --- editor model ----------------------------------------------------------
// The app draws the toolbar and forwards the pointer and keys; everything about what a click does is here.
// Selection: sels is everything selected, sel is the last one picked. Select tool: click to pick, shift-click
// to add or remove, drag on empty space to box-select, drag a selected thing to move the whole selection.
export const EDIT = {
    on: false, tool: 'select', snap: 10, dim: 'both',
    sel: null, sels: [], drag: null, box: null,
    boostDir: 0, boostPower: BOOST_POWER.def, // what the next boost gets (the last ones you picked)
    clip: null, pasteCount: 0, hover: { x: 0, y: 0 }, hoverSet: false,
};

const TOOL_KIND = { card: 'cards', nwcard: 'cards', ledge: 'ledges', spring: 'springs', boost: 'boosts', flag: 'flags', pickup: 'pickups' };
const RECT_SPEC = {
    cards: { minW: 16, minH: 16, defW: 160, defH: 120 },
    ledges: { minW: 16, fixedH: 12, defW: 120 },
    springs: { minW: 24, fixedH: 14, defW: 80 },
    boosts: { minW: 16, minH: 16, defW: 60, defH: 60 },
};
const LISTS = ['cards', 'ledges', 'springs', 'boosts', 'flags', 'pickups', 'texts'];
const isRectKind = (k) => k in RECT_SPEC;
const snapv = (v) => (EDIT.snap ? Math.round(v / EDIT.snap) * EDIT.snap : Math.round(v));
const same = (a, b) => a.kind === b.kind && a.index === b.index;
const getItem = (ref) => (ref.kind === 'spawn' ? LEVEL.data.spawn : LEVEL.data[ref.kind]?.[ref.index]);

function setSel(list) {
    EDIT.sels = list;
    EDIT.sel = list.length ? list[list.length - 1] : null;
}

export function setEditing(on) {
    EDIT.on = !!on;
    EDIT.drag = null;
    EDIT.box = null;
    if (!on) setSel([]);
    scanWorld(); // everything is solid while editing, the dimension filter returns afterwards
}

export function setEditorTool(tool) {
    EDIT.tool = tool;
    EDIT.drag = null;
    EDIT.box = null;
}

/** The one selected object (for the number boxes): { kind, index, item }. Null if nothing or several are selected. */
export function selectedItem() {
    if (EDIT.sels.length !== 1) return null;
    const ref = EDIT.sels[0];
    const item = getItem(ref);
    return item ? { ...ref, item } : null;
}

/** Everything that is selected: [{ kind, index, item }]. */
export function selectedItems() {
    return EDIT.sels.map((ref) => ({ ...ref, item: getItem(ref) })).filter((s) => s.item);
}

/** The area an object occupies (for picking and for drawing the selection). */
function boundsOf(kind, o) {
    if (kind === 'spawn') return { x: o.x - 8, y: o.y - STAND_H, w: 16, h: STAND_H };
    if (kind === 'flags') return { x: o.x - 12, y: o.y - 34, w: 30, h: 34 };
    if (kind === 'pickups') return { x: o.x - 9, y: o.y - 9, w: 18, h: 18 };
    if (kind === 'texts') return { x: o.x, y: o.y - o.size, w: Math.max(16, o.text.length * o.size * 0.56), h: o.size * 1.3 };
    return { x: o.x, y: o.y, w: o.w, h: o.h };
}

const inside = (b, x, y, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
const intersects = (a, b) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

/** What is under this point? Thin things (springs, ledges) win over cards; the corner of a box is a resize handle. */
function hitTest(x, y) {
    const L = LEVEL.data;
    if (inside(boundsOf('spawn', L.spawn), x, y, 2)) return { kind: 'spawn' };
    for (const kind of ['texts', 'flags', 'pickups']) {
        for (let i = L[kind].length - 1; i >= 0; i--) if (inside(boundsOf(kind, L[kind][i]), x, y, 2)) return { kind, index: i };
    }
    for (const kind of ['springs', 'ledges', 'boosts', 'cards']) {
        for (let i = L[kind].length - 1; i >= 0; i--) {
            const o = L[kind][i];
            if (!inside(boundsOf(kind, o), x, y, kind === 'cards' ? 0 : 3)) continue;
            const handle = x >= o.x + o.w - 10 && y >= o.y + o.h - 10 && o.w >= 24;
            return { kind, index: i, handle };
        }
    }
    return null;
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
        if (kind === 'texts') o.size = clamp(Number(o.size) || 20, 8, 96);
    }
}

/** The box a group of objects covers (points count as a single spot). */
function groupExtent(entries) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { kind, o } of entries) {
        const w = isRectKind(kind) ? o.w : 0;
        const h = isRectKind(kind) ? o.h : 0;
        minX = Math.min(minX, o.x);
        minY = Math.min(minY, o.y);
        maxX = Math.max(maxX, o.x + w);
        maxY = Math.max(maxY, o.y + h);
    }
    return { minX, minY, maxX, maxY };
}

/** Move objects from their starting positions by (dx, dy), keeping the whole group inside the level.
 *  Returns the shift that was actually used. */
function shiftGroup(refs, origs, dx, dy) {
    const ex = groupExtent(refs.map((r, i) => ({ kind: r.kind, o: origs[i] })));
    const sx = clamp(dx, -ex.minX, LEVEL_W - ex.maxX);
    const sy = clamp(dy, -ex.minY, LEVEL_H - ex.maxY);
    refs.forEach((r, i) => {
        const it = getItem(r);
        it.x = origs[i].x + sx;
        it.y = origs[i].y + sy;
        fit(r.kind, it);
    });
    return { dx: sx, dy: sy };
}

function removeItem({ kind, index }) {
    if (kind === 'spawn') return;
    LEVEL.data[kind].splice(index, 1);
    setSel([]);
}

/** Select everything the box touches (plus anything that was already selected with shift). */
function selectInBox(base) {
    const b = EDIT.box;
    const area = { x: Math.min(b.x1, b.x2), y: Math.min(b.y1, b.y2), w: Math.abs(b.x2 - b.x1), h: Math.abs(b.y2 - b.y1) };
    const L = LEVEL.data;
    const found = [];
    if (intersects(boundsOf('spawn', L.spawn), area)) found.push({ kind: 'spawn' });
    for (const kind of LISTS) L[kind].forEach((o, index) => { if (intersects(boundsOf(kind, o), area)) found.push({ kind, index }); });
    const merged = [...base];
    for (const f of found) if (!merged.some((s) => same(s, f))) merged.push(f);
    setSel(merged);
}

/** Pointer events in design units. type: 'down' | 'move' | 'up'. additive (shift / ctrl held) adds to the selection. */
export function editorPointer(type, rawX, rawY, additive = false) {
    if (!EDIT.on) return;
    const x = clamp(rawX, 0, LEVEL_W);
    const y = clamp(rawY, 0, LEVEL_H);
    EDIT.hover = { x, y };
    EDIT.hoverSet = true;
    const L = LEVEL.data;

    if (type === 'down') {
        const tool = EDIT.tool;
        if (tool === 'select') {
            const hit = hitTest(x, y);
            if (hit) {
                const ref = { kind: hit.kind, index: hit.index };
                const picked = EDIT.sels.some((s) => same(s, ref));
                if (additive && picked) { setSel(EDIT.sels.filter((s) => !same(s, ref))); EDIT.drag = null; return; }
                if (additive) setSel([...EDIT.sels, ref]);
                else if (!picked) setSel([ref]);
                const resize = hit.handle && EDIT.sels.length === 1 && hit.kind !== 'spawn';
                // A plain click (no drag) on one thing of a group picks just that thing; dragging moves the whole group.
                const collapse = picked && EDIT.sels.length > 1 ? ref : null;
                EDIT.drag = { mode: resize ? 'resize' : 'move', sx: x, sy: y, origs: EDIT.sels.map((s) => ({ ...getItem(s) })), changed: false, collapse };
            } else { // empty space: draw a selection box
                const base = additive ? [...EDIT.sels] : [];
                setSel(base);
                EDIT.drag = { mode: 'box', base };
                EDIT.box = { x1: x, y1: y, x2: x, y2: y };
            }
        } else if (tool === 'erase') {
            const hit = hitTest(x, y);
            if (hit && hit.kind !== 'spawn') { removeItem(hit); levelChanged(); }
        } else if (tool === 'spawn') {
            L.spawn = { x: snapv(x), y: snapv(y) };
            fit('spawn', L.spawn);
            setSel([{ kind: 'spawn' }]);
            EDIT.drag = { mode: 'move', sx: x, sy: y, origs: [{ ...L.spawn }], changed: true };
        } else if (tool === 'text') {
            if (L.texts.length >= MAX_OBJECTS) return;
            const p = { x: snapv(x), y: snapv(y), text: 'Text', size: 20 };
            fit('texts', p);
            L.texts.push(p);
            setSel([{ kind: 'texts', index: L.texts.length - 1 }]);
            EDIT.drag = { mode: 'move', sx: x, sy: y, origs: [{ ...p }], changed: true };
        } else if (tool === 'flag' || tool === 'pickup') {
            const kind = TOOL_KIND[tool];
            if (L[kind].length >= MAX_OBJECTS) return;
            const p = { x: snapv(x), y: snapv(y) };
            fit(kind, p);
            L[kind].push(p);
            setSel([{ kind, index: L[kind].length - 1 }]);
            EDIT.drag = { mode: 'move', sx: x, sy: y, origs: [{ ...p }], changed: true };
        } else if (TOOL_KIND[tool]) { // card, ledge, spring: drag out a box
            const kind = TOOL_KIND[tool];
            if (L[kind].length >= MAX_OBJECTS) return;
            const o = { x: snapv(x), y: snapv(y), w: 0, h: RECT_SPEC[kind].fixedH ?? 0, dim: EDIT.dim };
            if (tool === 'nwcard') o.noWallJump = true;
            if (kind === 'boosts') { o.dir = EDIT.boostDir; o.power = EDIT.boostPower; }
            L[kind].push(o);
            setSel([{ kind, index: L[kind].length - 1 }]);
            EDIT.drag = { mode: 'create', sx: o.x, sy: o.y, changed: true };
        }
        return;
    }

    const d = EDIT.drag;
    if (!d) return;

    if (type === 'move') {
        if (d.mode === 'box') {
            EDIT.box.x2 = x;
            EDIT.box.y2 = y;
            selectInBox(d.base);
        } else if (d.mode === 'move') {
            const first = d.origs[0];
            const used = shiftGroup(EDIT.sels, d.origs, snapv(first.x + (x - d.sx)) - first.x, snapv(first.y + (y - d.sy)) - first.y);
            if (used.dx || used.dy) d.changed = true;
        } else {
            const sel = selectedItem();
            if (!sel) return;
            const { kind, item } = sel;
            if (d.mode === 'create') {
                const spec = RECT_SPEC[kind];
                const x2 = snapv(x);
                const y2 = snapv(y);
                item.x = Math.min(d.sx, x2);
                item.w = Math.abs(x2 - d.sx);
                if (!spec.fixedH) { item.y = Math.min(d.sy, y2); item.h = Math.abs(y2 - d.sy); }
            } else if (d.mode === 'resize') {
                const o = d.origs[0];
                item.w = snapv(o.w + (x - d.sx));
                if (!RECT_SPEC[kind].fixedH) item.h = snapv(o.h + (y - d.sy));
                fit(kind, item);
                if (item.w !== o.w || item.h !== o.h) d.changed = true;
            }
        }
    } else if (type === 'up') {
        EDIT.drag = null;
        if (d.mode === 'box') { EDIT.box = null; return; }
        if (d.collapse && !d.changed) setSel([d.collapse]);
        if (d.mode === 'create') { // a plain click makes a default-sized box
            const sel = selectedItem();
            if (sel) {
                const spec = RECT_SPEC[sel.kind];
                if (sel.item.w < 10 && (spec.fixedH || sel.item.h < 10)) { sel.item.w = spec.defW; sel.item.h = spec.fixedH ?? spec.defH; }
                fit(sel.kind, sel.item);
            }
        }
        if (d.changed) levelChanged(); // only a real change makes it "your map" and resets the ghost
    }
}

/** Delete key / button: remove everything selected (the start point stays). */
export function editorDelete() {
    const refs = EDIT.sels.filter((s) => s.kind !== 'spawn');
    if (!refs.length) return false;
    const byKind = {};
    for (const r of refs) (byKind[r.kind] = byKind[r.kind] || []).push(r.index);
    for (const [kind, indexes] of Object.entries(byKind)) {
        for (const i of indexes.sort((a, b) => b - a)) LEVEL.data[kind].splice(i, 1); // from the end, so the numbers stay valid
    }
    setSel([]);
    levelChanged();
    return true;
}

/** Ctrl+C: remember what is selected (not the start point). Returns how many things. */
export function editorCopy() {
    const items = selectedItems().filter((s) => s.kind !== 'spawn');
    if (!items.length) return 0;
    EDIT.clip = items.map((s) => ({ kind: s.kind, item: JSON.parse(JSON.stringify(s.item)) }));
    EDIT.pasteCount = 0;
    return items.length;
}

/** Ctrl+X: copy, then delete. */
export function editorCut() {
    const n = editorCopy();
    if (n) editorDelete();
    return n;
}

/** Ctrl+V: put the copied things down and select them. With a position, the group's top-left corner goes
 *  there; without one, each paste lands a little further along so copies do not hide each other. */
export function editorPaste(atX = null, atY = null) {
    const clip = EDIT.clip;
    if (!clip || !clip.length) return 0;
    const ex = groupExtent(clip.map((c) => ({ kind: c.kind, o: c.item })));
    EDIT.pasteCount++;
    const step = Math.max(EDIT.snap || 0, 10);
    const tx = atX === null ? ex.minX + step * EDIT.pasteCount : snapv(atX);
    const ty = atY === null ? ex.minY + step * EDIT.pasteCount : snapv(atY);
    const dx = clamp(tx - ex.minX, -ex.minX, LEVEL_W - ex.maxX);
    const dy = clamp(ty - ex.minY, -ex.minY, LEVEL_H - ex.maxY);
    const made = [];
    for (const c of clip) {
        if (LEVEL.data[c.kind].length >= MAX_OBJECTS) continue;
        const item = JSON.parse(JSON.stringify(c.item));
        item.x += dx;
        item.y += dy;
        fit(c.kind, item);
        LEVEL.data[c.kind].push(item);
        made.push({ kind: c.kind, index: LEVEL.data[c.kind].length - 1 });
    }
    if (!made.length) return 0;
    setSel(made);
    levelChanged();
    return made.length;
}

/** Ctrl+D: copy and paste in one go, a little to the side. */
export function editorDuplicate() {
    return editorCopy() ? editorPaste(null, null) : 0;
}

/** Ctrl+A: select everything. */
export function editorSelectAll() {
    const refs = [{ kind: 'spawn' }];
    for (const kind of LISTS) LEVEL.data[kind].forEach((_, index) => refs.push({ kind, index }));
    setSel(refs);
    return refs.length;
}

export function editorSelectNone() { setSel([]); }

/** Arrow keys: move the selection by one snap step (one unit if snap is off). */
export function editorNudge(sx, sy) {
    const items = selectedItems();
    if (!items.length) return false;
    const step = EDIT.snap || 1;
    const used = shiftGroup(EDIT.sels, items.map((s) => ({ ...s.item })), sx * step, sy * step);
    if (used.dx || used.dy) levelChanged();
    return true;
}

/** Number boxes, the text box and the pickers. Position, size and text apply to one selected thing; the
 *  dimension and "no wall jump" apply to everything selected. */
export function updateSelected(patch) {
    const items = selectedItems();
    if (!items.length) return false;
    if (patch.dim && DIMS.includes(patch.dim)) for (const s of items) if (isRectKind(s.kind)) s.item.dim = patch.dim;
    for (const flag of ['noWallJump', 'noGrapple']) { // card switches: stored only when on
        if (typeof patch[flag] !== 'boolean') continue;
        for (const s of items) if (s.kind === 'cards') { if (patch[flag]) s.item[flag] = true; else delete s.item[flag]; }
    }
    const boostsSel = items.filter((s) => s.kind === 'boosts');
    if ('dir' in patch && BOOST_DIRS.includes(Number(patch.dir))) {
        EDIT.boostDir = Number(patch.dir);
        for (const s of boostsSel) s.item.dir = EDIT.boostDir;
    }
    if ('power' in patch && Number.isFinite(Number(patch.power))) {
        EDIT.boostPower = clamp(Math.round(Number(patch.power)), BOOST_POWER.min, BOOST_POWER.max);
        for (const s of boostsSel) s.item.power = EDIT.boostPower;
    }
    const one = selectedItem();
    if (one) {
        const { kind, item } = one;
        if (kind === 'texts') {
            if ('text' in patch) item.text = String(patch.text).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 80);
            if ('size' in patch && Number.isFinite(Number(patch.size))) item.size = Number(patch.size);
        }
        for (const k of ['x', 'y', 'w', 'h']) {
            if (k in patch && Number.isFinite(Number(patch[k])) && (isRectKind(kind) || k === 'x' || k === 'y')) item[k] = Number(patch[k]);
        }
        fit(kind, item);
    }
    levelChanged();
    return true;
}

// --- drawing ---------------------------------------------------------------
const DIM_COLOR = { both: '#86a689', a: '#7dd3fc', b: '#c4b5fd' };

function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/** A speed boost: an orange see-through box with chevrons sliding the way it pushes. */
function drawBoost(b, faded) {
    ctx.save();
    ctx.globalAlpha = faded ? 0.25 : 1;
    rrect(b.x, b.y, b.w, b.h, 6);
    ctx.fillStyle = 'rgba(249, 115, 22, 0.16)';
    ctx.fill();
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.setLineDash(faded ? [5, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.clip();
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const reach = Math.hypot(b.w, b.h) / 2 + 12;
    const gap = 18;
    const shift = ((performance.now() / 1000) * (40 + b.power * 0.08)) % gap; // faster chevrons for stronger boosts
    ctx.translate(cx, cy);
    ctx.rotate((-b.dir * Math.PI) / 180);
    ctx.strokeStyle = 'rgba(234, 88, 12, 0.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let x = -reach + shift; x < reach; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x - 5, -7);
        ctx.lineTo(x + 2, 0);
        ctx.lineTo(x - 5, 7);
        ctx.stroke();
    }
    ctx.restore();
    if (EDIT.on && b.w >= 30 && b.h >= 22) { // its power, so you can tell boosts apart while editing
        ctx.save();
        ctx.font = '800 10px Lato, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#9a3412';
        ctx.fillText(String(b.power), b.x + b.w / 2, b.y + b.h - 5);
        ctx.restore();
    }
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

    ctx.textAlign = 'left'; // text on the map (under everything else)
    for (const tx of L.texts) {
        ctx.font = `700 ${tx.size}px Lato, sans-serif`;
        ctx.fillStyle = '#475569';
        ctx.fillText(tx.text, tx.x, tx.y);
    }

    for (const c of L.cards) {
        ctx.globalAlpha = faded(c) ? 0.25 : 1;
        ctx.setLineDash(faded(c) ? [5, 4] : []);
        rrect(c.x, c.y, c.w, c.h, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        // No wall jump: red. No grapple: purple. Both: red border, the top strip half red and half purple.
        const special = c.noWallJump || c.noGrapple;
        ctx.strokeStyle = c.noWallJump ? '#dc2626' : c.noGrapple ? '#7c3aed' : '#c7cdd1';
        ctx.lineWidth = special ? 2.5 : 1.5;
        ctx.stroke();
        const stripH = Math.min(26, c.h * 0.4);
        if (c.noWallJump && c.noGrapple) {
            ctx.fillStyle = '#fca5a5';
            ctx.fillRect(c.x + 1, c.y + 1, (c.w - 2) / 2, stripH);
            ctx.fillStyle = '#c4b5fd';
            ctx.fillRect(c.x + 1 + (c.w - 2) / 2, c.y + 1, (c.w - 2) / 2, stripH);
        } else {
            ctx.fillStyle = c.noWallJump ? '#fca5a5' : c.noGrapple ? '#c4b5fd' : DIM_COLOR[c.dim];
            ctx.fillRect(c.x + 1, c.y + 1, c.w - 2, stripH);
        }
        if (special && c.h >= 30) {
            const label = c.noWallJump && c.noGrapple ? (c.w >= 200 ? 'NO WALL JUMP · NO GRAPPLE' : c.w >= 70 ? 'NO WJ · NO HOOK' : '') : c.noWallJump ? (c.w >= 90 ? 'NO WALL JUMP' : '') : (c.w >= 80 ? 'NO GRAPPLE' : '');
            if (label) {
                ctx.font = '800 9px Lato, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = c.noWallJump ? '#7f1d1d' : '#4c1d95';
                ctx.fillText(label, c.x + c.w / 2, c.y + 14);
                ctx.textAlign = 'left';
            }
        }
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
    for (const b of L.boosts) drawBoost(b, faded(b));
    ctx.globalAlpha = 1;

    if (EDIT.on) { // coins (only shown in the editor: no Platformer game uses them at the moment)
        L.pickups.forEach((p, i) => {
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

/** Editor overlay (after the runners): selection, handles, the selection box and the cursor position. */
export function drawEditor() {
    if (!EDIT.on) return;
    ctx.save();
    const items = selectedItems();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    for (const s of items) {
        const bb = boundsOf(s.kind, s.item);
        ctx.strokeRect(bb.x - 2, bb.y - 2, bb.w + 4, bb.h + 4);
    }
    ctx.setLineDash([]);
    if (items.length === 1 && isRectKind(items[0].kind)) { // the resize handle
        const bb = boundsOf(items[0].kind, items[0].item);
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(bb.x + bb.w - 7, bb.y + bb.h - 7, 9, 9);
    }
    if (EDIT.box) { // box select
        const x = Math.min(EDIT.box.x1, EDIT.box.x2);
        const y = Math.min(EDIT.box.y1, EDIT.box.y2);
        const w = Math.abs(EDIT.box.x2 - EDIT.box.x1);
        const h = Math.abs(EDIT.box.y2 - EDIT.box.y1);
        ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
        ctx.fillRect(x, y, w, h);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
    }
    ctx.font = '600 10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#334155';
    ctx.fillText(`${Math.round(EDIT.hover.x)}, ${Math.round(EDIT.hover.y)}`, Math.min(EDIT.hover.x + 12, LEVEL_W - 70), Math.max(EDIT.hover.y - 8, 12));
    ctx.restore();
    hudPill(`LEVEL EDITOR: ${LEVEL.data.name}${items.length > 1 ? `   ${items.length} selected` : ''}   (the game is paused)`, 0, '#bfdbfe');
}

// ===========================================================================
// PLATFORMER
// ===========================================================================
// Runs in the "platformer" server type. No tagging or bots here. You race to the flags and your best time on each
// map is saved. The level and its editor are in the section above. Aimed grapple and dash charges
// (PF.grappleMode, PF.dashMode) are still in the code but are not offered in the menus.

export const COUNTDOWN = 2; // seconds of 2, 1, GO before a level starts

/** True while the 2, 1, GO countdown is running: you cannot move yet and the clock has not started. */
export const inCountdown = () => isPlatformer() && PF.countdown > 0 && !EDIT.on;

/** Does this map have anything that only exists in one dimension? Tab only does something if it does. */
export const levelHasDims = (L = LEVEL.data) => [...L.cards, ...L.ledges, ...L.springs, ...L.boosts].some((o) => o.dim !== 'both');

/** Start the level over. The app calls this on respawn and whenever a map starts. */
export function labRestart() {
    PF.countdown = isPlatformer() ? COUNTDOWN : 0;
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
    if (!pfOn() || !PF.dimensions || !levelHasDims() || inCountdown()) return; // nothing to flip on a map without dimensions
    PF.dim ^= 1;
    scanWorld();
    spawnParticles(local.x + local.w / 2, local.y + local.h / 2, PF.dim ? '#a78bfa' : '#60a5fa', 24);
    popText(local.x + local.w / 2, local.y - 14, `Dimension ${PF.dim ? 'B' : 'A'}`, PF.dim ? '#c4b5fd' : '#93c5fd', 1);
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
    const isBest = R.best === null || R.t < R.best;
    if (isBest) { // keep it: the best time and the ghost of this run are saved in the browser
        R.best = R.t;
        R.ghost = R.rec.slice(0, 3000);
        RECORDS[mapKey()] = { best: R.best, ghost: R.ghost, at: Date.now() };
        saveRecords();
        bridge.mapChanged();
    }
    const c = MAPS.index >= 0 ? campaign() : null;
    bridge.toast(`Finish! ${fmtTime(R.t)}${isBest ? ', a new best!' : ` (best ${fmtTime(R.best)})`}${c ? `   Campaign ${c.done}/${c.total}${c.sum !== null ? `: ${fmtTime(c.sum)} total` : ''}` : ''}`);
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
    if (!R.flags.length) { hudPill('This level has no flag. Add one in the level editor.', 0, '#fde68a'); return; }
    const flags = R.flags.length > 1 ? `   ${R.next}/${R.flags.length} flags` : '';
    hudPill(R.done ? `Finished in ${fmtTime(R.t)}   best ${fmtTime(R.best)}` : `${fmtTime(R.t)}${flags}${R.best !== null ? `   best ${fmtTime(R.best)}` : ''}`, 0, '#bbf7d0');
}

/** Runs every frame in Platformer mode, before drawing. */
export function platformerUpdate(dt) {
    if (!pfOn() || EDIT.on) return;
    if (PF.countdown > 0) { // 2, 1, GO: no clock and no moving until it ends
        PF.countdown -= dt;
        if (PF.countdown <= 0) {
            PF.countdown = 0;
            popText(local.x + local.w / 2, local.y - 14, 'GO!', '#4ade80', 0.9);
            spawnParticles(local.x + local.w / 2, local.y + local.h, '#4ade80', 14);
        }
        return;
    }
    if (PF.grappleMode === 'aimed') updateAim();
    if (PF.game === 'race') raceUpdate(dt);
}

/** The big 2, 1 in the middle of the level. */
function drawCountdown() {
    if (PF.countdown <= 0) return;
    const n = Math.ceil(PF.countdown);
    const into = 1 - (PF.countdown - (n - 1)); // 0 at the start of each number, 1 at the end (it grows and fades)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `900 ${150 + into * 24}px Lato, sans-serif`;
    ctx.fillStyle = `rgba(15, 23, 42, ${0.62 - into * 0.32})`;
    ctx.fillText(String(n), view.w / 2, view.h / 2 + 30);
    ctx.font = '800 22px Lato, sans-serif';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillText(mapLabel(), view.w / 2, view.h / 2 + 70);
    ctx.restore();
}

/** Runs every frame in Platformer mode, after the runners are drawn. */
export function platformerDraw() {
    if (!pfOn()) return;
    PF.race.flags = LEVEL.data.flags;
    if (PF.dimensions && PF.dim && levelHasDims()) {
        ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
        ctx.fillRect(0, 0, view.w, view.h);
    }
    if (EDIT.on) { drawEditor(); return; }
    if (PF.game === 'race') raceDraw();
    drawCountdown();

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
    if (PF.dimensions && levelHasDims()) tips.push(`Dimension ${PF.dim ? 'B' : 'A'} (Tab flips)`);
    if (PF.grappleMode === 'aimed') tips.push('E hooks the ringed point, R picks the next');
    if (tips.length) hudPill(tips.join('   ·   '), PF.game === 'sandbox' ? 0 : 1, '#c4b5fd');
}
