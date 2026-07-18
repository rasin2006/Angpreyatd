#!/usr/bin/env node
/**
 * TypeBattle Server
 * Pure Node.js - no npm dependencies required
 * Implements HTTP server + raw WebSocket protocol (RFC 6455)
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./db');
const auth = require('./auth');
const students = require('./students');
const scoring = require('./scoring');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 20;
const COUNTDOWN_SECONDS = 5;
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, '..', 'photos');
const TIME_MODE_WORD_BUFFER = 400;
const DEFAULT_ROOM_SETTINGS = {
  duration: 60,
  textMode: 'word', // word | time | quote
  wordCount: 10,
  wordLang: 'en',
  quoteId: null,
  quoteLength: 'medium', // short | medium | long
};

// ─── Word Bank ────────────────────────────────────────────────────────────────
const WORD_BANK_EN = [
  "the","be","to","of","and","a","in","that","have","it","for","not","on","with",
  "he","as","you","do","at","this","but","his","by","from","they","we","say","her",
  "she","or","an","will","my","one","all","would","there","their","what","so",
  "up","out","if","about","who","get","which","go","me","when","make","can","like",
  "time","no","just","him","know","take","people","into","year","your","good",
  "some","could","them","see","other","than","then","now","look","only","come",
  "its","over","think","also","back","after","use","two","how","our","work","first",
  "well","way","even","new","want","because","any","these","give","day","most","us",
  "great","between","need","large","often","hand","high","place","hold","turn",
  "long","together","along","always","while","might","next","every","near","open",
  "seem","together","follow","around","world","still","three","small","set","put",
  "end","does","another","well","large","must","big","enough","even","state",
  "never","become","between","high","really","something","most","another","much",
  "family","own","leave","put","old","while","mean","keep","student","why","let",
  "great","same","big","group","begin","seem","country","help","talk","last",
  "move","play","small","number","off","always","should","show","change","away",
  "again","near","study","school","still","learn","plant","cover","food","sun",
  "four","between","state","keep","eye","never","last","let","thought","city",
  "tree","cross","farm","hard","start","might","story","saw","far","sea","draw",
  "left","late","run","don't","while","press","close","night","real","life",
  "few","north","open","seem","together","next","white","children","begin","got",
  "walk","example","ease","paper","often","always","music","those","both","mark",
  "book","letter","until","mile","river","car","feet","care","second","group",
  "carry","took","rain","eat","room","friend","began","idea","fish","mountain",
  "stop","once","base","hear","horse","cut","sure","watch","color","face","wood",
  "main","enough","plain","girl","usual","young","ready","above","ever","red",
  "list","though","feel","talk","bird","soon","body","dog","family","direct",
  "pose","leave","song","measure","door","product","black","short","numeral","pnuemonoultramicroscopicsilicovolcanoconiosis"
];

const WORD_BANK_KM = [
  "ខ្ញុំ","អ្នក","គាត់","យើង","ពួកគេ","នេះ","នោះ","អ្វី","ពេលណា","កន្លែងណា",
  "ហេតុអ្វី","របៀប","ល្អ","អាក្រក់","ធំ","តូច","ថ្ងៃ","យប់","ទឹក","ភ្លើង",
  "ខ្យល់","ដី","មេឃ","ព្រះអាទិត្យ","ព្រះច័ន្ទ","ផ្កាយ","សាលារៀន","ផ្ទះ","ផ្លូវ",
  "ឡាន","កង់","សៀវភៅ","ប៊ិច","ខ្មៅដៃ","កុំព្យូទ័រ","ទូរស័ព្ទ","ញ៉ាំ","ផឹក",
  "គេង","ដើរ","រត់","និយាយ","ស្តាប់","មើល","អាន","សរសេរ","រៀន","ធ្វើការ",
  "ស្រឡាញ់","ស្អប់","សប្បាយ","ខឹង","ខ្លាច","ក្តីសង្ឃឹម","មិត្ត","គ្រួសារ"
];

const WORD_BANKS = { en: WORD_BANK_EN, km: WORD_BANK_KM };

// ─── Game State ───────────────────────────────────────────────────────────────
let rooms = {}; // roomId -> Room
let roomByCode = {}; // 3-digit code -> roomId
let usedRoomCodes = new Set();
let clients = {}; // clientId -> Client
let matchQueue = []; // clientIds waiting for auto matchmaking

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

function generateRoomCode() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const code = String(100 + Math.floor(Math.random() * 900));
    if (!usedRoomCodes.has(code)) {
      usedRoomCodes.add(code);
      return code;
    }
  }
  return String(Date.now()).slice(-3);
}

function releaseRoomCode(code) {
  if (code) usedRoomCodes.delete(code);
  delete roomByCode[code];
}

function generateWords(lang = 'en', count = 60) {
  const wordBank = WORD_BANKS[lang] || WORD_BANKS.en;
  const shuffled = [...wordBank].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).join(' ');
}

async function generateRaceText(settings) {
  const lang = settings.wordLang || 'en';
  const mode = scoring.normalizeTextMode(settings.textMode);
  if (mode === 'quote') {
    if (db.isEnabled()) {
      const quote = await auth.getQuoteText(
        settings.quoteId || null,
        lang,
        settings.quoteLength || 'medium'
      );
      if (quote) return quote;
    }
    const fallbacks = {
      short: 'Practice makes perfect.',
      medium: 'The only way to do great work is to love what you do.',
      long: 'It does not matter how slowly you go as long as you do not stop. Consistent practice builds speed and accuracy over time.',
    };
    const tier = settings.quoteLength || 'medium';
    return fallbacks[tier] || fallbacks.medium;
  }
  if (mode === 'time') {
    return generateWords(lang, TIME_MODE_WORD_BUFFER);
  }
  return generateWords(lang, settings.wordCount || 60);
}

function applyModeToRoom(room, settings = {}) {
  const mode = scoring.normalizeTextMode(settings.textMode ?? room.textMode);
  room.textMode = mode;
  if (mode === 'time') {
    room.duration = Math.min(300, Math.max(15, Number(settings.duration ?? room.duration) || 60));
  } else if (mode === 'word') {
    room.wordCount = Math.min(200, Math.max(10, Number(settings.wordCount ?? room.wordCount) || 60));
  } else if (mode === 'quote') {
    const allowed = ['short', 'medium', 'long'];
    room.quoteLength = allowed.includes(settings.quoteLength) ? settings.quoteLength : (room.quoteLength || 'medium');
    if (settings.quoteId !== undefined) {
      room.quoteId = settings.quoteId ? Number(settings.quoteId) || null : null;
    }
  }
  if (mode !== 'quote') room.quoteId = null;
}

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(interfaces)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        ips.push(alias.address);
      }
    }
  }
  return ips;
}

function sanitizeStudentIdForUsername(studentId) {
  return String(studentId || '').trim().toLowerCase().replace(/\s+/g, '');
}

const COLORS = [
  '#e2b714','#ca4754','#5ba4cf','#65b663','#bf7af0',
  '#f09f55','#4ac2a8','#e06c75','#61afef','#98c379'
];

let colorIndex = 0;
function nextColor() {
  return COLORS[colorIndex++ % COLORS.length];
}

// ─── Room Management ──────────────────────────────────────────────────────────
async function createRoom(hostId, settings = {}, options = {}) {
  const roomId = generateId();
  const code = options.code || generateRoomCode();
  const merged = { ...DEFAULT_ROOM_SETTINGS, ...settings };
  const text = await generateRaceText(merged);

  rooms[roomId] = {
    id: roomId,
    code,
    hostId,
    isMatchmaking: !!options.isMatchmaking,
    wordLang: merged.wordLang,
    textMode: scoring.normalizeTextMode(merged.textMode),
    wordCount: merged.wordCount,
    quoteId: merged.quoteId || null,
    quoteLength: merged.quoteLength || 'medium',
    duration: merged.duration,
    maxPlayers: MAX_PLAYERS,
    players: [],
    text,
    state: 'waiting',
    countdown: COUNTDOWN_SECONDS,
    startTime: null,
    countdownInterval: null,
    raceInterval: null,
    timeLeft: merged.duration,
  };
  roomByCode[code] = roomId;
  return roomId;
}

function getRoomSettings(room) {
  return {
    duration: room.duration,
    textMode: scoring.normalizeTextMode(room.textMode),
    wordCount: room.wordCount,
    wordLang: room.wordLang,
    quoteId: room.quoteId || null,
    quoteLength: room.quoteLength || 'medium',
  };
}

function isTimedRace(room) {
  return scoring.normalizeTextMode(room.textMode) === 'time';
}

function isCompletionRace(room) {
  const mode = scoring.normalizeTextMode(room.textMode);
  return mode === 'word' || mode === 'quote';
}

function isRaceTextComplete(typed, text) {
  return scoring.isTextComplete(typed, text);
}

function resetRoomReady(room) {
  if (!room) return;
  for (const pid of room.players) {
    if (clients[pid]) clients[pid].ready = false;
  }
}

function allPlayersReady(room) {
  return room.players.every((pid) => {
    const c = clients[pid];
    if (!c) return false;
    if (pid === room.hostId) return true;
    return !!c.ready;
  });
}

async function refreshRoomText(roomId) {
  const room = rooms[roomId];
  if (!room || room.state !== 'waiting') return;
  room.text = await generateRaceText(getRoomSettings(room));
}

function joinRoom(clientId, roomId) {
  const room = rooms[roomId];
  if (!room) return false;
  if (room.players.length >= room.maxPlayers && !room.players.includes(clientId)) {
    return false;
  }
  if (!room.players.includes(clientId)) {
    room.players.push(clientId);
    clients[clientId].roomId = roomId;
    clients[clientId].ready = false;
    resetRoomReady(room);
  }
  return true;
}

function getRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  return {
    id: roomId,
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    text: room.text,
    countdown: room.countdown,
    timeLeft: room.timeLeft,
    settings: getRoomSettings(room),
    maxPlayers: room.maxPlayers,
    players: [...new Set(room.players)].map(pid => {
      const c = clients[pid];
      if (!c) return null;
      return {
        id: pid,
        name: c.name,
        color: c.color,
        wpm: c.wpm || 0,
        progress: c.progress || 0,
        accuracy: c.accuracy || 100,
        correctWords: c.correctWords || 0,
        score: c.score || 0,
        finished: c.finished || false,
        finishTime: c.finishTime || null,
        place: c.place || null,
        isHost: pid === room.hostId,
        ready: pid === room.hostId ? true : !!c.ready,
      };
    }).filter(Boolean),
  };
}

function broadcast(roomId, msg) {
  const room = rooms[roomId];
  if (!room) return;
  const data = JSON.stringify(msg);
  for (const pid of room.players) {
    const c = clients[pid];
    if (c && c.ws && c.ws.readyState === 1) {
      wsSend(c.ws, data);
    }
  }
}

function broadcastAll(msg) {
  const data = JSON.stringify(msg);
  for (const c of Object.values(clients)) {
    if (c.ws && c.ws.readyState === 1) {
      wsSend(c.ws, data);
    }
  }
}

function startCountdown(roomId) {
  const room = rooms[roomId];
  if (!room || room.state !== 'waiting') return;
  room.state = 'countdown';
  room.countdown = COUNTDOWN_SECONDS;
  
  broadcast(roomId, { type: 'countdown', value: room.countdown, roomState: getRoomState(roomId) });

  room.countdownInterval = setInterval(() => {
    room.countdown--;
    if (room.countdown <= 0) {
      clearInterval(room.countdownInterval);
      startRace(roomId);
    } else {
      broadcast(roomId, { type: 'countdown', value: room.countdown, roomState: getRoomState(roomId) });
    }
  }, 1000);
}

function startRace(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.state = 'racing';
  room.startTime = Date.now();
  room.timeLeft = isTimedRace(room) ? room.duration : null;
  room.finishPlace = 0;

  // reset players
  for (const pid of room.players) {
    const c = clients[pid];
    if (c) {
      c.wpm = 0;
      c.progress = 0;
      c.accuracy = 100;
      c.correctWords = 0;
      c.score = 0;
      c.lastTyped = '';
      c.finished = false;
      c.finishTime = null;
      c.place = null;
      c.ready = false;
    }
  }

  broadcast(roomId, { type: 'race_start', roomState: getRoomState(roomId) });

  if (room.raceInterval) clearInterval(room.raceInterval);
  if (isTimedRace(room)) {
    room.raceInterval = setInterval(() => {
      room.timeLeft--;
      broadcast(roomId, { type: 'tick', timeLeft: room.timeLeft, roomState: getRoomState(roomId) });
      if (room.timeLeft <= 0) {
        endRace(roomId);
      }
    }, 1000);
  }
}

function endRace(roomId) {
  const room = rooms[roomId];
  if (!room || room.state === 'finished') return;
  if (room.raceInterval) clearInterval(room.raceInterval);
  room.state = 'finished';

  scoring.assignPlacesByScore(room, clients);

  room._clientsSnapshot = {};
  for (const pid of room.players) {
    const c = clients[pid];
    if (c) {
      room._clientsSnapshot[pid] = {
        userId: c.userId || null,
        name: c.name,
        wpm: c.wpm || 0,
        accuracy: c.accuracy || 100,
        correctWords: c.correctWords || 0,
        score: c.score || 0,
        place: c.place || null,
        finishTime: c.finishTime || null,
      };
    }
  }
  try {
    console.log('Saving match results for room', room.id, 'players:', room.players.length);
    console.log('Snapshot keys:', Object.keys(room._clientsSnapshot || {}).length);
    auth.saveMatchResults(room).catch((err) => {
      console.error('Failed to save match results:', err.message);
    });
  } catch (e) {
    console.error('Error while initiating saveMatchResults:', e.message);
  }

  broadcast(roomId, { type: 'race_end', roomState: getRoomState(roomId) });
  
  // Cleanup room after 30s
  setTimeout(() => {
    if (rooms[roomId]) {
      for (const pid of rooms[roomId].players) {
        if (clients[pid]) clients[pid].roomId = null;
      }
      releaseRoomCode(rooms[roomId].code);
      delete rooms[roomId];
    }
  }, 30000);
}

async function ensurePersonalRoom(clientId) {
  const client = clients[clientId];
  if (!client) return null;
  if (client.personalRoomId && rooms[client.personalRoomId]) {
    return client.personalRoomId;
  }
  const settings = { wordLang: client.lang || 'en', ...DEFAULT_ROOM_SETTINGS };
  const roomId = await createRoom(clientId, settings);
  client.personalRoomId = roomId;
  client.hostRoomId = roomId;
  joinRoom(clientId, roomId);
  return roomId;
}

async function handleMatchmaking() {
  while (matchQueue.length >= 1) {
    const batch = matchQueue.splice(0, Math.min(MAX_PLAYERS, matchQueue.length));
    const firstClient = clients[batch[0]];
    const settings = {
      wordLang: (firstClient && firstClient.lang) || 'en',
      ...DEFAULT_ROOM_SETTINGS,
      ...(firstClient?.roomSettings || {}),
    };
    const roomId = await createRoom(batch[0], settings, { isMatchmaking: true });
    for (const cid of batch) {
      if (clients[cid]) {
        clients[cid].roomId = null;
        joinRoom(cid, roomId);
      }
    }
    broadcast(roomId, { type: 'room_joined', roomId, roomState: getRoomState(roomId) });
    // If there are 2+ players, start immediately. If 1, give them a few seconds in case others join.
    const countdownDelay = batch.length >= 2 ? 1000 : 5000;
    setTimeout(() => {
      if (rooms[roomId] && rooms[roomId].state === 'waiting') {
        startCountdown(roomId);
      }
    }, countdownDelay);
  }
}

// ─── Raw WebSocket Implementation ─────────────────────────────────────────────
function wsHandshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
}

function wsParseFrame(buffer) {
  if (buffer.length < 2) return null;
  
  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const opcode = firstByte & 0x0f;
  const isMasked = !!(secondByte & 0x80);
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  if (isMasked) {
    if (buffer.length < offset + 4 + payloadLength) return null;
    const mask = buffer.slice(offset, offset + 4);
    offset += 4;
    const payload = buffer.slice(offset, offset + payloadLength);
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
    return { opcode, payload, totalLength: offset + payloadLength };
  } else {
    if (buffer.length < offset + payloadLength) return null;
    return { opcode, payload: buffer.slice(offset, offset + payloadLength), totalLength: offset + payloadLength };
  }
}

function wsCreateFrame(data) {
  const payload = Buffer.from(data, 'utf8');
  const len = payload.length;
  let header;
  
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x81; // FIN + text
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function wsSend(ws, data) {
  try {
    if (ws.socket && !ws.socket.destroyed) {
      ws.socket.write(wsCreateFrame(data));
    }
  } catch(e) {}
}

// ─── Message Handler ──────────────────────────────────────────────────────────
function handleMessage(clientId, msg) {
  let parsed;
  try { parsed = JSON.parse(msg); } catch { return; }
  
  const { type } = parsed;
  const client = clients[clientId];
  if (!client) return;

  switch (type) {
    case 'authenticate': {
      auth.getUserByToken(parsed.token).then((user) => {
        if (!user) {
          wsSend(client.ws, JSON.stringify({ type: 'auth_fail', error: 'Invalid or expired session' }));
          return;
        }
        client.userId = user.id;
        client.name = user.display_name;
        wsSend(client.ws, JSON.stringify({ type: 'auth_ok', user }));
      }).catch(() => {
        wsSend(client.ws, JSON.stringify({ type: 'auth_fail', error: 'Authentication failed' }));
      });
      break;
    }

    case 'set_name': {
      if (parsed.guest) {
        client.userId = null;
        client.name = (parsed.name || 'Anonymous').slice(0, 20).trim() || 'Anonymous';
      } else if (client.userId && client.name) {
        // Logged-in user keeps account display name
      } else {
        client.name = (parsed.name || 'Anonymous').slice(0, 20).trim() || 'Anonymous';
      }
      if (parsed.lang) client.lang = parsed.lang;
      // Send lobby/player list update
      const lobbyPlayers = Object.values(clients)
        .filter(c => !c.roomId)
        .map(c => ({ id: c.id, name: c.name, color: c.color }));
      wsSend(client.ws, JSON.stringify({ type: 'lobby_update', players: lobbyPlayers, yourId: clientId }));
      break;
    }
    
    case 'join_lobby': {
      if (!client.name) client.name = 'Anonymous';
      matchQueue = matchQueue.filter(id => id !== clientId);
      if (client._matchTimeout) {
        clearTimeout(client._matchTimeout);
        client._matchTimeout = null;
      }

      ensurePersonalRoom(clientId).then((roomId) => {
        const room = rooms[roomId];
        const lobbyPlayers = Object.values(clients)
          .filter(c => c.personalRoomId && rooms[c.personalRoomId])
          .map(c => ({
            id: c.id,
            name: c.name,
            color: c.color,
            roomCode: rooms[c.personalRoomId]?.code,
          }));

        wsSend(client.ws, JSON.stringify({
          type: 'lobby_info',
          roomCode: room?.code,
          roomState: getRoomState(roomId),
          players: lobbyPlayers,
          yourId: clientId,
        }));
        broadcastAll({ type: 'lobby_update', players: lobbyPlayers });
      });
      break;
    }

    case 'update_room_settings': {
      const room = client.roomId ? rooms[client.roomId] : null;
      if (!room || room.hostId !== clientId || room.state !== 'waiting') {
        wsSend(client.ws, JSON.stringify({ type: 'error', error: 'Only the host can change settings before the race' }));
        break;
      }
      const allowed = ['duration', 'textMode', 'wordCount', 'wordLang', 'quoteId', 'quoteLength'];
      for (const key of allowed) {
        if (parsed[key] !== undefined) room[key] = parsed[key];
      }
      if (parsed.duration) room.duration = Math.min(300, Math.max(15, Number(parsed.duration) || 60));
      if (parsed.wordCount) room.wordCount = Math.min(200, Math.max(10, Number(parsed.wordCount) || 60));
      if (parsed.textMode) room.textMode = scoring.normalizeTextMode(parsed.textMode);
      if (parsed.wordLang) room.wordLang = parsed.wordLang;
      if (parsed.quoteLength) {
        const tiers = ['short', 'medium', 'long'];
        if (tiers.includes(parsed.quoteLength)) room.quoteLength = parsed.quoteLength;
      }
      if (parsed.quoteId !== undefined) {
        room.quoteId = parsed.quoteId ? Number(parsed.quoteId) || null : null;
      }
      applyModeToRoom(room, parsed);
      client.roomSettings = getRoomSettings(room);
      resetRoomReady(room);
      refreshRoomText(client.roomId).then(() => {
        broadcast(client.roomId, {
          type: 'room_settings',
          settings: getRoomSettings(room),
          roomState: getRoomState(client.roomId),
        });
      });
      break;
    }

    case 'toggle_ready': {
      const room = client.roomId ? rooms[client.roomId] : null;
      if (!room || room.state !== 'waiting') break;
      if (room.hostId === clientId) break;
      client.ready = !client.ready;
      broadcast(client.roomId, { type: 'room_state', roomState: getRoomState(client.roomId) });
      break;
    }

    case 'start_room': {
      const room = client.roomId ? rooms[client.roomId] : null;
      if (!room || room.hostId !== clientId) {
        wsSend(client.ws, JSON.stringify({ type: 'error', error: 'Only the host can start the race' }));
        break;
      }
      if (room.state !== 'waiting') break;
      if (room.players.length < 2) {
        wsSend(client.ws, JSON.stringify({ type: 'error', error: 'Need at least 2 players to start' }));
        break;
      }
      if (!allPlayersReady(room)) {
        wsSend(client.ws, JSON.stringify({ type: 'error', error: 'Not all players are ready' }));
        break;
      }
      if (room._soloWait) clearTimeout(room._soloWait);
      startCountdown(client.roomId);
      break;
    }

    case 'join_room_by_code': {
      const code = String(parsed.code || '').trim();
      const targetRoomId = roomByCode[code];
      if (!targetRoomId || !rooms[targetRoomId]) {
        wsSend(client.ws, JSON.stringify({ type: 'error', error: 'Room not found' }));
        break;
      }
      const targetRoom = rooms[targetRoomId];
      if (targetRoom.state !== 'waiting') {
        wsSend(client.ws, JSON.stringify({ type: 'error', error: 'That room has already started' }));
        break;
      }
      if (targetRoom.players.length >= targetRoom.maxPlayers) {
        wsSend(client.ws, JSON.stringify({ type: 'error', error: 'Room is full (max 20 players)' }));
        break;
      }
      if (client.roomId && client.roomId !== targetRoomId) {
        leaveRoom(clientId);
      }
      joinRoom(clientId, targetRoomId);
      broadcast(targetRoomId, {
        type: 'room_joined',
        roomId: targetRoomId,
        roomState: getRoomState(targetRoomId),
      });
      wsSend(client.ws, JSON.stringify({
        type: 'room_joined',
        roomId: targetRoomId,
        roomState: getRoomState(targetRoomId),
      }));
      break;
    }

    case 'start_match': {
      matchQueue = matchQueue.filter(id => id !== clientId);
      handleMatchmaking();
      break;
    }

    case 'find_match': {
      if (client.roomId) leaveRoom(clientId);
      if (!matchQueue.includes(clientId)) matchQueue.push(clientId);
      if (matchQueue.length >= 2) {
        handleMatchmaking();
      } else {
        client._matchTimeout = setTimeout(() => {
          if (matchQueue.includes(clientId)) handleMatchmaking();
        }, 10000);
        wsSend(client.ws, JSON.stringify({ type: 'searching' }));
      }
      break;
    }

    case 'solo_practice': {
      matchQueue = matchQueue.filter(id => id !== clientId);
      if (client._matchTimeout) clearTimeout(client._matchTimeout);
      ensurePersonalRoom(clientId).then(async (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        room.players = [clientId];
        clients[clientId].roomId = roomId;
        room.hostId = clientId;
        room.state = 'waiting';
        resetRoomReady(room);
        if (parsed.settings) {
          const s = parsed.settings;
          if (s.duration) room.duration = Math.min(300, Math.max(15, Number(s.duration) || 60));
          if (s.wordCount) room.wordCount = Math.min(200, Math.max(10, Number(s.wordCount) || 60));
          if (s.textMode) room.textMode = scoring.normalizeTextMode(s.textMode);
          if (s.wordLang) room.wordLang = s.wordLang;
          if (s.quoteLength) room.quoteLength = s.quoteLength;
          if (s.quoteId !== undefined) room.quoteId = s.quoteId ? Number(s.quoteId) || null : null;
          applyModeToRoom(room, s);
        }
        room.text = await generateRaceText(getRoomSettings(room));
        wsSend(client.ws, JSON.stringify({
          type: 'room_joined',
          roomId,
          roomState: getRoomState(roomId),
        }));
        setTimeout(() => {
          if (rooms[roomId] && rooms[roomId].state === 'waiting') {
            startCountdown(roomId);
          }
        }, 500);
      });
      break;
    }

    case 'typing_update': {
      const roomId = client.roomId;
      const room = rooms[roomId];
      if (!room || room.state !== 'racing') return;
      
      const { typed, wpm, accuracy, correctWords } = parsed;
      client.wpm = wpm || 0;
      client.accuracy = accuracy || 100;
      client.lastTyped = typed || '';
      client.correctWords = correctWords ?? scoring.countCorrectWords(typed, room.text);
      const totalWords = scoring.countTotalWords(room.text);
      client.score = scoring.calcTypingScore(
        client.wpm,
        client.accuracy,
        client.correctWords,
        totalWords,
        client.lastTyped || ''
      );
      
      // Calculate progress
      const textLen = room.text.length;
      const typedLen = Math.min(typed ? typed.length : 0, textLen);
      client.progress = Math.round((typedLen / textLen) * 100);
      
      // Check finish — word/quote modes only; last word correct is enough
      if (isCompletionRace(room) && typed && isRaceTextComplete(typed, room.text) && !client.finished) {
        client.finished = true;
        client.progress = 100;
        client.finishTime = (Date.now() - room.startTime) / 1000;
        
        broadcast(roomId, {
          type: 'player_finished',
          playerId: clientId,
          wpm: client.wpm,
          score: client.score,
          roomState: getRoomState(roomId),
        });
        
        const allFinished = room.players.every(pid => clients[pid] && clients[pid].finished);
        if (allFinished) endRace(roomId);
      } else {
        broadcast(roomId, {
          type: 'player_update',
          playerId: clientId,
          wpm: client.wpm,
          progress: client.progress,
          accuracy: client.accuracy,
          score: client.score,
          correctWords: client.correctWords,
        });
      }
      break;
    }
    
    case 'request_room_state': {
      const rid = client.roomId;
      if (rid) {
        wsSend(client.ws, JSON.stringify({ type: 'room_state', roomState: getRoomState(rid) }));
      }
      break;
    }

    case 'request_action': {
      const { name, token } = parsed;
      if (name === 'logout') {
        if (db.isEnabled() && token) {
          auth.logoutUser(token).catch(err => console.error('Logout error:', err.message));
        }
        client.userId = null;
        client.name = 'Anonymous';
        leaveRoom(clientId, { returnToPersonal: true });
        ensurePersonalRoom(clientId).then((roomId) => {
          wsSend(client.ws, JSON.stringify({ type: 'logged_out', roomState: getRoomState(roomId) }));
        });
      } else if (name === 'show_leaderboard') {
        if (db.isEnabled()) {
          auth.getLeaderboard().then(leaderboard => {
            wsSend(client.ws, JSON.stringify({ type: 'leaderboard_data', leaderboard }));
          }).catch(err => console.error('Leaderboard fetch error:', err.message));
        }
      }
      break;
    }

    case 'leave_room': {
      leaveRoom(clientId, { returnToPersonal: true });
      ensurePersonalRoom(clientId).then((roomId) => {
        wsSend(client.ws, JSON.stringify({
          type: 'lobby_info',
          roomCode: rooms[roomId]?.code,
          roomState: getRoomState(roomId),
          yourId: clientId,
        }));
      });
      break;
    }
  }
}

function leaveRoom(clientId, options = {}) {
  const client = clients[clientId];
  if (!client) return;
  matchQueue = matchQueue.filter(id => id !== clientId);
  if (client._matchTimeout) {
    clearTimeout(client._matchTimeout);
    client._matchTimeout = null;
  }

  if (client.roomId) {
    const roomId = client.roomId;
    const room = rooms[roomId];
    const isPersonal = client.personalRoomId === roomId;

    if (room) {
      room.players = room.players.filter(id => id !== clientId);
      broadcast(roomId, { type: 'player_left', playerId: clientId, roomState: getRoomState(roomId) });

      if (room.players.length === 0 && !isPersonal) {
        if (room.countdownInterval) clearInterval(room.countdownInterval);
        if (room.raceInterval) clearInterval(room.raceInterval);
        releaseRoomCode(room.code);
        delete rooms[roomId];
      } else if (room.state === 'racing') {
        const allFinished = room.players.every(pid => clients[pid] && clients[pid].finished);
        if (allFinished) endRace(roomId);
      } else if (room.hostId === clientId && room.players.length > 0) {
        room.hostId = room.players[0];
        broadcast(roomId, { type: 'room_settings', settings: getRoomSettings(room), roomState: getRoomState(roomId) });
      }
    }

    client.roomId = null;

    if (options.returnToPersonal && client.personalRoomId && rooms[client.personalRoomId]) {
      joinRoom(clientId, client.personalRoomId);
    }
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

async function handleApiRequest(req, res) {
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/api/health') {
    const dbOk = db.isEnabled() ? await db.initDb().catch(() => false) : null;
    return sendJson(res, 200, {
      status: 'ok',
      database: dbOk === null ? 'disabled' : (dbOk ? 'connected' : 'disconnected'),
      db_enabled: db.isEnabled(),
    });
  }

  if (req.method === 'GET' && url === '/api/profiles/search') {
    const q = new URL(req.url, 'http://localhost').searchParams.get('q') || '';
    const profiles = db.isEnabled()
      ? await auth.searchProfilesWithAccounts(q)
      : students.searchProfiles(q).map((p) => ({ ...p, has_account: false }));
    return sendJson(res, 200, { ok: true, profiles });
  }

  try {
    if (req.method === 'POST' && url === '/api/auth/profile-login') {
      const body = await readJsonBody(req);
      const result = await auth.profileLogin(body);
      return sendJson(res, result.ok ? 200 : 401, result);
    }

    if (req.method === 'GET' && url === '/api/auth/me') {
      const token = getBearerToken(req);
      const user = await auth.getUserByToken(token);
      if (!user) return sendJson(res, 401, { ok: false, error: 'Not authenticated' });
      const stats = await auth.getUserStats(user.id);
      return sendJson(res, 200, { ok: true, user, stats });
    }

    if (req.method === 'POST' && url === '/api/auth/logout') {
      const token = getBearerToken(req);
      await auth.logoutUser(token);
      return sendJson(res, 200, { ok: true });
    }

    if (!db.isEnabled()) {
      return sendJson(res, 503, { ok: false, error: 'Database not configured' });
    }

    if (req.method === 'POST' && url === '/api/auth/change-password') {
      const token = getBearerToken(req);
      const user = await auth.getUserByToken(token);
      if (!user) return sendJson(res, 401, { ok: false, error: 'Not authenticated' });
      const body = await readJsonBody(req);
      const result = await auth.changePassword(user.id, body);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (req.method === 'GET' && url === '/api/quotes/search') {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const id = params.get('id');
      const lang = params.get('lang') || 'en';
      const quotes = await auth.searchQuotes({ id, lang });
      return sendJson(res, 200, { ok: true, quotes });
    }

    if (req.method === 'GET' && url === '/api/quotes') {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const lang = params.get('lang') || 'en';
      const quotes = await auth.getQuotes(lang);
      return sendJson(res, 200, { ok: true, quotes });
    }

    if (req.method === 'POST' && url === '/api/quotes') {
      const token = getBearerToken(req);
      const user = await auth.getUserByToken(token);
      if (!user) return sendJson(res, 401, { ok: false, error: 'Login required to add quotes' });
      const body = await readJsonBody(req);
      const result = await auth.addQuote(user.id, body);
      return sendJson(res, result.ok ? 201 : 400, result);
    }

    if (req.method === 'POST' && url === '/api/auth/register') {
      const body = await readJsonBody(req);
      const result = await auth.registerUser(body);
      return sendJson(res, result.ok ? 201 : 400, result);
    }

    if (req.method === 'POST' && url === '/api/auth/login') {
      const body = await readJsonBody(req);
      const result = await auth.loginUser(body);
      return sendJson(res, result.ok ? 200 : 401, result);
    }

    if (req.method === 'POST' && url === '/api/auth/logout') {
      const token = getBearerToken(req);
      await auth.logoutUser(token);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url === '/api/auth/me') {
      const token = getBearerToken(req);
      const user = await auth.getUserByToken(token);
      if (!user) return sendJson(res, 401, { ok: false, error: 'Not authenticated' });
      const stats = await auth.getUserStats(user.id);
      return sendJson(res, 200, { ok: true, user, stats });
    }

    if (req.method === 'GET' && url === '/api/leaderboard') {
      if (!db.isEnabled()) return sendJson(res, 503, { ok: false, error: 'Database not configured' });
      // Fetch a larger set and dedupe by display name (keep highest wpm)
      const rows = await auth.getLeaderboard(100);
      const studentsList = students.loadStudents();
      const byName = new Map();
      for (const r of rows) {
        const key = String(r.name || '').trim() || ('guest_' + (r.username || '')).toLowerCase();
        const existing = byName.get(key);
        if (!existing || (r.best_wpm || 0) > (existing.best_wpm || 0)) {
          // attempt to attach photo by matching username -> student_id -> photo
          let photo = null;
          try {
            const uname = String(r.username || '').trim().toLowerCase();
            if (uname) {
              const found = studentsList.find(s => (String(s.student_id || '').toLowerCase().replace(/\s+/g,'') === uname) || (sanitizeStudentIdForUsername(s.student_id) === uname));
              if (found && found.photo) photo = `/photos/${found.photo}`;
            }
          } catch (e) {}
          byName.set(key, { ...r, photo });
        }
        if (byName.size >= 20) break;
      }
      const leaderboard = Array.from(byName.values()).slice(0, 20).map((r, i) => ({
        place: i + 1,
        name: r.name,
        username: r.username || null,
        best_wpm: r.best_wpm,
        races: r.races,
        photo: r.photo || null,
      }));
      return sendJson(res, 200, { ok: true, leaderboard });
    }
  } catch (err) {
    console.error('API error:', err.message);
    return sendJson(res, 500, { ok: false, error: 'Internal server error' });
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
}

// ─── HTTP Server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    return handleApiRequest(req, res);
  }

  const url = req.url === '/' ? '/index.html' : req.url.split('?')[0];

  if (url.startsWith('/photos/')) {
    const photoName = path.basename(url.slice('/photos/'.length));
    const photoPath = path.join(PHOTOS_DIR, photoName);
    if (!photoPath.startsWith(PHOTOS_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    return fs.readFile(photoPath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const ext = path.extname(photoName).toLowerCase();
      const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }

  let filePath;
  if (url === '/scoring.js') {
    filePath = path.join(__dirname, 'scoring.js');
  } else if (url === '/locales/en.json' || url === '/locales/km.json') {
    filePath = path.join(__dirname, path.basename(url));
  } else {
    filePath = path.join(__dirname, 'public', url);
  }
  
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
  };
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

// ─── WebSocket Upgrade ────────────────────────────────────────────────────────
server.on('upgrade', (req, socket, head) => {
  if (req.headers.upgrade !== 'websocket') {
    socket.destroy();
    return;
  }
  
  wsHandshake(req, socket);
  
  const clientId = generateId();
  const ws = { socket, readyState: 1 };
  
  clients[clientId] = {
    id: clientId,
    ws,
    name: null,
    userId: null,
    lang: 'en',
    color: nextColor(),
    roomId: null,
    personalRoomId: null,
    hostRoomId: null,
    roomSettings: { ...DEFAULT_ROOM_SETTINGS },
    wpm: 0,
    progress: 0,
    accuracy: 100,
    correctWords: 0,
    score: 0,
    lastTyped: '',
    finished: false,
    ready: false,
  };
  
  // Send welcome
  wsSend(ws, JSON.stringify({ type: 'welcome', clientId, color: clients[clientId].color }));
  
  let buffer = Buffer.alloc(0);
  
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    
    while (buffer.length >= 2) {
      const frame = wsParseFrame(buffer);
      if (!frame) break;
      buffer = buffer.slice(frame.totalLength);
      
      if (frame.opcode === 0x08) {
        // Close frame
        leaveRoom(clientId);
        delete clients[clientId];
        socket.destroy();
        return;
      } else if (frame.opcode === 0x09) {
        // Ping -> Pong
        const pong = Buffer.from([0x8a, 0x00]);
        socket.write(pong);
      } else if (frame.opcode === 0x01 || frame.opcode === 0x02) {
        // Text or binary
        handleMessage(clientId, frame.payload.toString('utf8'));
      }
    }
  });
  
  socket.on('close', () => {
    leaveRoom(clientId);
    delete clients[clientId];
  });
  
  socket.on('error', () => {
    leaveRoom(clientId);
    delete clients[clientId];
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

server.listen(PORT, '0.0.0.0', async () => {
  await db.initDb();
  const ips = getLocalIPs();
  console.log('\n🎮 TypeBattle Server Running!\n');
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of ips) {
    console.log(`  Network: http://${ip}:${PORT}  ← Share this with friends!`);
  }
  console.log('\nOpen in multiple browser tabs or share the Network URL\n');
});
