// APP: the page itself. Menus, chat, keyboard, the fake Canvas dashboard, and the start/stop/room lifecycle.
import { setCamera, resetCamera, updateCamera, applyCamera, G, local, bot, canvas, ctx, keys, $, roomKey, palette, playerName, hashString, cleanMode, cleanRoom, isFight, isTag, MODES, PALETTES, MAX_HEALTH, ATTACK_DAMAGE, JUMP_BUFFER_MAX, scanWorld, stepRunner, botInput, runCombat, takeHit, resetCombatState, triggerAttack, triggerHeavy, runTag, reconcileIt, becomeIt, drawEffects, spawnParticles, drawRunner, drawGrapple, handleJump, fastFall, toggleGrapple, triggerDash, bridge } from './engine.js';
import { hooks, joinRoom, leaveRoom, send, publishPresence, getLobbies, applyPayload, pushState, stepRemotes } from './online.js';

// ===========================================================================
// MENUS, CHAT, LOBBY LIST
// ===========================================================================
// DOM for the game menu, chat, lobby browser and customizer. No game rules live here.

const el = {
    hud: $('game-hud'), tab: $('hud-tab'),
    p1: $('hud-p1'), dot: $('p1-color-dot'), label: $('p1-label'),
    hp: $('p1-health-label'), combo: $('p1-combo-label'),
    it: $('p1-it-tag'), score: $('p1-score'),
    net: $('net-status-dot'), room: $('room-code-input'), mode: $('mode-select'),
    lobbyCount: $('lobby-rooms-count'), online: $('player-count-badge'),
    botDot: $('bot-indicator'), botText: $('bot-btn-text'),
    chat: $('chat-panel'), chatRoom: $('chat-room-label'), chatLog: $('chat-messages'),
    chatInput: $('chat-input'), chatUnread: $('chat-unread'),
    customizer: $('customizer-popover'), nameInput: $('player-name-input'), swatches: $('color-swatch-grid'),
    lobby: $('lobby-popover'), lobbyList: $('lobby-list'),
    toast: $('canvas-toast'),
    trigger: $('secret-ucas-trigger'), pill: $('discovered-tag-pill'),
};

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = 0;
function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.replace('opacity-0', 'opacity-100');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.replace('opacity-100', 'opacity-0'), 2400);
}

// ---------------------------------------------------------------------------
// Menu pill (show / hide)
// ---------------------------------------------------------------------------
const isMenuHidden = () => el.hud.classList.contains('menu-collapsed');

/** Show or hide the bottom menu. When hidden, a small tab stays so it can be brought back. */
function setMenuHidden(hidden) {
    el.hud.classList.toggle('menu-collapsed', hidden);
    el.tab.classList.toggle('hidden', !(hidden && G.active));
    if (hidden) closePopovers();
}

/** Show or hide the whole game UI (game start / stop). */
function setGameUi(active) {
    el.hud.classList.toggle('visible-hud', active);
    el.hud.classList.toggle('hidden-hud', !active);
    el.tab.classList.toggle('hidden', !(active && isMenuHidden()));
    el.trigger.classList.toggle('active-game', active);
    if (active) el.pill.classList.remove('hidden');
    else { closePopovers(); toggleChat(false); }
}

function closePopovers() {
    el.customizer.classList.add('hidden');
    el.lobby.classList.add('hidden');
}

/** Open one popover, closing the other. */
function togglePopover(which) {
    const target = which === 'lobby' ? el.lobby : el.customizer;
    const other = which === 'lobby' ? el.customizer : el.lobby;
    other.classList.add('hidden');
    target.classList.toggle('hidden');
    return !target.classList.contains('hidden');
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);
const isChatOpen = () => !el.chat.classList.contains('hidden');

function toggleChat(open = !isChatOpen()) {
    el.chat.classList.toggle('hidden', !open);
    if (open) {
        el.chatUnread.classList.add('hidden');
        el.chatLog.scrollTop = el.chatLog.scrollHeight;
        el.chatInput.focus();
    } else if (document.activeElement === el.chatInput) {
        el.chatInput.blur();
    }
}

function addChatMessage(msg) {
    const text = esc(msg.text || '').slice(0, 120);
    if (!text) return;
    const line = document.createElement('div');
    line.className = 'rounded-lg bg-slate-800/70 px-2 py-1.5 leading-snug';
    line.innerHTML = `<span class="font-bold text-cyan-300">${esc(msg.senderName || 'Runner')}</span> <span class="text-slate-100">${text}</span>`;
    el.chatLog.appendChild(line);
    while (el.chatLog.children.length > 200) el.chatLog.firstElementChild.remove();
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
    if (!isChatOpen()) el.chatUnread.classList.remove('hidden');
}

const clearChat = () => { el.chatLog.innerHTML = ''; };

// ---------------------------------------------------------------------------
// HUD readouts
// ---------------------------------------------------------------------------
function applyModeUi() {
    el.hud.dataset.mode = G.mode;
    el.mode.value = G.mode;
    el.room.value = G.room;
    el.chatRoom.textContent = `${MODES[G.mode].label.toUpperCase()} · ${G.room}`;
    el.score.title = isTag() ? 'Tags Landed' : 'K.O.s';
    el.score.className = `ml-1 font-mono font-bold ${isTag() ? 'text-white' : 'text-amber-300'}`;
}

function applyPaletteUi() {
    el.dot.style.backgroundColor = palette().scarf;
    el.label.textContent = playerName();
}

function updateHud() {
    el.score.textContent = isTag() ? local.tagsScored : local.kos;
    if (isTag()) {
        el.it.classList.toggle('hidden', !local.isIt);
        el.p1.classList.toggle('ring-2', local.isIt);
        el.p1.classList.toggle('ring-amber-400', local.isIt);
        return;
    }
    el.p1.classList.remove('ring-2', 'ring-amber-400');
    el.hp.textContent = `HP ${Math.max(0, Math.round(local.health))}`;
    el.hp.className = `font-mono text-[10px] ${local.health > MAX_HEALTH * 0.4 ? 'text-emerald-300' : 'text-rose-300'}`;
    const showCombo = local.comboCount > 1 && local.comboTimer > 0;
    el.combo.textContent = `COMBO ${local.comboCount}`;
    el.combo.classList.toggle('hidden', !showCombo);
}

function updatePlayerCount() {
    el.online.textContent = `${1 + G.remotes.size} Online`;
}

const STATUS = { connecting: 'bg-amber-400 animate-pulse', online: 'bg-emerald-400', idle: 'bg-sky-400' };
function setNetStatus(state, title = '') {
    el.net.className = `w-2 h-2 rounded-full ${STATUS[state] || STATUS.idle}`;
    el.net.title = title;
}

function setCamUi() {
    const btn = $('cam-toggle-btn');
    btn.textContent = G.cam.on ? 'Cam: ON' : 'Cam: OFF';
    btn.className = `fight-only px-2.5 py-1 rounded-full border text-[11px] font-semibold transition cursor-pointer ${G.cam.on ? 'bg-sky-600/40 border-sky-400 text-sky-200' : 'bg-slate-700 hover:bg-slate-600 border-slate-500 text-slate-300'}`;
}

function setBotRoleUi() {
    const btn = $('bot-role-btn');
    btn.textContent = G.botAlwaysIt ? 'Bot: Always IT' : 'Bot: Normal';
    btn.title = G.botAlwaysIt ? 'Practice: the bot is always IT and you only run. Click for normal tag.' : 'Normal tag: IT passes back and forth. Click to make the bot always IT (practice running).';
    btn.className = `tag-only px-2.5 py-1 rounded-full border text-[11px] font-semibold transition cursor-pointer ${G.botAlwaysIt ? 'bg-amber-500/30 border-amber-400 text-amber-200' : 'bg-slate-700 hover:bg-slate-600 border-slate-500 text-slate-300'}`;
}

function setBotUi(enabled) {
    el.botDot.className = `w-2 h-2 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-slate-400'}`;
    el.botText.textContent = `Bot: ${enabled ? 'ON' : 'OFF'}`;
    el.botText.className = enabled ? 'text-emerald-300' : 'text-slate-300';
}

// ---------------------------------------------------------------------------
// Customizer + lobby browser
// ---------------------------------------------------------------------------
function renderSwatches(onPick) {
    el.swatches.innerHTML = '';
    PALETTES.forEach((pal, i) => {
        const selected = i === G.paletteIndex;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = pal.name;
        btn.className = `w-full h-7 rounded-lg flex items-center justify-center transition cursor-pointer border-2 ${selected ? 'border-white scale-105 shadow-md' : 'border-transparent opacity-80 hover:opacity-100'}`;
        btn.style.backgroundColor = pal.body;
        btn.innerHTML = `<span class="w-2 h-2 rounded-full" style="background:${selected ? '#fff' : pal.scarf}"></span>`;
        btn.addEventListener('click', () => onPick(i));
        el.swatches.appendChild(btn);
    });
}

/** @param lobbies result of network.getLobbies()  @param onJoin (mode, room) => void */
function renderLobbies(lobbies, onJoin) {
    el.lobbyCount.textContent = lobbies.length;
    if (el.lobby.classList.contains('hidden')) return;
    el.lobbyList.innerHTML = '';
    for (const lobby of lobbies) {
        const current = lobby.mode === G.mode && lobby.room === G.room;
        const count = lobby.players.size;
        const names = [...lobby.players.values()].map((p) => esc(p.name)).slice(0, 4).join(', ');
        const row = document.createElement('div');
        row.className = `flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border transition ${current ? 'bg-emerald-950/60 border-emerald-500/60' : 'bg-slate-800/80 border-slate-700 hover:border-slate-500'}`;
        row.innerHTML = `
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                    <span class="font-mono font-bold text-emerald-300 text-xs">${esc(lobby.room)}</span>
                    <span class="px-1.5 rounded-full ${lobby.mode === 'fight' ? 'bg-rose-500/30 text-rose-200' : 'bg-amber-400/25 text-amber-200'} text-[10px] font-bold">${MODES[lobby.mode].label}</span>
                    <span class="px-1.5 rounded-full bg-slate-700 text-[10px] text-slate-200 font-semibold">${count} ${count === 1 ? 'player' : 'players'}</span>
                </div>
                <div class="text-[10px] text-slate-400 truncate mt-0.5">${names || 'Empty, ready to join'}</div>
            </div>`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = current ? 'Joined' : 'Join';
        btn.className = current
            ? 'px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/40 cursor-default'
            : 'px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] transition cursor-pointer';
        if (!current) btn.addEventListener('click', () => onJoin(lobby.mode, lobby.room));
        row.appendChild(btn);
        el.lobbyList.appendChild(row);
    }
}

// ===========================================================================
// FAKE CANVAS DASHBOARD
// ===========================================================================
// The fake Canvas LMS page: to-do list, nav, card links and toasts. Unrelated to the game rules.

const layoutChanged = () => document.dispatchEvent(new Event('layout-changed'));

// Dismiss To-Do items. The game map is rebuilt from the page, so tell it when the layout changes.
const todoList = document.getElementById('todo-list');
const initialTodoHTML = todoList.innerHTML;

todoList.addEventListener('click', (e) => {
    if (e.target.classList.contains('dismiss-todo')) {
        const li = e.target.closest('li');
        if (!li) return;
        li.style.cssText = 'opacity:0;transform:translateX(12px);transition:all 0.18s ease';
        setTimeout(() => { li.remove(); layoutChanged(); }, 180);
    } else if (e.target.classList.contains('todo-link')) {
        e.preventDefault();
        showToast(`Opening assignment: ${e.target.textContent}`);
    }
});

document.getElementById('show-all-todos-btn').addEventListener('click', () => {
    todoList.innerHTML = initialTodoHTML;
    showToast('All To-Do items restored');
    layoutChanged();
});

document.querySelectorAll('.course-link').forEach((link) =>
    link.addEventListener('click', (e) => {
        e.preventDefault();
        showToast(`Loaded course: ${link.textContent.trim()}`);
    }));

document.querySelectorAll('.card-menu-btn').forEach((btn) =>
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showToast('Card color & nickname options');
    }));

document.getElementById('switch-view-btn').addEventListener('click', () => showToast('Card View is active'));

const ACTIVE_NAV = ['bg-[#f4f6f8]', 'border-b-2', 'md:border-b-0', 'md:border-l-[3px]', 'border-canvas-ucasGreen', 'text-canvas-ucasGreen'];
document.querySelectorAll('.nav-item').forEach((item) =>
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove(...ACTIVE_NAV));
        item.classList.add(...ACTIVE_NAV);
        const name = item.dataset.nav;
        document.getElementById('page-heading').textContent = name;
        if (name !== 'Dashboard') showToast(`${name} drawer opened, click Dashboard to return`);
    }));

// ===========================================================================
// KEYBOARD
// ===========================================================================
// Keyboard controls.
//   Move: WASD / arrows     Jump: W / Up / Space      Dive: S / Down in mid-air
//   Grapple: E Q / Enter  (F or . = straight up)        Dash: Shift, C, M or double-tap left/right
//   Fight only: J / X light combo, hold K heavy, hold L guard      Menu: H      Game on/off: `

const lastTap = { KeyA: 0, KeyD: 0, ArrowLeft: 0, ArrowRight: 0 };
const GRAPPLE = ['KeyE', 'KeyQ', 'Slash', 'Enter'];
const GRAPPLE_UP = ['KeyF', 'Period'];
const DASH = ['KeyC', 'KeyM', 'ShiftLeft', 'ShiftRight'];
const JUMP = ['KeyW', 'ArrowUp', 'Space'];
const DOWN = ['KeyS', 'ArrowDown'];
const BLOCKED_DEFAULTS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash'];

const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    const code = e.code;
    const fresh = !keys[code];

    if (code === 'Backquote') { e.preventDefault(); toggleGame(); return; }
    if (!G.active) return;
    if (BLOCKED_DEFAULTS.includes(code)) e.preventDefault();
    if (code === 'KeyH' && fresh) setMenuHidden(!isMenuHidden());

    if (fresh && code in lastTap) {
        const now = performance.now();
        if (now - lastTap[code] < 230) triggerDash(local, code === 'KeyA' || code === 'ArrowLeft' ? -1 : 1);
        lastTap[code] = now;
    }

    if (fresh) {
        if (JUMP.includes(code)) { local.jumpBufferTimer = JUMP_BUFFER_MAX; handleJump(local); }
        if (DOWN.includes(code)) fastFall(local);
        if (GRAPPLE.includes(code)) toggleGrapple(local, false);
        if (GRAPPLE_UP.includes(code)) toggleGrapple(local, true);
        if (DASH.includes(code)) triggerDash(local, local.facing);
        if (isFight()) {
            if (code === 'KeyJ' || code === 'KeyX') triggerAttack(local);
            if (code === 'KeyK') local.chargeTime = 0;
            if (code === 'KeyL') local.blocking = true;
        }
    }
    keys[code] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (G.active && isFight()) {
        if (e.code === 'KeyK') { triggerHeavy(local); local.chargeTime = 0; }
        if (e.code === 'KeyL') local.blocking = false;
    }
    // Releasing jump early cuts the rise for short hops.
    if (JUMP.includes(e.code) && local.vy < -190 && !local.grapple.active) local.vy *= 0.56;
});

// ===========================================================================
// LIFECYCLE, ROOMS, FRAME LOOP
// ===========================================================================
// Game lifecycle: start/stop, rooms and modes, the per-frame loop and incoming network messages.

let lastFrame = 0;
let syncTimer = 0;
let pulseTimer = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const presence = () => publishPresence(playerName(), palette().body);
const joinFromLobby = (mode, room) => { switchRoom(mode, room); closePopovers(); };
const refreshLobbyUi = () => renderLobbies(getLobbies(), joinFromLobby);

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

/** The page layout changed (resize, scroll, to-do list edits): rebuild the map from the DOM. */
function onLayoutChange() {
    if (G.active) resizeCanvas();
    applyCamera();
    scanWorld();
}

/** Apply name / color changes everywhere. */
function refreshIdentity() {
    const p = palette();
    Object.assign(local, { id: G.playerId, bodyColor: p.body, scarfColor: p.scarf, hatColor: p.hat });
    applyPaletteUi();
    renderSwatches((i) => { G.paletteIndex = i; refreshIdentity(); });
    pushState();
    if (G.active) presence();
}

function setBot(enabled, automatic = false) {
    G.botEnabled = enabled;
    if (!automatic) G.botManual = true;
    setBotUi(enabled);
    applyBotRole();
}

/** Tag practice: with "Always IT" the bot chases you forever and you never become IT. Otherwise normal tag. */
function applyBotRole() {
    if (isTag() && G.remotes.size === 0) {
        const chase = G.botAlwaysIt && G.botEnabled;
        bot.isIt = chase;
        local.isIt = !chase;
        local.itChangedAt = Date.now();
    }
    setBotRoleUi();
    updateHud();
}

// ---------------------------------------------------------------------------
// Spawning and mode resets
// ---------------------------------------------------------------------------
function respawn() {
    scanWorld();
    const offset = (hashString(G.playerId) % 5) * 95;
    for (const [r, x] of [[local, Math.min(180 + offset, innerWidth - 120)], [bot, Math.min(680, innerWidth * 0.65)]]) {
        Object.assign(r, { x, y: 45, vx: 0, vy: 0, dashTimer: 0 });
        r.grapple.active = false;
        resetCombatState(r);
    }
    spawnParticles(local.x + 7, local.y + 9, local.bodyColor, 14);
    pushState();
}

/** Fresh stats for a new server. Tag starts everyone as IT until the room sorts it out; Fight has no IT. */
function resetForMode() {
    G.remotes.clear();
    G.tagFreeze = 0;
    G.botManual = false;
    local.isIt = isTag();
    local.itChangedAt = Date.now();
    bot.isIt = false;
    for (const r of [local, bot]) {
        r.tagsScored = 0;
        r.kos = 0;
        resetCombatState(r);
    }
    updatePlayerCount();
    applyBotRole();
}

function switchRoom(mode, room) {
    const nextMode = cleanMode(mode);
    const nextRoom = cleanRoom(room);
    if (nextMode !== G.mode || nextRoom !== G.room) {
        if (G.active) leaveRoom();
        G.mode = nextMode;
        G.room = nextRoom;
        resetForMode();
        setCamera(false);
        setCamUi();
        clearChat();
        showToast(`Joined ${MODES[nextMode].label} room: ${nextRoom}`);
        if (G.active) { joinRoom(); presence(); }
    }
    applyModeUi();
    refreshLobbyUi();
}

// ---------------------------------------------------------------------------
// Start / stop
// ---------------------------------------------------------------------------
function startGame() {
    G.active = true;
    setGameUi(true);
    applyModeUi();
    refreshIdentity();
    resizeCanvas();
    respawn();
    joinRoom();
    presence();
    updateHud();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
}

function stopGame() {
    G.active = false;
    resetCamera();
    setCamUi();
    leaveRoom();
    setGameUi(false);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

const toggleGame = () => (G.active ? stopGame() : startGame());

// ---------------------------------------------------------------------------
// Network messages
// ---------------------------------------------------------------------------
function sendChat(text) {
    const clean = String(text).trim().slice(0, 120);
    if (!clean) return;
    const msg = { type: 'chat', room: roomKey(), senderId: G.playerId, senderName: playerName(), text: clean, sentAt: Date.now() };
    addChatMessage(msg);
    send(msg);
}

function handleMessage(msg) {
    const mine = msg.room === roomKey();
    switch (msg.type) {
        case '_connected':
            setNetStatus('online', `Connected (${G.room})`);
            if (G.active) { pushState(); presence(); }
            break;
        case 'state':
            if (!msg.payload || msg.payload.room !== roomKey()) break;
            applyPayload(msg.payload);
            if (G.remotes.size && G.botEnabled && !G.botManual) setBot(false, true); // real players are here, drop the practice bot
            reconcileIt();
            updatePlayerCount();
            updateHud();
            break;
        case 'tagged':
            if (mine && msg.targetId === G.playerId) becomeIt();
            break;
        case 'hit':
            if (mine && msg.targetId === G.playerId) takeHit(local, msg.attackerId, msg.damage || ATTACK_DAMAGE);
            break;
        case 'chat':
            if (mine && msg.senderId !== G.playerId) addChatMessage(msg);
            break;
        case 'leave':
            if (mine) { G.remotes.delete(msg.id); updatePlayerCount(); updateHud(); }
            break;
    }
}

hooks.message = handleMessage;
hooks.status = setNetStatus;
hooks.lobby = refreshLobbyUi;

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
const playerInput = () => ({
    left: !!(keys.KeyA || keys.ArrowLeft),
    right: !!(keys.KeyD || keys.ArrowRight),
    up: !!(keys.KeyW || keys.ArrowUp || keys.Space),
    down: !!(keys.KeyS || keys.ArrowDown),
    charge: isFight() && !!keys.KeyK,
});

function frame(now) {
    if (!G.active) return;
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rivals = [...G.remotes.values()];
    if (G.botEnabled) rivals.push(bot);
    stepRunner(local, dt, playerInput(), rivals);
    if (G.botEnabled) stepRunner(bot, dt, botInput(bot, local, dt), [local]);
    stepRemotes(dt);
    runTag(dt);
    runCombat();
    updateHud();

    if ((syncTimer += dt) >= 0.085) { syncTimer = 0; pushState(); }   // ~12 Hz
    if ((pulseTimer += dt) >= 2.5) { pulseTimer = 0; presence(); }    // lobby heartbeat

    updateCamera(dt);
    applyCamera();
    ctx.setTransform(G.cam.s, 0, 0, G.cam.s, G.cam.tx, G.cam.ty);
    drawEffects(dt);
    for (const rp of G.remotes.values()) { drawGrapple(rp); drawRunner(rp, rp.label); }
    if (G.botEnabled) { drawGrapple(bot); drawRunner(bot, 'Bot'); }
    drawGrapple(local);
    drawRunner(local, G.name.trim() ? playerName() : null);

    requestAnimationFrame(frame);
}

window.addEventListener('beforeunload', () => { if (G.active) leaveRoom(); });

// ===========================================================================
// BUTTON WIRING
// ===========================================================================
// Entry point: wires the page's buttons to the game.

const on = (id, event, fn) => document.getElementById(id).addEventListener(event, fn);
const onEnter = (id, fn) => on(id, 'keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); fn(); }
});

// Game on / off
on('secret-ucas-trigger', 'click', (e) => { e.preventDefault(); e.stopPropagation(); toggleGame(); });
on('discovered-tag-pill', 'click', () => { if (!G.active) startGame(); });
on('exit-game-btn', 'click', stopGame);
on('respawn-btn', 'click', respawn);
on('toggle-bot-btn', 'click', () => setBot(!G.botEnabled));
on('bot-role-btn', 'click', () => { G.botAlwaysIt = !G.botAlwaysIt; applyBotRole(); });
on('cam-toggle-btn', 'click', () => { setCamera(!G.cam.on); setCamUi(); });

// Menu + chat visibility
on('hide-menu-btn', 'click', () => setMenuHidden(true));
on('hud-tab', 'click', () => setMenuHidden(false));
on('chat-toggle-btn', 'click', () => toggleChat());
on('chat-close-btn', 'click', () => toggleChat(false));
on('chat-form', 'submit', (e) => {
    e.preventDefault();
    sendChat(el.chatInput.value);
    el.chatInput.value = '';
});
on('chat-input', 'keydown', (e) => { if (e.key === 'Escape') toggleChat(false); });

// Rooms and server type
const joinTyped = () => { switchRoom(G.mode, el.room.value); el.room.blur(); };
onEnter('room-code-input', joinTyped);
on('mode-select', 'change', () => { switchRoom(el.mode.value, G.room); el.mode.blur(); });

on('toggle-lobby-btn', 'click', () => {
    if (!togglePopover('lobby')) return;
    publishPresence(playerName(), palette().body);
    refreshLobbyUi();
});
on('close-lobby-btn', 'click', closePopovers);
const createRoom = () => {
    const name = document.getElementById('new-room-input').value.trim();
    if (!name) return;
    switchRoom(document.getElementById('new-room-mode').value, name);
    document.getElementById('new-room-input').value = '';
    closePopovers();
};
on('create-room-btn', 'click', createRoom);
onEnter('new-room-input', createRoom);

// Customizer
on('toggle-customizer-btn', 'click', () => {
    if (!togglePopover('customizer')) return;
    el.nameInput.value = G.name;
    renderSwatches((i) => { G.paletteIndex = i; refreshIdentity(); });
    el.nameInput.focus();
});
on('close-customizer-btn', 'click', closePopovers);
const saveName = () => {
    G.name = el.nameInput.value.trim().slice(0, 14);
    refreshIdentity();
    closePopovers();
    showToast(`Updated runner name: ${playerName()}`);
};
on('save-name-btn', 'click', saveName);
onEnter('player-name-input', saveName);

// Page layout feeds the game map (it changes when you scroll or resize, on purpose)
window.addEventListener('resize', () => G.active && onLayoutChange());
window.addEventListener('scroll', () => G.active && onLayoutChange(), true);
document.addEventListener('layout-changed', onLayoutChange);
window.addEventListener('load', () => {
    onLayoutChange();
    refreshIdentity();
    applyModeUi();
    setBotUi(true);
    setBotRoleUi();
    setNetStatus('idle', 'Cross-device WebSocket & WebRTC ready');
});

// Let the engine and the network reach the menus.
bridge.send = send;
bridge.pushState = pushState;
bridge.toast = showToast;
bridge.updateHud = updateHud;
hooks.toast = showToast;
hooks.count = updatePlayerCount;
