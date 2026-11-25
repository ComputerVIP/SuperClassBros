// APP: the page itself. Menus, chat, keyboard, the fake Canvas dashboard, and the start/stop/room lifecycle.
import {
    G, local, bots, view, keys, $, roomKey, palette, playerName, hashString, cleanMode, cleanRoom,
    isTag, isPlatformer, activeBots, botCountFor, setBotLevel, MAX_BOTS, DEV, MODES, PALETTES, T, PF, JUMP_BUFFER_MAX, bridge,
    scanWorld, stepRunner, stepBots, runTag, reconcileIt, becomeIt, startAsIt, assignRandomIt, freezeLocal, thawLocal, resetRoundState,
    drawEffects, spawnParticles, drawRunner, drawGrapple, drawVariantHud,
    handleJump, fastFall, toggleGrapple, grappleAction, triggerDash, aimPointer, aimCycle, flipDimension, labRestart,
    resizeView, beginFrame, clearScreen, applyDevFlags, teleportLocal, resetTuning, changedTuning,
    drawDebug, platformerUpdate, platformerDraw,
    LEVEL, EDIT, toDesign, drawLevel, levelSpawn, levelToJson, applyLevel, resetLevel, clearLevel, setLevelName,
    setEditing, setEditorTool, editorPointer, editorDelete, updateSelected, selectedItem,
    MAPS, setBuiltinMaps, selectMap, nextMap, useSavedMap, resetGhost,
} from './engine.js';
import { hooks, joinRoom, leaveRoom, send, publishPresence, getLobbies, applyPayload, pushState, stepRemotes } from './online.js';

// ===========================================================================
// MENUS, CHAT, LOBBY LIST
// ===========================================================================
const el = {
    hud: $('game-hud'), tab: $('hud-tab'), panel: $('hud-panel'),
    p1: $('hud-p1'), dot: $('p1-color-dot'), label: $('p1-label'), it: $('p1-it-tag'), score: $('p1-score'),
    net: $('net-status-dot'), room: $('room-code-input'), mode: $('mode-select'),
    lobbyCount: $('lobby-rooms-count'), online: $('player-count-badge'),
    botDot: $('bot-indicator'), botText: $('bot-btn-text'), botRole: $('bot-role-btn'), botLevel: $('bot-level-select'),
    chat: $('chat-panel'), chatRoom: $('chat-room-label'), chatLog: $('chat-messages'), chatInput: $('chat-input'),
    chatUnread: $('chat-unread'), moreUnread: $('more-unread'),
    customizer: $('customizer-popover'), nameInput: $('player-name-input'), swatches: $('color-swatch-grid'),
    lobby: $('lobby-popover'), lobbyList: $('lobby-list'),
    backdrop: $('level-backdrop'), toast: $('canvas-toast'), trigger: $('secret-ucas-trigger'), pill: $('discovered-tag-pill'),
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);

// --- toast -----------------------------------------------------------------
let toastTimer = 0;
function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.replace('opacity-0', 'opacity-100');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.replace('opacity-100', 'opacity-0'), 2400);
}

// --- menu visibility -------------------------------------------------------
const isMenuHidden = () => el.hud.classList.contains('menu-collapsed');

function closePopovers() {
    el.customizer.classList.add('hidden');
    el.lobby.classList.add('hidden');
}

function togglePanel(open = el.panel.classList.contains('hidden')) {
    el.panel.classList.toggle('hidden', !open);
    if (open) closePopovers();
}

/** Hide the whole menu; a small tab stays so it can be brought back. */
function setMenuHidden(hidden) {
    el.hud.classList.toggle('menu-collapsed', hidden);
    el.tab.classList.toggle('hidden', !(hidden && G.active));
    if (hidden) { togglePanel(false); closePopovers(); }
}

/** Show or hide the whole game UI (game start / stop). */
function setGameUi(active) {
    el.hud.classList.toggle('visible-hud', active);
    el.hud.classList.toggle('hidden-hud', !active);
    el.tab.classList.toggle('hidden', !(active && isMenuHidden()));
    el.trigger.classList.toggle('active-game', active);
    if (active) el.pill.classList.remove('hidden');
    else { togglePanel(false); closePopovers(); toggleChat(false); closeEditor(false); }
    setBackdrop();
}

/** The Platformer draws its own level, so the page behind it is covered. */
function setBackdrop() {
    el.backdrop.classList.toggle('hidden', !(G.active && isPlatformer()));
}

/** Open one popover and close the other (and the panel, which they would overlap). */
function togglePopover(which) {
    const target = which === 'lobby' ? el.lobby : el.customizer;
    const other = which === 'lobby' ? el.customizer : el.lobby;
    other.classList.add('hidden');
    target.classList.toggle('hidden');
    const open = !target.classList.contains('hidden');
    if (open) el.panel.classList.add('hidden');
    return open;
}

// --- chat ------------------------------------------------------------------
const isChatOpen = () => !el.chat.classList.contains('hidden');

function toggleChat(open = !isChatOpen()) {
    el.chat.classList.toggle('hidden', !open);
    if (open) {
        el.chatUnread.classList.add('hidden');
        el.moreUnread.classList.add('hidden');
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
    if (!isChatOpen()) { el.chatUnread.classList.remove('hidden'); el.moreUnread.classList.remove('hidden'); }
}

const clearChat = () => { el.chatLog.innerHTML = ''; };

// --- readouts --------------------------------------------------------------
function applyModeUi() {
    el.hud.dataset.mode = G.mode;
    el.mode.value = G.mode;
    el.room.value = G.room;
    el.chatRoom.textContent = `${MODES[G.mode].label.toUpperCase()} · ${G.room}`;
    setBackdrop();
    if (EDIT.on && !isPlatformer()) closeEditor(false);
}

function applyPaletteUi() {
    el.dot.style.backgroundColor = palette().scarf;
    el.label.textContent = playerName();
}

function updateHud() {
    const it = isTag() && local.isIt;
    el.score.textContent = local.tagsScored;
    el.it.classList.toggle('hidden', !it);
    el.p1.classList.toggle('ring-2', it);
    el.p1.classList.toggle('ring-amber-400', it);
}

function updatePlayerCount() {
    el.online.textContent = `${1 + G.remotes.size} online`;
}

const NET_DOT = { connecting: 'bg-amber-400 animate-pulse', online: 'bg-emerald-400', idle: 'bg-sky-400' };
function setNetStatus(state, title = '') {
    el.net.className = `w-2 h-2 rounded-full ${NET_DOT[state] || NET_DOT.idle}`;
    el.net.title = title;
}

function setBotUi(enabled) {
    el.botDot.className = `w-2 h-2 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-slate-400'}`;
    el.botText.textContent = `Bot: ${enabled ? 'ON' : 'OFF'}`;
    el.botText.className = enabled ? 'text-emerald-300' : 'text-slate-300';
}

function setBotRoleUi() {
    const always = G.botAlwaysIt;
    el.botRole.textContent = always ? 'Bot: Always IT' : 'Bot: Normal';
    el.botRole.title = always
        ? 'Practice: the bot is always IT and you only run. Click for normal tag.'
        : 'Normal tag: IT passes back and forth. Click to make the bot always IT (practice running).';
    el.botRole.className = `tag-only classic-only px-2.5 py-1 rounded-full border text-[11px] font-semibold transition cursor-pointer ${always ? 'bg-amber-500/30 border-amber-400 text-amber-200' : 'bg-slate-700 hover:bg-slate-600 border-slate-500 text-slate-300'}`;
}

// --- customizer + lobby browser -------------------------------------------
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

function renderLobbies(lobbies, onJoin) {
    el.lobbyCount.textContent = lobbies.length;
    if (el.lobby.classList.contains('hidden')) return;
    el.lobbyList.innerHTML = '';
    for (const lobby of lobbies) {
        const current = lobby.mode === G.mode && lobby.room === G.room;
        const count = lobby.players.size;
        const names = [...lobby.players.values()].map((p) => esc(p.name)).slice(0, 4).join(', ');
        const badge = lobby.mode === 'tag' ? 'bg-amber-400/25 text-amber-200' : 'bg-sky-400/25 text-sky-200';
        const row = document.createElement('div');
        row.className = `flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border transition ${current ? 'bg-emerald-950/60 border-emerald-500/60' : 'bg-slate-800/80 border-slate-700 hover:border-slate-500'}`;
        row.innerHTML = `
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                    <span class="font-mono font-bold text-emerald-300 text-xs">${esc(lobby.room)}</span>
                    <span class="px-1.5 rounded-full ${badge} text-[10px] font-bold">${MODES[lobby.mode].label}</span>
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
// DEVELOPER TOOLS (only when developer mode is on: add ?dev=1 to the link)
// ===========================================================================
const DEV_TOGGLES = [
    ['hitboxes', 'Hitboxes'], ['stats', 'Stats'], ['fly', 'Fly'], ['infJumps', 'Infinite jumps'], ['teleport', 'Click to teleport'],
];
const DEV_SLIDERS = [ // label, object, key, min, max, step
    ['Time scale', G.dev, 'timeScale', 0.1, 1, 0.05],
    ['Gravity', T, 'GRAVITY', 300, 2400, 10],
    ['Run speed', T, 'MAX_VX', 100, 600, 5],
    ['Jump', T, 'JUMP_VEL', -900, -250, 5],
    ['Double jump', T, 'DOUBLE_JUMP_VEL', -900, -250, 5],
    ['Dash speed', T, 'DASH_SPEED', 300, 1200, 10],
    ['Dash cd (tag)', T, 'DASH_COOLDOWN', 0, 2, 0.05],
    ['Dash cd (platf.)', T, 'DASH_COOLDOWN_PF', 0, 2, 0.05],
    ['Stack speed x', T, 'SLIDE_STACK_MUL', 1, 1.6, 0.01],
    ['Stack boost +', T, 'SLIDE_STACK_ADD', 0, 300, 5],
    ['Stack cap step', T, 'SLIDE_CAP_STEP', 0, 1, 0.05],
    ['Stack cap max', T, 'SLIDE_CAP_MAX', 1.5, 6, 0.1],
    ['Grapple range', T, 'MAX_GRAPPLE_DIST', 100, 1200, 10],
];

function buildDevSliders() {
    const box = $('dev-sliders');
    box.innerHTML = '';
    for (const [label, obj, key, min, max, step] of DEV_SLIDERS) {
        const row = document.createElement('label');
        row.className = 'flex items-center gap-1.5 text-[10px] text-slate-300';
        row.innerHTML = `<span class="w-[74px] shrink-0">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${obj[key]}" class="min-w-0 flex-1 accent-amber-400"><span class="w-9 text-right font-mono text-amber-200">${obj[key]}</span>`;
        const input = row.querySelector('input');
        const out = row.lastElementChild;
        input.addEventListener('input', () => { obj[key] = Number(input.value); out.textContent = obj[key]; });
        box.appendChild(row);
    }
}

/** Dev panel: how many practice bots there are (the variants default to 2, Tag to 1). */
function buildBotCountUi() {
    const box = $('dev-bots');
    box.innerHTML = '<span class="w-12 shrink-0 text-[10px] text-slate-300">Bots</span>';
    const mk = (text) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.className = 'w-6 h-5 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 text-[11px] font-bold cursor-pointer';
        return b;
    };
    const out = document.createElement('span');
    out.className = 'w-5 text-center font-mono text-amber-200 text-[11px]';
    const minus = mk('-');
    const plus = mk('+');
    const set = (n) => {
        G.botCount = Math.max(0, Math.min(MAX_BOTS, n));
        G.botManual = true; // you chose: keep them even when other players join
        if (G.botCount > 0 && !G.botEnabled) { G.botEnabled = true; setBotUi(true); }
        placeBots();
        applyBotRole();
        out.textContent = botCountFor();
    };
    minus.addEventListener('click', () => set(botCountFor() - 1));
    plus.addEventListener('click', () => set(botCountFor() + 1));
    out.textContent = botCountFor();
    box.append(minus, out, plus);
    refreshBotCountUi = () => { out.textContent = botCountFor(); };
}
let refreshBotCountUi = () => {};

const LAB_SELECTS = [ // label, PF key, options
    ['Grapple', 'grappleMode', [['auto', 'Auto: nearest card'], ['aimed', 'Aimed: E fires, R cycles']]],
    ['Dash', 'dashMode', [['charges', '1 charge, refills on touch'], ['cooldown', 'Cooldown']]],
    ['Game', 'game', [['sandbox', 'Sandbox'], ['tide', 'Overdue: rising floor'], ['race', 'Flag race + ghost']]],
];
const LAB_TOGGLES = [['dash8', '8-way dash'], ['springs', 'Spring pads'], ['slide', 'Slide (hold S)'], ['slideStack', 'Slide stacking'], ['dimensions', 'Dimensions (Tab)'], ['nextMap', 'Next map after finishing']];

/** Platformer lab switches. They only take effect in the Platformer server type. */
let labMapSelect = null;

/** Fill the map picker from the built-in maps, and show which one you are on. */
function refreshMapSelect() {
    if (!labMapSelect) return;
    labMapSelect.innerHTML = '';
    MAPS.list.forEach((m, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = `${i + 1}. ${m.name}`;
        labMapSelect.appendChild(o);
    });
    const mine = document.createElement('option');
    mine.value = 'custom';
    mine.textContent = `Your map: ${LEVEL.data.name}`;
    labMapSelect.appendChild(mine);
    labMapSelect.value = MAPS.index >= 0 ? String(MAPS.index) : 'custom';
}

function buildLabUi() {
    const box = $('dev-lab');
    box.innerHTML = '<div class="text-[10px] font-bold text-amber-300">Platformer lab <span class="font-normal text-slate-400">(Platformer server only)</span></div>';
    const apply = () => { scanWorld(); labRestart(); };

    const mapRow = document.createElement('label');
    mapRow.className = 'flex items-center gap-1.5 text-[10px] text-slate-300';
    mapRow.title = 'Pick a map. The [ and ] keys go to the previous and next map.';
    mapRow.innerHTML = '<span class="w-12 shrink-0">Map</span><select class="min-w-0 flex-1 bg-slate-900 text-amber-100 rounded border border-slate-600 px-1 py-0.5 cursor-pointer"></select>';
    labMapSelect = mapRow.querySelector('select');
    labMapSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') { if (!useSavedMap()) showToast('You have not made a map of your own yet. Open the level editor.'); }
        else selectMap(Number(e.target.value));
        refreshMapSelect();
        e.target.blur();
    });
    box.appendChild(mapRow);
    refreshMapSelect();
    for (const [label, key, options] of LAB_SELECTS) {
        const row = document.createElement('label');
        row.className = 'flex items-center gap-1.5 text-[10px] text-slate-300';
        row.innerHTML = `<span class="w-12 shrink-0">${label}</span><select class="min-w-0 flex-1 bg-slate-900 text-amber-100 rounded border border-slate-600 px-1 py-0.5 cursor-pointer">${options.map(([v, t]) => `<option value="${v}"${PF[key] === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
        row.querySelector('select').addEventListener('change', (e) => { PF[key] = e.target.value; apply(); e.target.blur(); });
        box.appendChild(row);
    }
    const toggles = document.createElement('div');
    toggles.className = 'flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-200';
    for (const [key, label] of LAB_TOGGLES) {
        const row = document.createElement('label');
        row.className = 'flex items-center gap-1 cursor-pointer';
        row.innerHTML = `<input type="checkbox" class="accent-amber-400"${PF[key] ? ' checked' : ''}> ${label}`;
        row.firstElementChild.addEventListener('change', (e) => { PF[key] = e.target.checked; apply(); e.target.blur(); });
        toggles.appendChild(row);
    }
    box.appendChild(toggles);
    const restart = document.createElement('button');
    restart.className = 'px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-[10px] text-slate-200 cursor-pointer';
    restart.textContent = 'Restart lab game';
    restart.addEventListener('click', () => respawn());
    box.appendChild(restart);
    const ghost = document.createElement('button');
    ghost.className = 'ml-1 px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-[10px] text-slate-200 cursor-pointer';
    ghost.textContent = 'Reset ghost (G)';
    ghost.addEventListener('click', () => resetGhost(true));
    box.appendChild(ghost);
}

function setupDevUi() {
    if (!DEV) return;
    // Dev-only server types become joinable.
    for (const sel of [el.mode, $('new-room-mode')]) {
        for (const opt of sel.options) {
            if (!MODES[opt.value]?.dev) continue;
            opt.hidden = false;
            opt.disabled = false;
            opt.textContent = MODES[opt.value].label;
        }
    }
    $('dev-panel').classList.remove('hidden');
    buildBotCountUi();
    buildLabUi();
    on('dev-editor-btn', 'click', openEditor);
    const toggles = $('dev-toggles');
    for (const [key, label] of DEV_TOGGLES) {
        const row = document.createElement('label');
        row.className = 'flex items-center gap-1 cursor-pointer';
        row.innerHTML = `<input type="checkbox" class="accent-amber-400"> ${label}`;
        row.firstElementChild.addEventListener('change', (e) => { G.dev[key] = e.target.checked; applyDevFlags(); });
        toggles.appendChild(row);
    }
    buildDevSliders();
    $('dev-reset-btn').addEventListener('click', () => { resetTuning(); G.dev.timeScale = 1; buildDevSliders(); showToast('Tuning reset'); });
    $('dev-copy-btn').addEventListener('click', async () => {
        const text = JSON.stringify(changedTuning(), null, 2);
        try { await navigator.clipboard.writeText(text); showToast('Changed values copied. Paste them into DEFAULTS in engine.js'); }
        catch (e) { showToast(`Could not copy: ${text}`); }
    });
    // Click anywhere on the page to teleport there (when the switch is on).
    window.addEventListener('click', (e) => {
        if (!G.active || !G.dev.teleport || e.target.closest(UI_SELECTOR)) return;
        teleportLocal(e.clientX, e.clientY);
    });
}

// ===========================================================================
// FAKE CANVAS DASHBOARD
// ===========================================================================
// To-do items, nav and card links. The game map is rebuilt from the page, so tell it when the layout changes.
const layoutChanged = () => document.dispatchEvent(new Event('layout-changed'));
const todoList = $('todo-list');
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

$('show-all-todos-btn').addEventListener('click', () => {
    todoList.innerHTML = initialTodoHTML;
    showToast('All To-Do items restored');
    layoutChanged();
});

document.querySelectorAll('.course-link').forEach((link) =>
    link.addEventListener('click', (e) => { e.preventDefault(); showToast(`Loaded course: ${link.textContent.trim()}`); }));

document.querySelectorAll('.card-menu-btn').forEach((btn) =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); showToast('Card color & nickname options'); }));

$('switch-view-btn').addEventListener('click', () => showToast('Card View is active'));

const ACTIVE_NAV = ['bg-[#f4f6f8]', 'border-b-2', 'md:border-b-0', 'md:border-l-[3px]', 'border-canvas-ucasGreen', 'text-canvas-ucasGreen'];
document.querySelectorAll('.nav-item').forEach((item) =>
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove(...ACTIVE_NAV));
        item.classList.add(...ACTIVE_NAV);
        const name = item.dataset.nav;
        $('page-heading').textContent = name;
        if (name !== 'Dashboard') showToast(`${name} drawer opened, click Dashboard to return`);
    }));

// ===========================================================================
// KEYBOARD
// ===========================================================================
//   Move: WASD / arrows     Jump: W / Up / Space      Dive: S / Down in mid-air (drops through ledges on the ground)
//   Grapple: E Q / Enter  (F or . = straight up)      Dash: Shift, C, M or double-tap left/right
//   Menu: H      Game on/off: `
const lastTap = { KeyA: 0, KeyD: 0, ArrowLeft: 0, ArrowRight: 0 };
const GRAPPLE = ['KeyE', 'KeyQ', 'Slash', 'Enter'];
const GRAPPLE_UP = ['KeyF', 'Period'];
const DASH = ['KeyC', 'KeyM', 'ShiftLeft', 'ShiftRight'];
const JUMP = ['KeyW', 'ArrowUp', 'Space'];
const DOWN = ['KeyS', 'ArrowDown'];
const BLOCKED_DEFAULTS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash'];
const UI_SELECTOR = '#game-hud, #chat-panel, #lobby-popover, #customizer-popover, #hud-tab, #editor-panel, #editor-layer';

/** The direction currently held, for the 8-way dash lab. */
const heldDirection = () => ({
    x: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
    y: (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp || keys.Space ? 1 : 0),
});

const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    const code = e.code;
    const fresh = !keys[code];

    if (code === 'Backquote') { e.preventDefault(); toggleGame(); return; }
    if (!G.active) return;
    if (BLOCKED_DEFAULTS.includes(code) || (code === 'Tab' && isPlatformer() && PF.dimensions)) e.preventDefault();
    if (code === 'KeyH' && fresh) setMenuHidden(!isMenuHidden());
    if (EDIT.on) { // the level editor owns the keyboard
        if (code === 'Delete' || code === 'Backspace') { e.preventDefault(); editorDelete(); refreshEditorUi(); }
        else if (code === 'Escape') closeEditor(true);
        return;
    }

    if (fresh && code in lastTap) {
        const now = performance.now();
        if (now - lastTap[code] < 230) triggerDash(local, code === 'KeyA' || code === 'ArrowLeft' ? -1 : 1);
        lastTap[code] = now;
    }
    if (fresh && !local.frozen) {
        if (JUMP.includes(code)) { local.jumpBufferTimer = JUMP_BUFFER_MAX; handleJump(local); }
        if (DOWN.includes(code)) fastFall(local);
        if (GRAPPLE.includes(code)) grappleAction(local);
        if (GRAPPLE_UP.includes(code)) toggleGrapple(local, true);
        if (DASH.includes(code)) triggerDash(local, local.facing, heldDirection());
        if (code === 'KeyR' && DEV && isPlatformer()) aimCycle(); // lab: next grapple target
        if (code === 'Tab') flipDimension();                       // lab: other dimension
        if (DEV && isPlatformer()) { // lab: change map, forget the ghost
            if (code === 'BracketRight') showToast(`Map: ${nextMap(1)}`);
            if (code === 'BracketLeft') showToast(`Map: ${nextMap(-1)}`);
            if (code === 'KeyG') resetGhost(true);
        }
    }
    keys[code] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    // Releasing jump early cuts the rise for short hops.
    if (JUMP.includes(e.code) && local.vy < -190 && !local.grapple.active) local.vy *= 0.56;
});

window.addEventListener('mousemove', (e) => {
    if (G.active && DEV && isPlatformer() && PF.grappleMode === 'aimed') aimPointer(e.clientX, e.clientY);
});
window.addEventListener('click', (e) => {
    if (!G.active || !DEV || !isPlatformer() || PF.grappleMode !== 'aimed' || G.dev.teleport || e.target.closest(UI_SELECTOR)) return;
    aimPointer(e.clientX, e.clientY);
    grappleAction(local);
});

const playerInput = () => ({
    left: !!(keys.KeyA || keys.ArrowLeft),
    right: !!(keys.KeyD || keys.ArrowRight),
    up: !!(keys.KeyW || keys.ArrowUp || keys.Space),
    down: !!(keys.KeyS || keys.ArrowDown),
});

// ===========================================================================
// LIFECYCLE, ROOMS, FRAME LOOP
// ===========================================================================
let lastFrame = 0;
let syncTimer = 0;
let pulseTimer = 0;
let lastSize = '';

const presence = () => publishPresence(playerName(), palette().body);
const joinFromLobby = (mode, room) => { switchRoom(mode, room); closePopovers(); };
const refreshLobbyUi = () => renderLobbies(getLobbies(), joinFromLobby);

/** Match the game world to the window. Zooming the browser or resizing changes the window size, so
 *  the local runner keeps its place on screen (same fraction across, same height above the floor). */
function syncView() {
    const size = `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}:${isPlatformer()}`;
    if (size === lastSize) return;
    lastSize = size;
    const oldW = view.w;
    const feet = view.h - (local.y + local.h);
    resizeView();
    if (G.active && !isPlatformer()) {
        local.x *= view.w / oldW;
        local.y = view.h - feet - local.h;
        local.grapple.active = false;
    }
}

/** The window or the page layout changed (resize, zoom, scroll, to-do list edits): rebuild the map. */
function onLayoutChange() {
    syncView();
    scanWorld();
}

function refreshIdentity() {
    const p = palette();
    Object.assign(local, { id: G.playerId, bodyColor: p.body, scarfColor: p.scarf, hatColor: p.hat });
    applyPaletteUi();
    renderSwatches(pickColor);
    pushState();
    if (G.active) presence();
}
function pickColor(i) { G.paletteIndex = i; refreshIdentity(); }

function setBot(enabled, automatic = false) {
    G.botEnabled = enabled;
    if (!automatic) G.botManual = true;
    setBotUi(enabled);
    applyBotRole();
}

/** Decide who is IT when you are playing alone with bots.
 *  Tag: you are IT, or with "Always IT" the bots are and you only run. Variants: a random player starts as IT. */
function applyBotRole() {
    if (isTag() && G.remotes.size === 0) {
        if (G.mode === 'tag') {
            const list = activeBots();
            const chase = G.botAlwaysIt && list.length > 0;
            for (const b of bots) b.isIt = chase && list.includes(b);
            local.isIt = !chase;
            local.itChangedAt = Date.now();
            local.itSince = G.clock;
        } else {
            assignRandomIt();
        }
    }
    setBotRoleUi();
    refreshBotCountUi();
    updateHud();
}

/** Spread the bots across the screen (used on spawn and when the bot count changes). */
function placeBots() {
    bots.forEach((b, i) => {
        Object.assign(b, { x: clampX(view.w * (0.62 + 0.09 * (i % 5)) - (i > 4 ? 120 : 0)), y: 45 + (i % 3) * 30, vx: 0, vy: 0, dashTimer: 0, pauseTimer: 0, seenTimer: 0 });
        b.grapple.active = false;
    });
}
const clampX = (x) => Math.max(30, Math.min(view.w - 60, x));

function respawn() {
    scanWorld();
    if (isPlatformer()) {
        const p = levelSpawn(); // the level's start point
        Object.assign(local, { x: p.x, y: p.y, vx: 0, vy: 0, dashTimer: 0 });
    } else {
        const offset = (hashString(G.playerId) % 5) * 95;
        Object.assign(local, { x: Math.min(180 + offset, view.w - 120), y: 45, vx: 0, vy: 0, dashTimer: 0 });
    }
    local.grapple.active = false;
    placeBots();
    if (local.sliding) { local.sliding = false; local.h = 18; }
    labRestart(); // lab games start over
    spawnParticles(local.x + 7, local.y + 9, local.bodyColor, 14);
    pushState();
}

/** Fresh state for a new server. */
function resetForMode() {
    G.remotes.clear();
    G.tagFreeze = 0;
    G.botManual = false;
    local.isIt = isTag();
    local.itChangedAt = Date.now();
    local.itSince = G.clock;
    for (const r of bots) r.isIt = false;
    for (const r of [local, ...bots]) r.tagsScored = 0;
    resetRoundState();
    labRestart();
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
        clearChat();
        lastSize = '';
        syncView(); // the Platformer has its own fixed-size world
        scanWorld();
        if (G.active) respawn(); // a different map: start at its spawn
        showToast(`Joined ${MODES[nextMode].label} room: ${nextRoom}`);
        if (G.active) { joinRoom(); presence(); }
    }
    applyModeUi();
    refreshLobbyUi();
}

function startGame() {
    G.active = true;
    setGameUi(true);
    applyModeUi();
    refreshIdentity();
    syncView();
    respawn();
    joinRoom();
    presence();
    applyBotRole();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
}

function stopGame() {
    G.active = false;
    leaveRoom();
    setGameUi(false);
    clearScreen();
}

const toggleGame = () => (G.active ? stopGame() : startGame());

// --- network messages --------------------------------------------------------
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
        case 'level': // another player shared their map
            if (mine && isPlatformer() && msg.fromId !== G.playerId) {
                if (EDIT.on) showToast(`${msg.from || 'Someone'} shared a map. Close the editor to receive it.`);
                else if (applyLevel(msg.level)) { showToast(`${msg.from || 'Someone'} shared the map "${LEVEL.data.name}"`); respawn(); }
            }
            break;
        case 'start-it':
            if (mine && msg.targetId === G.playerId) startAsIt();
            break;
        case 'frozen':
            if (mine && msg.targetId === G.playerId) freezeLocal();
            break;
        case 'thaw':
            if (mine && msg.targetId === G.playerId) thawLocal();
            break;
        case 'chat':
            if (mine && msg.senderId !== G.playerId) addChatMessage(msg);
            break;
        case 'leave':
            if (mine) { G.remotes.delete(msg.id); updatePlayerCount(); updateHud(); }
            break;
    }
}

// --- frame loop -------------------------------------------------------------
function frame(now) {
    if (!G.active) return;
    const raw = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    G.fps = G.fps * 0.9 + (1 / Math.max(raw, 0.001)) * 0.1;
    const dt = raw * (DEV ? G.dev.timeScale : 1); // dev slow-motion only affects the simulation
    beginFrame();
    applyDevFlags();

    const paused = EDIT.on; // the level editor freezes the game
    if (!paused) {
        stepRunner(local, dt, playerInput());
        stepBots(dt);
    }
    stepRemotes(raw);
    if (!paused) runTag(dt);
    if (isPlatformer()) platformerUpdate(dt);
    updateHud();

    if ((syncTimer += raw) >= 0.085) { syncTimer = 0; pushState(); }   // ~12 Hz
    if ((pulseTimer += raw) >= 2.5) { pulseTimer = 0; presence(); }    // lobby heartbeat

    if (isPlatformer()) drawLevel();
    drawEffects(dt);
    for (const rp of G.remotes.values()) { drawGrapple(rp); drawRunner(rp, rp.label); }
    for (const b of activeBots()) if (!b.out) { drawGrapple(b); drawRunner(b, b.label); }
    drawGrapple(local);
    drawRunner(local, G.name.trim() ? playerName() : null);
    if (isPlatformer()) platformerDraw();
    drawVariantHud();
    drawDebug();

    requestAnimationFrame(frame);
}

window.addEventListener('beforeunload', () => { if (G.active) leaveRoom(); });

// ===========================================================================
// LEVEL EDITOR (Platformer, developer mode)
// ===========================================================================
// What a click does is in engine.js (editorPointer). This is the toolbar, saving and loading.
const ED = {
    layer: $('editor-layer'), panel: $('editor-panel'), readout: $('editor-readout'), name: $('editor-name'),
    snap: $('editor-snap'), dim: $('editor-dim'), selLabel: $('editor-sel-label'), file: $('editor-file'),
    x: $('ed-x'), y: $('ed-y'), w: $('ed-w'), h: $('ed-h'),
};
const sure = (message) => typeof window.confirm !== 'function' || window.confirm(message);

function openEditor() {
    if (!DEV || !G.active || !isPlatformer()) { showToast('Start the game in the Platformer server first (menu, Room box).'); return; }
    togglePanel(false);
    closePopovers();
    setEditing(true);
    ED.layer.classList.remove('hidden');
    ED.panel.classList.remove('hidden');
    refreshEditorUi();
}

/** Leave the editor. With play = true you start the level from its spawn to test it. */
function closeEditor(play = true) {
    if (!EDIT.on) return;
    setEditing(false);
    ED.layer.classList.add('hidden');
    ED.panel.classList.add('hidden');
    if (play && G.active) respawn();
}

/** Show the current tool, selection and level name in the toolbar. */
function refreshEditorUi() {
    document.querySelectorAll('[data-tool]').forEach((b) => {
        const active = b.dataset.tool === EDIT.tool;
        b.classList.toggle('bg-blue-600', active);
        b.classList.toggle('bg-slate-700', !active);
    });
    ED.snap.value = String(EDIT.snap);
    ED.name.value = LEVEL.data.name;
    const sel = selectedItem();
    ED.selLabel.textContent = sel ? (sel.kind === 'spawn' ? 'Start point' : `${sel.kind.replace(/s$/, '')} #${sel.index + 1}`) : 'Nothing selected (pick a tool, then click or drag)';
    for (const k of ['x', 'y', 'w', 'h']) {
        const has = !!sel && k in sel.item;
        ED[k].value = has ? String(Math.round(sel.item[k] * 10) / 10) : '';
        ED[k].disabled = !has;
    }
    ED.dim.value = sel && sel.item.dim ? sel.item.dim : EDIT.dim;
}

function downloadLevel() {
    const blob = new Blob([levelToJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${LEVEL.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'level'}.json`;
    document.body?.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Saved ${a.download}`);
}

/** The maps in the maps folder, in the order listed in maps/index.json. */
async function loadBuiltinMaps() {
    try {
        const res = await fetch('maps/index.json');
        if (!res.ok) return;
        const names = await res.json();
        const maps = [];
        for (const file of (Array.isArray(names) ? names : []).slice(0, 50)) {
            if (typeof file !== 'string' || !/^[\w .\-]+\.json$/.test(file)) continue; // plain file names only
            try {
                const r = await fetch(`maps/${encodeURIComponent(file)}`);
                if (r.ok) maps.push(await r.json());
            } catch (e) { /* skip that file */ }
        }
        setBuiltinMaps(maps);
    } catch (e) { /* opened as a plain file or offline: the built-in first map stays */ }
}

/** Load a level from text (a file or a link). Everything is checked first. */
function applyLevelText(text) {
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
    if (!applyLevel(data)) { showToast('That is not a level file.'); return false; }
    showToast(`Loaded the map "${LEVEL.data.name}"`);
    if (EDIT.on) refreshEditorUi();
    else if (G.active && isPlatformer()) respawn(); // new map: start at its spawn
    return true;
}

async function loadMapFromUrl(url) {
    try {
        const u = new URL(url, location.href);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad link');
        const res = await fetch(u.href);
        if (!res.ok) throw new Error(String(res.status));
        const text = await res.text();
        if (text.length > 200000) throw new Error('too big');
        applyLevelText(text);
    } catch (e) { showToast('Could not load the map from the link.'); }
}

// ===========================================================================
// BUTTON WIRING
// ===========================================================================
const on = (id, event, fn) => $(id).addEventListener(event, fn);
const onEnter = (id, fn) => on(id, 'keydown', (e) => {
    e.stopPropagation(); // typing in a box must not move the runner
    if (e.key === 'Enter') { e.preventDefault(); fn(); }
});

// Game on / off
on('secret-ucas-trigger', 'click', (e) => { e.preventDefault(); e.stopPropagation(); toggleGame(); });
on('discovered-tag-pill', 'click', () => { if (!G.active) startGame(); });
on('exit-game-btn', 'click', stopGame);
on('respawn-btn', 'click', respawn);
on('toggle-bot-btn', 'click', () => setBot(!G.botEnabled));
on('bot-role-btn', 'click', () => { G.botAlwaysIt = !G.botAlwaysIt; applyBotRole(); });
on('bot-level-select', 'change', () => { setBotLevel(el.botLevel.value); el.botLevel.blur(); });

// Menu + chat visibility
on('hud-more-btn', 'click', () => togglePanel());
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
onEnter('room-code-input', () => { switchRoom(G.mode, el.room.value); el.room.blur(); });
on('mode-select', 'change', () => { switchRoom(el.mode.value, G.room); el.mode.blur(); });
on('toggle-lobby-btn', 'click', () => {
    if (!togglePopover('lobby')) return;
    presence();
    refreshLobbyUi();
});
on('close-lobby-btn', 'click', closePopovers);
const createRoom = () => {
    const name = $('new-room-input').value.trim();
    if (!name) return;
    switchRoom($('new-room-mode').value, name);
    $('new-room-input').value = '';
    closePopovers();
};
on('create-room-btn', 'click', createRoom);
onEnter('new-room-input', createRoom);

// Level editor
const editorPoint = (e) => toDesign(e.clientX, e.clientY);
on('editor-layer', 'pointerdown', (e) => {
    e.preventDefault();
    ED.layer.setPointerCapture?.(e.pointerId);
    const p = editorPoint(e);
    editorPointer('down', p.x, p.y);
    refreshEditorUi();
});
on('editor-layer', 'pointermove', (e) => {
    const p = editorPoint(e);
    editorPointer('move', p.x, p.y);
    ED.readout.textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`;
    if (EDIT.drag) refreshEditorUi();
});
for (const ev of ['pointerup', 'pointercancel']) {
    on('editor-layer', ev, (e) => {
        const p = editorPoint(e);
        editorPointer('up', p.x, p.y);
        refreshEditorUi();
    });
}
on('editor-panel', 'click', (e) => {
    const b = e.target.closest?.('[data-tool]');
    if (b) { setEditorTool(b.dataset.tool); refreshEditorUi(); }
});
on('editor-play-btn', 'click', () => closeEditor(true));
on('editor-snap', 'change', () => { EDIT.snap = Number(ED.snap.value) || 0; });
on('editor-dim', 'change', () => { EDIT.dim = ED.dim.value; updateSelected({ dim: ED.dim.value }); refreshEditorUi(); });
for (const k of ['x', 'y', 'w', 'h']) on(`ed-${k}`, 'change', () => { updateSelected({ [k]: ED[k].value }); refreshEditorUi(); });
on('editor-name', 'change', () => { setLevelName(ED.name.value); refreshEditorUi(); });
on('editor-save-btn', 'click', downloadLevel);
on('editor-load-btn', 'click', () => ED.file.click());
on('editor-file', 'change', async () => {
    const file = ED.file.files?.[0];
    if (!file) return;
    if (file.size > 200000) showToast('That file is too big to be a level.');
    else { try { applyLevelText(await file.text()); } catch (e) { showToast('That file could not be read.'); } }
    ED.file.value = '';
});
on('editor-share-btn', 'click', () => {
    send({ type: 'level', room: roomKey(), from: playerName(), fromId: G.playerId, level: JSON.parse(levelToJson()) });
    showToast('Map sent to everyone in this room');
});
on('editor-reset-btn', 'click', () => { if (sure('Replace the map with the default one?')) { resetLevel(); refreshEditorUi(); } });
on('editor-clear-btn', 'click', () => { if (sure('Delete everything on this map?')) { clearLevel(); refreshEditorUi(); } });

// Customizer
on('toggle-customizer-btn', 'click', () => {
    if (!togglePopover('customizer')) return;
    el.nameInput.value = G.name;
    renderSwatches(pickColor);
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

// Window size, browser zoom, scrolling and page edits all rebuild the map (scrolling changes your map on purpose)
window.addEventListener('resize', () => onLayoutChange());
window.addEventListener('scroll', () => { if (G.active) scanWorld(); }, true);
document.addEventListener('layout-changed', onLayoutChange);
window.addEventListener('load', () => {
    onLayoutChange();
    setupDevUi(); // before applyModeUi so a dev-only mode can be shown in the selector
    refreshIdentity();
    applyModeUi();
    setBotUi(true);
    setBotLevel(G.botLevel);
    setBotRoleUi();
    setNetStatus('idle', 'Cross-device WebSocket & WebRTC ready');
    loadBuiltinMaps().then(() => {
        const mapLink = new URLSearchParams(location.search).get('map'); // ?map=maps/mine.json loads a level file
        if (mapLink) loadMapFromUrl(mapLink);
    });
});

// Let the engine and the network reach the menus.
bridge.send = send;
bridge.pushState = pushState;
bridge.toast = showToast;
bridge.updateHud = updateHud;
bridge.respawn = respawn;
bridge.mapChanged = refreshMapSelect;
hooks.message = handleMessage;
hooks.status = setNetStatus;
hooks.lobby = refreshLobbyUi;
hooks.toast = showToast;
hooks.count = updatePlayerCount;
