// kakeibo Firebase sync (v10 modular SDK, ES module)
// Loads/listens on /kakeibo/main and bridges to the legacy global state.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getFirestore, doc, setDoc, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDD_RI0K6-trPbLLnAnMMEv0k2DkBCCFZk',
  authDomain: 'kakeibo-f9109.firebaseapp.com',
  projectId: 'kakeibo-f9109',
  storageBucket: 'kakeibo-f9109.firebasestorage.app',
  messagingSenderId: '964252630337',
  appId: '1:964252630337:web:0b7307ac7bf4567876f5c0',
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const ref = doc(db, 'kakeibo', 'main');

// Per-device ID so we can ignore our own snapshot echoes.
const DEVICE_KEY = 'kakeibo_device_id';
let deviceId = localStorage.getItem(DEVICE_KEY);
if (!deviceId) {
  deviceId = 'dev_' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem(DEVICE_KEY, deviceId);
}

let lastPushedJSON = null;     // last payload we sent (for echo suppression)
let saveTimer      = null;
let onRemoteChange = null;     // set from app code
let bootCallback   = null;     // fires once with initial remote snapshot (or null)
let bootFired      = false;

const api = {
  deviceId,

  // Called by the app each time local state changes.
  // Debounced 500ms to coalesce rapid edits.
  save(transactions) {
    const json = JSON.stringify(transactions);
    if (json === lastPushedJSON) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        lastPushedJSON = json;
        await setDoc(ref, {
          transactions,
          updatedAt: serverTimestamp(),
          deviceId,
        });
      } catch (err) {
        console.error('[kakeibo-fb] save failed:', err);
        lastPushedJSON = null; // allow retry on next save
      }
    }, 500);
  },

  setOnRemoteChange(cb) { onRemoteChange = cb; },
  onBoot(cb) {
    if (bootFired) cb(null);
    else bootCallback = cb;
  },
};

// Subscribe to remote changes.
onSnapshot(ref, (snap) => {
  const data = snap.exists() ? snap.data() : null;

  if (!bootFired) {
    bootFired = true;
    bootCallback?.(data);
    bootCallback = null;
    // Don't also feed the same snapshot through onRemoteChange — boot handles it.
    if (data) lastPushedJSON = JSON.stringify(data.transactions || []);
    return;
  }

  if (!data) return;
  // Suppress echo: ignore snapshots whose payload matches what we just pushed.
  const json = JSON.stringify(data.transactions || []);
  if (json === lastPushedJSON) return;
  if (data.deviceId === deviceId) {
    lastPushedJSON = json;
    return;
  }
  lastPushedJSON = json;
  onRemoteChange?.(data.transactions || []);
}, (err) => {
  console.error('[kakeibo-fb] snapshot error:', err);
});

window.kakeiboFB = api;
console.log('[kakeibo-fb] initialized, device=', deviceId);
