// ONLINE: networking (MQTT relay, WebRTC mesh, other tabs), lobby discovery, and player snapshots.
import { G, local, view, makeRunner, roomKey, playerName, MODES, isPlatformer, mapKey, overdueSnapshot } from './engine.js';

// ===========================================================================
// NETWORK TRANSPORTS & LOBBIES
// ===========================================================================
// Client-side networking (works on GitHub Pages, no server of our own):
//   * MQTT over WebSocket on public brokers  - cross-device relay + lobby discovery
//   * PeerJS WebRTC mesh                     - direct connections, first peer in a room hosts
//   * BroadcastChannel                       - other tabs on the same browser
// A "room" here is always the mode+name key (see roomKey in state.js).

// Public brokers, tried in this order. Everyone uses the same order so players land on the same one.
const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
];
const LOBBY_TOPIC = 'ucas/canvas/ui-tag/v4/lobbies';
const PEER_CONFIG = {
    debug: 0,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] },
};
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('canvas_ui_tag_p2p_v4') : null;

/** Callbacks set by game.js */
export const hooks = {
    message: () => {},
    lobby: () => {},
    toast: () => {},  // (text) a player joined
    count: () => {},  // roster size changed
    status: () => {}, // (state: 'connecting' | 'online' | 'idle', title)
};

// ---------------------------------------------------------------------------
// MQTT relay
// ---------------------------------------------------------------------------
let mqttClient = null;
let mqttReady = false;
let roomTopic = '';
let brokerIndex = 0;

function stopRelay() {
    if (mqttClient) { try { mqttClient.end(true); } catch (e) {} }
    mqttClient = null;
    mqttReady = false;
}

function startRelay() {
    stopRelay();
    if (typeof mqtt === 'undefined') return;
    roomTopic = `ucas/canvas/ui-tag/v4/room/${roomKey()}`;
    hooks.status('connecting', 'Connecting cross-device relay...');
    try {
        const client = mqtt.connect(BROKERS[brokerIndex % BROKERS.length], {
            clientId: `ucas_${G.playerId}_${Math.floor(Math.random() * 10000)}`,
            clean: true,
            connectTimeout: 5000,
            reconnectPeriod: 3000,
        });
        mqttClient = client;
        client.on('connect', () => {
            mqttReady = true;
            hooks.status('online', `Connected (${G.room})`);
            client.subscribe([roomTopic, LOBBY_TOPIC], { qos: 0 });
            hooks.message({ type: '_connected' });
        });
        client.on('message', (topic, buf) => {
            try {
                const msg = JSON.parse(buf.toString());
                if (topic === LOBBY_TOPIC) handleLobbyPulse(msg);
                else if (topic === roomTopic) dispatch(msg);
            } catch (e) {}
        });
        // If a broker never accepts us, move on to the next one instead of retrying it forever.
        let connectedOnce = false;
        let failures = 0;
        client.on('connect', () => { connectedOnce = true; });
        client.on('error', () => { mqttReady = false; });
        client.on('close', () => {
            mqttReady = false;
            if (client !== mqttClient || connectedOnce || ++failures < 2) return;
            brokerIndex++;
            startRelay();
        });
    } catch (err) {
        console.warn('MQTT relay unavailable:', err);
    }
}

function publish(msg, topic = roomTopic) {
    if (!mqttClient || !mqttReady || !topic) return;
    try { mqttClient.publish(topic, JSON.stringify(msg), { qos: 0 }); } catch (e) {}
}

// ---------------------------------------------------------------------------
// WebRTC mesh
// ---------------------------------------------------------------------------
let peer = null;
let isHost = false;
const conns = new Map();

function stopMesh() {
    for (const c of conns.values()) { try { c.close(); } catch (e) {} }
    conns.clear();
    isHost = false;
    if (peer) { try { peer.destroy(); } catch (e) {} }
    peer = null;
}

function sendToPeers(msg, exceptPeerId = null) {
    for (const [id, c] of conns) {
        if (id !== exceptPeerId && c && c.open) { try { c.send(msg); } catch (e) {} }
    }
}

function wireConnection(conn) {
    if (!conn) return;
    conn.on('open', () => {
        conns.set(conn.peer, conn);
        hooks.status('online', `Connected (${G.room})`);
        hooks.message({ type: '_connected' });
        if (isHost) {
            const peers = [...conns.keys()];
            conn.send({ type: 'peer-list', peers });
            sendToPeers({ type: 'peer-list', peers });
        }
    });
    conn.on('data', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'peer-list' && Array.isArray(msg.peers)) {
            for (const id of msg.peers) {
                if (id && peer && id !== peer.id && !conns.has(id)) wireConnection(peer.connect(id, { reliable: false }));
            }
            return;
        }
        dispatch(msg);
        if (isHost) sendToPeers(msg, conn.peer); // host relays between clients
    });
    const onClose = () => conns.delete(conn.peer);
    conn.on('close', onClose);
    conn.on('error', onClose);
}

function startMesh() {
    stopMesh();
    if (typeof Peer === 'undefined') return;
    const hostId = `ucas-canvas-tag4-host-${roomKey()}`;
    const candidate = new Peer(hostId, PEER_CONFIG);
    peer = candidate;
    candidate.on('open', () => { isHost = true; });
    candidate.on('connection', wireConnection);
    candidate.on('error', (err) => {
        if (!err || err.type !== 'unavailable-id') return;
        try { candidate.destroy(); } catch (e) {}
        isHost = false;
        const client = new Peer(undefined, PEER_CONFIG);
        peer = client;
        client.on('open', () => wireConnection(client.connect(hostId, { reliable: false })));
        client.on('connection', wireConnection);
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function dispatch(msg) {
    if (msg && typeof msg === 'object') hooks.message(msg);
}

/** Connect to the current room (G.mode + G.room). */
export function joinRoom() {
    startRelay();
    startMesh();
}

export function leaveRoom() {
    send({ type: 'leave', id: G.playerId, room: roomKey() });
    stopRelay();
    stopMesh();
}

/** Send to everyone in the current room, over every transport. */
export function send(msg) {
    if (channel) channel.postMessage(msg);
    publish(msg);
    sendToPeers(msg);
}

if (channel) {
    channel.onmessage = (e) => {
        if (e.data && e.data.type === 'lobby-pulse') handleLobbyPulse(e.data);
        else dispatch(e.data);
    };
}

// ---------------------------------------------------------------------------
// Lobby discovery: who is in which room, across devices
// ---------------------------------------------------------------------------
const lobbies = new Map(); // key -> { key, room, mode, players: Map(id -> {name, color, updatedAt}) }
const DEFAULT_ROOMS = [['tag', 'UCAS-1'], ['infection', 'UCAS-1'], ['freeze', 'UCAS-1'], ['potato', 'UCAS-1'], ['overdue', 'UCAS-1'], ['platformer', 'UCAS-1']];

function ensureLobby(mode, room) {
    const key = `${mode}-${room}`.toLowerCase();
    if (!lobbies.has(key)) lobbies.set(key, { key, room, mode, players: new Map() });
    return lobbies.get(key);
}

function handleLobbyPulse(msg) {
    if (!msg || msg.type !== 'lobby-pulse' || !msg.room || !msg.playerId) return;
    ensureLobby(MODES[msg.mode] ? msg.mode : 'tag', String(msg.room).toUpperCase()).players.set(msg.playerId, {
        name: msg.playerName || 'Runner',
        color: msg.bodyColor || '#2563eb',
        updatedAt: Date.now(),
    });
    hooks.lobby();
}

/** Announce ourselves to the lobby browser (also counts us locally). */
export function publishPresence(playerName, bodyColor) {
    const pulse = {
        type: 'lobby-pulse', room: G.room, mode: G.mode,
        playerId: G.playerId, playerName, bodyColor, updatedAt: Date.now(),
    };
    handleLobbyPulse(pulse);
    publish(pulse, LOBBY_TOPIC);
    if (channel) channel.postMessage(pulse);
}

/** Drop stale players/rooms and return the rooms to display (current room first). */
export function getLobbies() {
    const now = Date.now();
    DEFAULT_ROOMS.forEach(([m, r]) => ensureLobby(m, r));
    ensureLobby(G.mode, G.room);
    for (const [key, lobby] of lobbies) {
        for (const [id, p] of lobby.players) if (now - p.updatedAt > 9000) lobby.players.delete(id);
        const keep = DEFAULT_ROOMS.some(([m, r]) => `${m}-${r}`.toLowerCase() === key) || key === roomKey();
        if (!lobby.players.size && !keep) lobbies.delete(key);
    }
    return [...lobbies.values()].sort((a, b) =>
        (b.key === roomKey()) - (a.key === roomKey()) || b.players.size - a.players.size);
}

// ===========================================================================
// PLAYER SNAPSHOTS
// ===========================================================================
// Turning our runner into network snapshots, and remote snapshots into smooth puppets.

const STALE_MS = 12000;

// Positions are shared in the game's design space (see `view` in engine.js): x as a fraction of the
// width, y as the height of the feet above the bottom of the screen. That keeps everyone's speed and
// floor level identical whatever their window size or browser zoom.
const toShared = (x, y) => ({ nx: +(x / view.w).toFixed(4), by: +(view.h - y).toFixed(1) });
const fromShared = (nx, by) => ({ x: (nx ?? 0.3) * view.w, y: view.h - (by ?? 20) });

export function buildPayload() {
    const g = local.grapple;
    const pos = toShared(local.x, local.y + local.h);
    const anchor = g.active ? toShared(g.ax, g.ay) : { nx: 0, by: 0 };
    return {
        id: G.playerId,
        room: roomKey(),
        map: isPlatformer() ? mapKey() : '', // Platformer: you only see players who are on the same level
        nx: pos.nx,
        by: pos.by,
        vx: Math.round(local.vx),
        vy: Math.round(local.vy),
        facing: local.facing,
        grounded: local.grounded,
        isIt: local.isIt,
        itChangedAt: local.itChangedAt,
        tagsScored: local.tagsScored,
        frozen: local.frozen,
        out: local.out,
        bodyColor: local.bodyColor,
        scarfColor: local.scarfColor,
        hatColor: local.hatColor,
        label: playerName(),
        grappleActive: g.active,
        gax: anchor.nx,
        gby: anchor.by,
        od: overdueSnapshot(), // Overdue host only: the floor, the dots and the round
        updatedAt: Date.now(),
    };
}

export const pushState = () => G.active && send({ type: 'state', payload: buildPayload() });

/** Fields copied straight from a snapshot onto a remote runner. */
function copyFields(rp, d) {
    Object.assign(rp, {
        vx: d.vx || 0,
        vy: d.vy || 0,
        facing: d.facing || 1,
        grounded: !!d.grounded,
        isIt: !!d.isIt,
        itSince: d.isIt && !rp.isIt ? G.clock : rp.itSince, // when we first saw them become IT (for the fuse display)
        itChangedAt: d.itChangedAt || 0,
        tagsScored: d.tagsScored || 0,
        frozen: !!d.frozen,
        frozenAt: d.frozen ? (rp.frozenAt || Date.now()) : 0,
        out: !!d.out,
        bodyColor: d.bodyColor || rp.bodyColor,
        scarfColor: d.scarfColor || rp.scarfColor,
        hatColor: d.hatColor || rp.hatColor,
        label: d.label || rp.label,
        od: d.od && typeof d.od === 'object' ? d.od : null,
        odAt: d.updatedAt || 0,
        lastSeen: Date.now(),
    });
    const a = fromShared(d.gax, d.gby);
    rp.grapple.active = !!d.grappleActive;
    rp.grapple.ax = a.x;
    rp.grapple.ay = a.y;
}

/** Returns true if this snapshot created a new remote player. */
export function applyPayload(d) {
    if (!d || d.id === G.playerId || d.room !== roomKey()) return false;
    if (isPlatformer() && d.map !== mapKey()) { // they are on a different level: not part of this one
        if (G.remotes.delete(d.id)) hooks.count();
        return false;
    }
    if (Date.now() - (d.updatedAt || 0) > STALE_MS) {
        G.remotes.delete(d.id);
        return false;
    }
    const feet = fromShared(d.nx, d.by);
    let rp = G.remotes.get(d.id);
    const isNew = !rp;
    if (isNew) {
        rp = makeRunner(d.id, { label: d.label || 'Runner', bodyColor: '#e11d48', scarfColor: '#fb7185', hatColor: '#be123c' });
        G.remotes.set(d.id, rp);
        hooks.toast(`${rp.label} joined ${G.room}!`);
    }
    const y = Math.max(0, feet.y - rp.h);
    if (isNew) { rp.x = feet.x; rp.y = y; }
    copyFields(rp, d);
    rp.targetX = feet.x;
    rp.targetY = y;
    hooks.count();
    return isNew;
}

/** Smooth remote players toward their latest snapshot and drop the ones that went quiet. */
export function stepRemotes(dt) {
    const now = Date.now();
    for (const [id, rp] of G.remotes) {
        if (now - rp.lastSeen > STALE_MS) {
            G.remotes.delete(id);
            hooks.count();
            continue;
        }
        rp.targetX += rp.vx * dt * 0.35;
        rp.targetY += rp.vy * dt * 0.35;
        const k = Math.min(1, dt * 16);
        rp.x += (rp.targetX - rp.x) * k;
        rp.y += (rp.targetY - rp.y) * k;
        rp.walkCycle = rp.grounded && Math.abs(rp.vx) > 15 ? rp.walkCycle + Math.abs(rp.vx) * dt * 0.14 : 0;
    }
}
