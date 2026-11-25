// ENGINE: everything about how the game plays. Nothing in here touches the menus or the network.
// Sections: config, state, effects, physics, Fight combat, Tag rules, bot AI, drawing.

/** Filled in by app.js so the engine can reach the menus and the network without importing them. */
export const bridge = { send() {}, pushState() {}, toast() {}, updateHud() {} };

// ===========================================================================
// CONFIG
// ===========================================================================
// Tunable gameplay constants and static data.

// Movement
export const GRAVITY = 1220;
export const GROUND_ACCEL = 2900;
export const AIR_ACCEL = 2100;
export const MAX_VX = 295;
export const GROUND_FRICTION = 0.80;
export const AIR_DRAG = 0.96;
export const JUMP_VEL = -530;
export const DOUBLE_JUMP_VEL = -475;
export const COYOTE_TIME_MAX = 0.12;
export const JUMP_BUFFER_MAX = 0.13;
export const WALL_SLIDE_MAX_VY = 105;
export const WALL_JUMP_VX = 340;
export const WALL_JUMP_VY = -515;
export const DASH_SPEED = 640;
export const DASH_DURATION = 0.14;
export const DASH_COOLDOWN = 0.35; // was 0.80
export const FAST_FALL_SPEED = 780;

// Grapple
export const MAX_GRAPPLE_DIST = 410;
export const SWING_PUMP_FORCE = 880;
export const SWING_DAMPING = 0.996;

// Combat (Fight mode only)
export const ATTACK_DURATION = 0.18;
export const ATTACK_COOLDOWN = 0.38;
export const ATTACK_DAMAGE = 12;
export const MAX_HEALTH = 100;

// Collision
export const STEP_TOLERANCE = 7;  // px a runner may sink into a surface and still be lifted on top of it
export const SOLID_CARDS = true;  // false = course cards are one-way ledges again (old behaviour)

// Server types. `playable: false` entries are shown in the menus but cannot be joined yet.
export const MODES = {
    tag:       { label: 'Tag',                          playable: true },
    fight:     { label: 'Fight',                        playable: true },
    platformer:{ label: 'Platformer, IN PROGRESS',      playable: false },
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

// ===========================================================================
// SHARED STATE
// ===========================================================================
// Shared game state and runner factory. Every other module reads/writes through `G`.

export const $ = (id) => document.getElementById(id);
export const canvas = $('ui-tag-canvas');
export const ctx = canvas.getContext('2d');
export const keys = {};

export function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
}

export const cleanRoom = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || 'UCAS-1';
export const cleanMode = (v) => (MODES[v] && MODES[v].playable ? v : 'tag');

const params = new URLSearchParams(location.search);
const playerId = `guest-${crypto.randomUUID().slice(0, 8)}`;

export const G = {
    active: false,
    mode: cleanMode(params.get('mode')),   // 'tag' | 'fight'
    room: cleanRoom(params.get('room')),
    playerId,
    paletteIndex: hashString(playerId) % PALETTES.length,
    name: '',
    botEnabled: true,
    botManual: false,
    botAlwaysIt: false, // Tag practice: the bot is permanently IT and you only run
    platforms: [],  // one-way ledges
    solids: [],     // fully solid boxes (course cards)
    remotes: new Map(),
    particles: [],
    afterimages: [],
    combatTexts: [],
    combatFeed: [],
    tagFreeze: 0,
    cam: { on: false, s: 1, x: 0, y: 0, tx: 0, ty: 0 }, // Fight-mode follow camera (see CAMERA section)
};

/** Unique id for the current server: same room name in a different mode is a different server. */
export const roomKey = () => `${G.mode}-${G.room}`.toLowerCase();
export const palette = () => PALETTES[G.paletteIndex % PALETTES.length];
export const playerName = () => G.name.trim() || `${palette().name} Runner`;

export function makeRunner(id, over = {}) {
    return {
        id, x: 0, y: 0, w: 14, h: 18, vx: 0, vy: 0,
        grounded: false, coyoteTimer: 0, jumpBufferTimer: 0, wallSide: 0, jumpsLeft: 2,
        dropThroughTimer: 0, fastFalling: false, facing: 1,
        bodyColor: '#2563eb', scarfColor: '#60a5fa', hatColor: '#1d4ed8',
        label: 'Runner',
        isIt: false, itChangedAt: 0, tagsScored: 0,
        kos: 0, health: MAX_HEALTH, comboCount: 0, comboTimer: 0,
        blocking: false, chargeTime: 0, attackKind: 'light', attackDamage: ATTACK_DAMAGE,
        hitFlashTimer: 0, attackTimer: 0, attackCooldown: 0, attackHit: false,
        walkCycle: 0, dashTimer: 0, dashCooldown: 0, dashDir: 1,
        grapple: { active: false, ax: 0, ay: 0, length: 0 },
        ...over,
    };
}

const pal = palette();
export const local = makeRunner(playerId, {
    x: 240, y: 80, isIt: G.mode === 'tag', itChangedAt: Date.now(),
    bodyColor: pal.body, scarfColor: pal.scarf, hatColor: pal.hat,
});

export const bot = makeRunner('local-bot', {
    x: 680, y: 80, facing: -1, dashDir: -1, label: 'Bot',
    bodyColor: '#e11d48', scarfColor: '#fb7185', hatColor: '#be123c',
    aiJumpTimer: 0, aiGrappleTimer: 0,
});

export const isTag = () => G.mode === 'tag';
export const isFight = () => G.mode === 'fight';

// ===========================================================================
// EFFECTS
// ===========================================================================
// Particles, dash afterimages, floating combat text and the K.O. feed.

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

export const popText = (x, y, text, color, life = 0.55) => G.combatTexts.push({ x, y, text, color, life });

export function pushFeed(text) {
    G.combatFeed.unshift(text);
    G.combatFeed.length = Math.min(G.combatFeed.length, 6);
}

/** Advance and draw every visual effect for this frame. */
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

    for (let i = G.combatTexts.length - 1; i >= 0; i--) {
        const t = G.combatTexts[i];
        t.life -= dt;
        t.y -= 24 * dt;
        if (t.life <= 0) { G.combatTexts.splice(i, 1); continue; }
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

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '700 11px Lato, sans-serif';
    ctx.textAlign = 'left';
    G.combatFeed.slice(0, 4).forEach((line, i) => {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.fillRect(18, 18 + i * 25, ctx.measureText(line).width + 18, 20);
        ctx.fillStyle = i === 0 ? '#fbbf24' : '#e2e8f0';
        ctx.fillText(line, 27, 32 + i * 25);
    });
    ctx.restore();
}

// ===========================================================================
// PHYSICS & COLLISION
// ===========================================================================
// Movement, grapple and collision for every runner (player, bot, and remote puppets are not simulated here).

const TOL = STEP_TOLERANCE;
const EPS = 1e-3;

/** Strict AABB overlap with a tiny tolerance so flush surfaces do not count as touching. */
export const overlaps = (a, b) =>
    a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;

// ---------------------------------------------------------------------------
// World (built from the page layout)
// ---------------------------------------------------------------------------

/** Read the page layout. Course cards become solid boxes; everything else is a one-way ledge. */
export function scanWorld() {
    const platforms = [];
    const solids = [];
    const { s, tx, ty } = G.cam; // the camera scales/moves the page; undo it so the map stays in world coordinates
    const toWorld = (r, top = r.top, height = r.height) => ({ x: (r.left - tx) / s, y: (top - ty) / s, w: r.width / s, h: height / s });
    document.querySelectorAll('[data-obstacle="true"]').forEach((el) => {
        if (el.offsetParent === null) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const box = toWorld(rect);
        (SOLID_CARDS && el.classList.contains('canvas-card') ? solids : platforms).push(box);
    });

    const header = document.querySelector('header');
    if (header) {
        const r = header.getBoundingClientRect();
        platforms.push({ ...toWorld(r, r.bottom, 4) });
    }
    G.platforms = platforms;
    G.solids = solids;
}

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

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
        // Feet only slightly inside the top edge: treat as a step-up, the vertical pass lands us.
        if (r.vy >= 0 && r.y + r.h - s.y <= TOL) continue;
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
        if (r.vy >= 0 && prevBottom <= s.y + TOL) {
            land(r, s.y);
        } else if (r.vy < 0 && prevTop >= s.y + s.h - TOL) {
            r.y = s.y + s.h;
            r.vy = 0;
        }
    }
}

/** One-way ledges: only catch a runner that was above them last step and is falling. */
function landOnLedges(r, prevBottom) {
    if (r.vy < 0 || r.dropThroughTimer > 0) return;
    for (const p of G.platforms) {
        if (overLedgeX(r, p) && prevBottom <= p.y + TOL && r.y + r.h >= p.y) {
            land(r, p.y);
            return;
        }
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

/** Fight mode: runners are solid to each other. Only `r` yields; the other runner handles its own side. */
function pushApart(r, others) {
    for (const o of others) {
        if (o === r || !overlaps(r, o)) continue;
        const overlapX = Math.min(r.x + r.w - o.x, o.x + o.w - r.x);
        const overlapY = Math.min(r.y + r.h - o.y, o.y + o.h - r.y);
        const above = r.y + r.h / 2 < o.y + o.h / 2;
        if (overlapY <= overlapX && above && r.vy >= 0) {
            land(r, o.y); // stand on their head
        } else {
            const dir = r.x + r.w / 2 < o.x + o.w / 2 ? -1 : 1;
            r.x += dir * overlapX;
            if (r.vx * dir < 0) r.vx = 0;
        }
    }
}

/** What is directly under the runner's feet: 'floor' | 'solid' | 'ledge' | null. */
export function supportOf(r) {
    const feet = r.y + r.h;
    if (feet >= canvas.height - 0.5) return 'floor';
    if (G.solids.some((s) => r.x < s.x + s.w && r.x + r.w > s.x && Math.abs(feet - s.y) < 0.75)) return 'solid';
    if (r.dropThroughTimer <= 0 && G.platforms.some((p) => overLedgeX(r, p) && Math.abs(feet - p.y) < 0.75)) return 'ledge';
    return null;
}

/** -1 / 1 if a wall (card side or screen edge) is touching the left / right side, else 0. */
function detectWall(r) {
    if (r.x <= 2.5) return -1;
    if (r.x + r.w >= canvas.width - 2.5) return 1;
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
    if (r.x + r.w > canvas.width - 2) { r.x = canvas.width - r.w - 2; if (r.vx > 0) r.vx = 0; }
    if (r.y < 0) { r.y = 0; if (r.vy < 0) r.vy = 0; }
    if (r.y + r.h >= canvas.height) land(r, canvas.height);
}

/** Move in small sub-steps so fast dashes/falls cannot tunnel through thin ledges. */
function moveAndCollide(r, dt, others) {
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
        if (isFight() && others.length) pushApart(r, others);
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

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function triggerDash(r, dir) {
    if (r.dashCooldown > 0 || r.dashTimer > 0) return;
    r.grapple.active = false;
    r.fastFalling = false;
    r.dashDir = dir || r.facing || 1;
    r.facing = r.dashDir;
    r.dashTimer = DASH_DURATION;
    r.dashCooldown = DASH_COOLDOWN;
    r.vx = r.dashDir * DASH_SPEED;
    r.vy = -40;
    spawnParticles(r.x + r.w / 2, r.y + r.h / 2, r.scarfColor, 10);
}

export function handleJump(r) {
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
        r.vy = JUMP_VEL;
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
        r.vx = -r.wallSide * WALL_JUMP_VX;
        r.vy = WALL_JUMP_VY;
        r.facing = -r.wallSide;
        r.wallSide = 0;
        r.jumpBufferTimer = 0;
        r.fastFalling = false;
        r.jumpsLeft = 1;
        spawnParticles(r.x + (r.facing === 1 ? 0 : r.w), r.y + r.h / 2, '#cbd5e1', 8);
        return;
    }
    // 4. Double jump
    if (r.jumpsLeft > 0) {
        r.vy = DOUBLE_JUMP_VEL;
        r.jumpsLeft = 0;
        r.jumpBufferTimer = 0;
        r.fastFalling = false;
        spawnParticles(r.x + r.w / 2, r.y + r.h, r.scarfColor, 8);
    }
}

/** Mid-air S / Down: dive straight down. */
export function fastFall(r) {
    if (r.grounded || r.grapple.active || r.vy <= -180) return;
    r.fastFalling = true;
    r.vy = Math.max(r.vy, FAST_FALL_SPEED);
    spawnParticles(r.x + r.w / 2, r.y, r.scarfColor, 6);
}

/** Raycast diagonally (or straight up) for something to hook onto; toggles the hook off if already attached. */
export function toggleGrapple(r, straightUp = false) {
    if (r.grapple.active) { r.grapple.active = false; return; }

    const ox = r.x + r.w / 2;
    const oy = r.y + 4;
    let dx = straightUp ? 0 : r.facing * 0.65;
    let dy = straightUp ? -1 : -0.76;
    const mag = Math.hypot(dx, dy);
    dx /= mag;
    dy /= mag;

    const anchors = [...G.solids, ...G.platforms];
    let bestDist = MAX_GRAPPLE_DIST;
    let hitX = null;
    let hitY = null;

    for (let d = 18; d <= MAX_GRAPPLE_DIST && hitX === null; d += 4) {
        const px = ox + dx * d;
        const py = oy + dy * d;
        if (py <= 3 || px <= 3 || px >= canvas.width - 3) {
            bestDist = d;
            hitX = Math.max(3, Math.min(canvas.width - 3, px));
            hitY = Math.max(3, py);
        } else if (anchors.some((p) => px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h)) {
            bestDist = d;
            hitX = px;
            hitY = py;
        }
    }

    // Nothing on the ray: snap to the best nearby ledge corner in the aiming direction.
    if (hitX === null) {
        let bestScore = Infinity;
        for (const p of anchors) {
            for (const c of [{ x: p.x + 4, y: p.y + 2 }, { x: p.x + p.w - 4, y: p.y + 2 }, { x: p.x + p.w / 2, y: p.y + 2 }]) {
                const vx = c.x - ox;
                const vy = c.y - oy;
                const dist = Math.hypot(vx, vy);
                if (dist <= 24 || dist > MAX_GRAPPLE_DIST || vy >= -10) continue;
                const dot = (vx / dist) * dx + (vy / dist) * dy;
                const score = dist * (1.2 - dot);
                if (dot > 0.68 && score < bestScore) {
                    bestScore = score;
                    bestDist = dist;
                    hitX = c.x;
                    hitY = c.y;
                }
            }
        }
    }

    // Nothing in reach along the aim: lock onto the nearest card anyway, at any distance.
    if (hitX === null) {
        let nearest = Infinity;
        for (const p of G.solids.length ? G.solids : anchors) {
            const px = Math.max(p.x + 4, Math.min(p.x + p.w - 4, ox));
            const py = Math.max(p.y + 2, Math.min(p.y + p.h, oy - 20));
            const dist = Math.hypot(px - ox, py - oy);
            if (dist > 24 && dist < nearest) { nearest = dist; bestDist = dist; hitX = px; hitY = py; }
        }
    }

    if (hitX === null) {
        spawnParticles(ox + dx * 65, oy + dy * 65, '#94a3b8', 4);
        return;
    }
    const g = r.grapple;
    g.active = true;
    g.ax = hitX;
    g.ay = hitY;
    g.length = Math.max(24, bestDist * 0.92);
    g.limit = Math.max(MAX_GRAPPLE_DIST, g.length); // far hooks may be longer than the normal range
    r.grounded = false;
    r.fastFalling = false;
    r.jumpsLeft = 1;
    if (Math.abs(r.vx) < 90) r.vx += r.facing * 115; // small kick when dropping from rest
    spawnParticles(hitX, hitY, '#fbbf24', 9);
}

// ---------------------------------------------------------------------------
// Per-frame step
// ---------------------------------------------------------------------------

/**
 * Advance one runner by `dt` seconds.
 * @param input  { left, right, up, down, charge } booleans
 * @param others runners this one is solid against in Fight mode
 */
export function stepRunner(r, dt, input, others = []) {
    const { left, right, up, down, charge } = input;

    // Timers
    for (const k of ['dropThroughTimer', 'dashCooldown', 'attackCooldown', 'attackTimer', 'hitFlashTimer', 'coyoteTimer', 'jumpBufferTimer']) {
        if (r[k] > 0) r[k] -= dt;
    }
    if (r.comboTimer > 0) r.comboTimer -= dt; else r.comboCount = 0;
    if (charge) r.chargeTime = Math.min(1.2, r.chargeTime + dt);

    // Drop through a one-way ledge (never through solid cards or the floor)
    if (down && r.grounded && !r.grapple.active && supportOf(r) === 'ledge') {
        r.dropThroughTimer = 0.22;
        r.grounded = false;
        r.coyoteTimer = 0;
        r.y += 4;
    }

    // Horizontal control
    if (r.dashTimer > 0) {
        r.dashTimer -= dt;
        r.vx = r.dashDir * DASH_SPEED;
        if (Math.random() < 0.75) addAfterimage(r);
    } else if (r.grapple.active) {
        // Pump the pendulum along its tangent
        const rx = r.x + r.w / 2 - r.grapple.ax;
        const ry = r.y + 5 - r.grapple.ay;
        const dist = Math.max(1, Math.hypot(rx, ry));
        const tx = ry / dist;
        const ty = -rx / dist;
        const dir = (right ? 1 : 0) - (left ? 1 : 0);
        if (dir) {
            r.vx += dir * tx * SWING_PUMP_FORCE * dt;
            r.vy += dir * ty * SWING_PUMP_FORCE * dt;
            r.facing = dir;
        }
        const damp = Math.pow(SWING_DAMPING, dt * 60);
        r.vx *= damp;
        r.vy *= damp;
    } else {
        const accel = r.grounded ? GROUND_ACCEL : AIR_ACCEL;
        if (left) { r.vx -= accel * dt; r.facing = -1; }
        if (right) { r.vx += accel * dt; r.facing = 1; }
        if (!left && !right) r.vx *= Math.pow(r.grounded ? GROUND_FRICTION : AIR_DRAG, dt * 60);
        r.vx = Math.max(-MAX_VX, Math.min(MAX_VX, r.vx));
    }

    // Gravity (lighter near the jump apex)
    if (r.dashTimer <= 0) {
        const apex = !r.grounded && !r.grapple.active && Math.abs(r.vy) < 95 ? 0.68 : 1;
        r.vy += GRAVITY * apex * dt;
    }

    // Reel the grapple cable
    if (r.grapple.active) {
        if (up) r.grapple.length = Math.max(20, r.grapple.length - 255 * dt);
        else if (down) r.grapple.length = Math.min(r.grapple.limit || MAX_GRAPPLE_DIST, r.grapple.length + 210 * dt);
    }

    const wasGrounded = r.grounded;
    moveAndCollide(r, dt, others);

    // Wall slide
    const pushingWall = (r.wallSide < 0 && left) || (r.wallSide > 0 && right);
    if (pushingWall && !r.grounded && r.vy > WALL_SLIDE_MAX_VY && !r.grapple.active) {
        r.vy = WALL_SLIDE_MAX_VY;
        if (Math.random() < 0.25) spawnParticles(r.wallSide > 0 ? r.x + r.w : r.x, r.y + r.h * 0.7, '#cbd5e1', 1);
    }

    if (wasGrounded && !r.grounded && r.vy >= 0) r.coyoteTimer = COYOTE_TIME_MAX; // walked off a ledge
    if (r.grounded && r.jumpBufferTimer > 0) handleJump(r);                          // buffered jump

    r.walkCycle = r.grounded && Math.abs(r.vx) > 15 ? r.walkCycle + Math.abs(r.vx) * dt * 0.14 : 0;
}

// ===========================================================================
// FIGHT MODE COMBAT
// ===========================================================================
// Fight mode: attacks, hits, guard and K.O.s. Nothing here runs in Tag mode.

export function triggerAttack(r) {
    if (!isFight() || r.attackCooldown > 0 || r.attackTimer > 0 || r.blocking) return;
    r.comboCount = r.comboTimer > 0 ? Math.min(3, r.comboCount + 1) : 1;
    r.comboTimer = 0.75;
    r.attackTimer = ATTACK_DURATION;
    r.attackCooldown = ATTACK_COOLDOWN;
    r.attackHit = false;
    r.attackKind = 'light';
    r.attackDamage = [0, 11, 14, 18][r.comboCount];
    r.vx *= 0.82;
    spawnParticles(r.x + r.w / 2 + r.facing * 10, r.y + r.h / 2, r.scarfColor, 3);
}

export function triggerHeavy(r) {
    if (!isFight() || r.attackCooldown > 0 || r.attackTimer > 0 || r.blocking) return;
    const charge = Math.min(1, r.chargeTime / 0.9);
    r.attackTimer = 0.28 + charge * 0.12;
    r.attackCooldown = 0.65;
    r.attackHit = false;
    r.attackKind = 'heavy';
    r.attackDamage = 22 + charge * 18;
    r.chargeTime = 0;
    r.vx = r.facing * (260 + charge * 180);
    r.vy = -35;
    spawnParticles(r.x + r.w / 2 + r.facing * 16, r.y + r.h / 2, charge >= 0.65 ? '#fde68a' : r.scarfColor, 8 + Math.round(charge * 10));
}

export function resetCombatState(r) {
    Object.assign(r, {
        health: MAX_HEALTH, comboCount: 0, comboTimer: 0, blocking: false,
        chargeTime: 0, attackDamage: ATTACK_DAMAGE, hitFlashTimer: 0, attackTimer: 0, attackCooldown: 0,
    });
}

function respawnAfterKnockout(r) {
    resetCombatState(r);
    r.attackCooldown = 0.4;
    r.grapple.active = false;
    r.vx = r.vy = 0;
    r.x = Math.max(40, Math.min(canvas.width - r.w - 40, (hashString(r.id) % 5) * 180 + 80));
    r.y = 45;
    r.grounded = false;
    spawnParticles(r.x + r.w / 2, r.y + r.h / 2, r.scarfColor, 24);
}

const findRunner = (id) => (id === bot.id ? bot : id === G.playerId ? local : G.remotes.get(id));

/** Apply a hit to a runner this client simulates (the local player or the bot). */
export function takeHit(r, attackerId, damage) {
    if (!isFight() || r.hitFlashTimer > 0) return;
    let dmg = damage;
    if (r.blocking) {
        dmg = Math.max(2, damage * 0.25);
        r.vx *= 0.35;
        popText(r.x + r.w / 2, r.y - 8, 'GUARD!', '#22d3ee');
    }
    r.health = Math.max(0, r.health - dmg);
    r.hitFlashTimer = 0.18;
    r.grapple.active = false;

    const attacker = findRunner(attackerId);
    const pushDir = attacker ? (r.x < attacker.x ? -1 : 1) : -r.facing;
    r.vx = pushDir * 430;
    r.vy = -310;
    spawnParticles(r.x + r.w / 2, r.y + r.h / 2, '#fb7185', 16);

    if (r.health > 0) return;
    if (attacker && attacker !== r) attacker.kos = (attacker.kos || 0) + 1;
    const loser = r.id === G.playerId ? playerName() : r.label;
    const winner = attacker ? (attacker.id === G.playerId ? playerName() : attacker.label || 'Bot') : 'Fighter';
    const text = `${winner} K.O. ${loser}!`;
    bridge.toast(text);
    pushFeed(text);
    popText(r.x + r.w / 2, r.y - 28, 'K.O.!', '#fbbf24', 1.2);
    respawnAfterKnockout(r);
    bridge.updateHud();
    bridge.pushState();
}

const reach = (r) => ({
    x: r.facing === 1 ? r.x + r.w : r.x - 30,
    y: r.y - 3,
    w: r.attackKind === 'heavy' ? 38 : 30,
    h: r.attackKind === 'heavy' ? 28 : 24,
});
const touches = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Resolve the local player's swings and the bot's swings against the local player. */
export function runCombat() {
    if (!isFight()) return;
    if (local.attackTimer > 0 && !local.attackHit) {
        const box = reach(local);
        const targets = [...G.remotes.values()];
        if (G.botEnabled) targets.push(bot);
        const opp = targets.find((o) => touches(box, o));
        if (opp) {
            local.attackHit = true;
            if (opp === bot) {
                takeHit(bot, G.playerId, local.attackDamage);
            } else {
                // The victim applies the real damage; we mirror it locally so the hit feels instant.
                opp.health = Math.max(0, opp.health - (opp.blocking ? Math.max(2, local.attackDamage * 0.25) : local.attackDamage));
                opp.hitFlashTimer = 0.18;
                opp.vx = local.facing * 430;
                opp.vy = -310;
                bridge.send({ type: 'hit', targetId: opp.id, attackerId: G.playerId, damage: local.attackDamage, room: roomKey() });
                if (opp.health <= 0) {
                    opp.health = MAX_HEALTH;
                    local.kos++;
                    bridge.updateHud();
                }
            }
        }
    }

    if (G.botEnabled && bot.attackTimer > 0 && !bot.attackHit && touches(reach(bot), local)) {
        bot.attackHit = true;
        takeHit(local, bot.id, bot.attackDamage);
    }
}


// ===========================================================================
// TAG MODE RULES
// ===========================================================================
// Tag mode: whoever is "IT" tags another runner by touching them. No health, no attacks.

const FREEZE = 0.65;
const touching = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Make sure exactly one human is IT. Called whenever the roster changes. */
export function reconcileIt() {
    if (!isTag() || G.remotes.size === 0) return;
    const all = [local, ...G.remotes.values()];
    const its = all.filter((p) => p.isIt);
    if (its.length === 0) {
        // Nobody is IT: the lowest id volunteers, so every client agrees.
        all.sort((a, b) => a.id.localeCompare(b.id));
        if (all[0] === local) {
            local.isIt = true;
            local.itChangedAt = Date.now();
        }
    } else if (its.length > 1) {
        // Several IT: the most recently changed one wins.
        its.sort((a, b) => (b.itChangedAt || 0) - (a.itChangedAt || 0));
        if (its[0] !== local) local.isIt = false;
    }
    bridge.updateHud();
}

/** A remote player tagged us. */
export function becomeIt() {
    if (!isTag() || local.isIt) return;
    local.isIt = true;
    local.itChangedAt = Date.now();
    G.tagFreeze = 0.55;
    local.vy = -240;
    local.grapple.active = false;
    spawnParticles(local.x + 7, local.y + 9, '#fbbf24', 18);
    bridge.updateHud();
    bridge.pushState();
}

export function runTag(dt) {
    if (!isTag()) return;
    if (G.tagFreeze > 0) { G.tagFreeze -= dt; return; }

    const opponents = [...G.remotes.values()];
    if (G.botEnabled) opponents.push(bot);

    for (const opp of opponents) {
        if (!touching(local, opp)) continue;
        const burstX = (local.x + opp.x) / 2 + 7;
        const burstY = (local.y + opp.y) / 2 + 9;

        if (local.isIt && !opp.isIt) {
            local.isIt = false;
            local.itChangedAt = Date.now();
            local.tagsScored++;
            opp.isIt = true;
            if (opp !== bot) bridge.send({ type: 'tagged', targetId: opp.id, room: roomKey() });
            G.tagFreeze = FREEZE;
            local.vx = (local.x < opp.x ? -1 : 1) * 290;
            local.vy = -220;
            local.grapple.active = false;
            spawnParticles(burstX, burstY, '#fbbf24', 20);
            bridge.updateHud();
            bridge.pushState();
            return;
        }

        if (opp === bot && bot.isIt && !local.isIt) {
            if (!G.botAlwaysIt) { // normal: IT passes to you; practice: the bot stays IT and just knocks you back
                bot.isIt = false;
                bot.tagsScored++;
                local.isIt = true;
                local.itChangedAt = Date.now();
            }
            G.tagFreeze = FREEZE;
            const dir = local.x < bot.x ? -1 : 1;
            local.vx = dir * 280;
            bot.vx = -dir * 280;
            local.vy = bot.vy = -220;
            local.grapple.active = bot.grapple.active = false;
            spawnParticles(burstX, burstY, '#fbbf24', 18);
            bridge.updateHud();
            return;
        }
    }
}

// ===========================================================================
// PRACTICE BOT
// ===========================================================================
// Practice bot. In Tag it chases when IT and flees otherwise; in Fight it always chases and swings.

/** Decide what the bot does this frame; returns the same input shape a player's keys produce. */
export function botInput(bot, target, dt) {
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const dist = Math.hypot(dx, dy);
    const fight = isFight();
    const hunting = fight || bot.isIt;

    const wantDir = hunting ? Math.sign(dx || 1) : -Math.sign(dx || 1);
    let left = wantDir < 0;
    let right = wantDir > 0;
    let up = false;
    let down = false;

    if (!hunting) { // keep away from the screen edges while fleeing
        if (bot.x < 110) { left = false; right = true; }
        if (bot.x > canvas.width - 130) { right = false; left = true; }
    }

    bot.aiJumpTimer -= dt;
    bot.aiGrappleTimer -= dt;

    if (bot.grapple.active) {
        if (bot.grapple.ay - bot.y < -20) up = true;
        if (bot.y <= bot.grapple.ay + 24 || (hunting && dist < 85) || bot.aiGrappleTimer <= -1.3) {
            handleJump(bot);
            bot.aiGrappleTimer = 1.1 + Math.random() * 0.8;
        }
    } else if (bot.aiGrappleTimer <= 0) {
        const targetMuchHigher = hunting && dy < -95 && dist < 340;
        const fallingLow = bot.vy > 210 && bot.y > canvas.height * 0.58;
        const panicEscape = !hunting && dist < 130 && bot.y > 140;
        if (targetMuchHigher || fallingLow || panicEscape) {
            bot.facing = right ? 1 : left ? -1 : bot.facing;
            toggleGrapple(bot, Math.abs(dx) < 55);
            bot.aiGrappleTimer = 1.4 + Math.random() * 0.9;
        }
    }

    if (bot.aiJumpTimer <= 0 && !bot.grapple.active) {
        if ((hunting && dy < -35) || (!hunting && dist < 150 && bot.grounded) || bot.wallSide !== 0) {
            handleJump(bot);
            bot.aiJumpTimer = 0.35 + Math.random() * 0.35;
        } else if (hunting && dy > 75 && bot.grounded) {
            down = true;
            bot.aiJumpTimer = 0.4;
        }
    }

    if (bot.dashCooldown <= 0 && !bot.grapple.active) {
        if ((hunting && Math.abs(dy) < 35 && dist > 90 && dist < 210) || (!hunting && dist < 75)) {
            triggerDash(bot, wantDir || bot.facing);
        }
    }

    if (fight) {
        if (dist < 44 && bot.attackCooldown <= 0) {
            bot.facing = dx >= 0 ? 1 : -1;
            if (!bot.blocking && Math.random() < 0.18) {
                bot.chargeTime = 0.75;
                triggerHeavy(bot);
            } else {
                triggerAttack(bot);
            }
        }
        bot.blocking = dist < 38 && Math.random() < 0.012;
    }

    return { left, right, up, down, charge: false };
}

// ===========================================================================
// DRAWING
// ===========================================================================
// Canvas drawing for runners and grapple ropes.

export function drawRunner(r, label = null) {
    const { x, y, w, h } = r;
    const cx = x + w / 2;
    ctx.save();

    if (isFight()) {
        if (r.blocking) {
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(cx + r.facing * 7, y + h / 2, 10, -1.2, 1.2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        if (r.chargeTime > 0) {
            const ratio = Math.min(1, r.chargeTime / 0.9);
            ctx.strokeStyle = ratio >= 0.65 ? '#fde68a' : r.scarfColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, y + h / 2, 9 + ratio * 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
            ctx.stroke();
        }
        // Health bar
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.fillRect(x - 2, y - 13, w + 4, 3);
        ctx.fillStyle = r.health > 40 ? '#34d399' : '#fb7185';
        ctx.fillRect(x - 2, y - 13, ((w + 4) * Math.max(0, r.health)) / MAX_HEALTH, 3);

        if (r.attackTimer > 0) {
            ctx.fillStyle = r.hitFlashTimer > 0 ? '#ffffff' : r.scarfColor;
            ctx.beginPath();
            ctx.arc(cx + r.facing * 13, y + h / 2, 4.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    if (r.grounded) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
        ctx.beginPath();
        ctx.ellipse(cx, y + h, 7, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Scarf
    const wave = Math.sin(performance.now() * 0.015 + hashString(String(r.id))) * 2.5;
    ctx.fillStyle = r.scarfColor;
    ctx.beginPath();
    ctx.moveTo(cx, y + 7);
    ctx.lineTo(cx - r.facing * 9, y + 5 + wave);
    ctx.lineTo(cx - r.facing * 7, y + 9 + wave);
    ctx.closePath();
    ctx.fill();

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

    if (label) {
        ctx.font = '700 8px Lato, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.fillText(label, cx, y - 3);
    }

    if (isTag() && r.isIt) {
        ctx.shadowColor = 'rgba(245, 158, 11, 0.85)';
        ctx.shadowBlur = 6;
        ctx.font = '900 8px Lato, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('IT!', cx, y - (label ? 13 : 6) + Math.sin(performance.now() * 0.008) * 2 - 3);
        ctx.shadowBlur = 0;
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

// ===========================================================================
// CAMERA (Fight mode): gentle follow + slight zoom
// ===========================================================================
// The page (#page-root) is scaled with CSS and the canvas is drawn with the same transform,
// so the runners stay lined up with the cards. World coordinates never change.
const CAM_ZOOM = 1.25;    // how far in (1 = off)
const CAM_FOLLOW = 2.0;   // lower = lazier follow
const CAM_ZOOM_SPEED = 3; // how fast it eases in/out
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function setCamera(on) { G.cam.on = !!on && isFight(); }
export function resetCamera() { Object.assign(G.cam, { on: false, s: 1, x: 0, y: 0, tx: 0, ty: 0 }); applyCamera(); }

export function updateCamera(dt) {
    const c = G.cam;
    const W = canvas.width;
    const H = canvas.height;
    if (c.on && !isFight()) c.on = false;
    c.s += ((c.on ? CAM_ZOOM : 1) - c.s) * Math.min(1, dt * CAM_ZOOM_SPEED);
    if (!c.on && Math.abs(c.s - 1) < 0.002) c.s = 1;
    const viewW = W / c.s;
    const viewH = H / c.s;
    const k = Math.min(1, dt * CAM_FOLLOW);
    c.x += ((c.on ? local.x + local.w / 2 - viewW / 2 : 0) - c.x) * k;
    c.y += ((c.on ? local.y + local.h / 2 - viewH / 2 : 0) - c.y) * k;
    c.x = clamp(c.x, 0, W - viewW);
    c.y = clamp(c.y, 0, H - viewH);
    c.tx = -c.s * c.x;
    c.ty = -c.s * c.y;
}

/** Push the camera onto the page. The origin follows the scroll position so world = viewport coordinates. */
export function applyCamera() {
    const root = $('page-root');
    if (!root) return;
    const c = G.cam;
    if (c.s === 1 && c.tx === 0 && c.ty === 0) { root.style.transform = ''; root.style.transformOrigin = ''; return; }
    root.style.transformOrigin = `0px ${window.scrollY}px`;
    root.style.transform = `translate(${c.tx}px, ${c.ty}px) scale(${c.s})`;
}
