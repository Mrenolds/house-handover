// Offline photo queue: photos are compressed, kept in IndexedDB on the phone,
// and uploaded to Firebase Storage when there is signal.
import { ref, uploadBytes } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
import { collection, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { auth, db, storage } from "./common.js";

const DB_NAME = "handover-photos";
let dbp;
function idb() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("queue", { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction("queue", mode);
    const out = fn(t.objectStore("queue"));
    t.oncomplete = () => res(out && "result" in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
  });
}

export async function compress(file, maxPx = 1600, quality = 0.75) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/jpeg", quality));
}

const listeners = new Set();
export function onQueueChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
async function notify() { const n = await pendingCount(); listeners.forEach((f) => f(n)); }

export async function queuePhoto({ sid, itemId = "", addendumId = "", file, source, byName }) {
  const blob = await compress(file);
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await tx("readwrite", (s) => s.put({
    id, sid, itemId, addendumId, blob, source, byName,
    takenAt: file.lastModified || Date.now(),
    uid: auth.currentUser?.uid,
  }));
  notify();
  processQueue();
  return { id, url: URL.createObjectURL(blob) };
}

export async function pendingCount() {
  return tx("readonly", (s) => s.count());
}

export async function localPhotos(sid) {
  const all = await tx("readonly", (s) => s.getAll());
  return all.filter((p) => p.sid === sid);
}

let running = false;
export async function processQueue() {
  if (running || !navigator.onLine || !auth.currentUser) return;
  running = true;
  try {
    const all = await tx("readonly", (s) => s.getAll());
    for (const p of all) {
      if (p.uid !== auth.currentUser.uid) continue; // queued under an old session
      const path = `photos/${p.sid}/${p.uid}_${p.id}.jpg`;
      try {
        await uploadBytes(ref(storage, path), p.blob, { contentType: "image/jpeg" });
      } catch (e) {
        // Already uploaded earlier (overwrite is not allowed) → just record metadata.
        if (e.code !== "storage/unauthorized") throw e;
      }
      const meta = doc(collection(db, "submissions", p.sid, "photos"), p.id);
      try {
        await setDoc(meta, {
          itemId: p.itemId, addendumId: p.addendumId, path,
          by: p.uid, byName: p.byName, takenAt: new Date(p.takenAt),
          source: p.source, uploadedAt: serverTimestamp(),
        });
      } catch (e) {
        // A retry after a half-finished attempt: the record already exists.
        if (!(await getDoc(meta)).exists()) throw e;
      }
      await tx("readwrite", (s) => s.delete(p.id));
      notify();
    }
  } catch (e) {
    console.warn("Photo upload paused:", e);
  } finally {
    running = false;
  }
}

window.addEventListener("online", processQueue);
setInterval(processQueue, 30000);
