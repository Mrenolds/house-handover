import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
import { firebaseConfig } from "./config.js";
import { AREAS } from "./checklist.js";

// Builder and owner pages use separately named app instances, so each keeps its
// own sign-in in the browser and one can never sign the other out.
const ROLE = location.pathname.endsWith("owner.html") ? "owner" : "builder";
export const app = initializeApp(firebaseConfig, ROLE);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);

// Shown in the page headers so you can tell which version is loaded.
export const APP_VERSION = "1.4 (27 Nov)";

export const RESULT_LABEL = { pass: "Pass", defect: "Defect", na: "N/A" };

export function normCode(s) {
  return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const subId = (areaId, rev) => `${areaId}__r${rev}`;

// Fingerprint of a submission's answers, recomputable by the owner.
export async function fingerprint(areaId, revision, results) {
  const rows = Object.keys(results).sort().map((k) => [k, results[k].result, results[k].note || ""]);
  return sha256(JSON.stringify({ areaId, revision, rows }));
}

// Latest revision per area from a list of submission docs ({id, ...data}).
export function latestByArea(subs) {
  const m = {};
  for (const s of subs) if (!m[s.areaId] || s.revision > m[s.areaId].revision) m[s.areaId] = s;
  return m;
}

export function fmt(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Tiny DOM helper: h("div", {class: "x", onclick}, child, "text", ...)
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

export function toast(msg, ms = 3500) {
  const t = h("div", { class: "toast" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function statusBadge(status) {
  const label = { none: "Not started", draft: "In progress", submitted: "Submitted" }[status] || status;
  return h("span", { class: `badge b-${status}` }, label);
}

// Items for an area = the built-in checklist + checks the owner added later.
// Extra checks carry extra: true and the time they were added.
export function itemsFor(areaId, extras, { includeRetired = false } = {}) {
  const base = (AREAS.find((a) => a.id === areaId)?.items || []).map((i) => ({ ...i }));
  const more = extras
    .filter((x) => x.areaId === areaId && (x.active || includeRetired))
    .sort((a, b) => (a.createdAt?.seconds || 9e9) - (b.createdAt?.seconds || 9e9))
    .map((x) => ({ id: x.id, text: x.text, noteRequired: !!x.noteRequired, extra: true, active: x.active, createdAt: x.createdAt }));
  return [...base, ...more];
}

// Extra checks still to do on a submitted revision: not answered in it, not added since.
export function outstandingExtras(areaId, extras, sub, resultIds, suppIds) {
  if (!sub || sub.status !== "submitted") return [];
  return extras.filter((x) => x.areaId === areaId && x.active && !resultIds.has(x.id) && !suppIds.has(x.id));
}

export { AREAS };
