import {
  signInAnonymously, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  doc, collection, setDoc, updateDoc, getDoc, getDocsFromServer, onSnapshot, serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  auth, db, AREAS, h, toast, normCode, sha256, subId, latestByArea, fmt,
  fingerprint, statusBadge, RESULT_LABEL, itemsFor, outstandingItems, APP_VERSION,
} from "./common.js";
import { GROUPS, AREA_BY_ID, CHECKLIST_VERSION } from "./checklist.js";
import { queuePhoto, onQueueChange, pendingCount, processQueue, localPhotos, setUploader } from "./photos.js";
import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
import { storage } from "./common.js";

const root = document.getElementById("app");
const S = { session: null, subs: {}, unsub: [], codeExpires: null, extras: [], supp: {}, suppUnsub: {}, resIds: {}, resLoading: {} };

function deviceId() {
  let id = localStorage.getItem("hv-device");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("hv-device", id); }
  return id;
}

function clearListeners() { S.unsub.forEach((u) => u()); S.unsub = []; }
let lastView = "";
function render(...nodes) {
  const view = S.screen + (S.area?.sid || "");
  const y = window.scrollY;
  root.replaceChildren(...nodes.filter(Boolean));
  window.scrollTo(0, view === lastView ? y : 0);
  lastView = view;
}
// Don't redraw under someone's fingers while they type a note.
function typing() {
  const el = document.activeElement;
  return el && root.contains(el) && /^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName);
}
root.addEventListener("focusout", () => setTimeout(() => {
  if (S.needsDraw && !typing()) { S.needsDraw = false; S.screen === "home" ? homeScreen() : drawArea(); }
}, 50));

// ---------- Sign in ----------
function loginScreen(msg) {
  clearListeners();
  const name = h("input", { id: "name", autocomplete: "name", value: localStorage.getItem("hv-name") || "", placeholder: "e.g. Tunde Bello" });
  const code = h("input", { id: "code", autocomplete: "off", autocapitalize: "none", placeholder: "word-word-word-word-00" });
  const btn = h("button", { class: "primary", type: "submit" }, "Sign in");
  const form = h("form", {
    class: "card",
    onsubmit: async (e) => {
      e.preventDefault();
      if (name.value.trim().length < 2) return toast("Enter your full name.");
      if (!navigator.onLine) return toast("You need signal to sign in.");
      btn.disabled = true; btn.textContent = "Checking…";
      loggingIn = true;
      try {
        await login(name.value.trim(), code.value);
      } catch (err) {
        toast(err.message || "Sign-in failed.");
        btn.disabled = false; btn.textContent = "Sign in";
      } finally {
        loggingIn = false;
      }
    },
  },
  h("h2", {}, "Builder sign-in"),
  h("p", { class: "muted" }, "Enter your name and the code word you were given."),
  h("label", { for: "name" }, "Your full name"), name,
  h("label", { for: "code" }, "Code word"), code,
  btn);
  render(h("header", {}, h("h1", {}, "House handover")), msg ? h("p", { class: "warn" }, msg) : null, form);
}

async function login(name, code) {
  const codeHash = await sha256(normCode(code));
  await signOut(auth).catch(() => {});
  const cred = await signInAnonymously(auth);
  try {
    await setDoc(doc(db, "sessions", cred.user.uid), {
      codeHash, name, deviceId: deviceId(), createdAt: serverTimestamp(),
    });
  } catch {
    await signOut(auth);
    throw new Error("That code word is not valid or has expired.");
  }
  localStorage.setItem("hv-name", name);
  await loadSession(cred.user);
}

let loggingIn = false;
async function loadSession(user) {
  let snap;
  try { snap = await getDoc(doc(db, "sessions", user.uid)); } catch { snap = null; }
  if (!snap || !snap.exists()) { if (!loggingIn) loginScreen(); return; }
  S.session = { uid: user.uid, ...snap.data() };
  try {
    const c = await getDoc(doc(db, "codes", S.session.codeHash));
    S.codeExpires = c.exists() ? c.data().expiresAt : null;
  } catch { /* offline: expiry unknown */ }
  if (!S.extrasUnsub) {
    S.extrasUnsub = onSnapshot(collection(db, "extraItems"), (qs) => {
      S.extras = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (S.screen === "home") homeScreen(); else if (S.screen === "area") drawArea();
    }, () => {});
  }
  startHome();
  setUploader(S.session.name);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { S.session = null; if (!loggingIn) loginScreen(); return; }
  if (!user.isAnonymous) { if (!loggingIn) loginScreen(); return; } // never sign anyone else out
  if (!loggingIn) loadSession(user);
});

function expired() {
  clearListeners();
  if (S.extrasUnsub) { S.extrasUnsub(); S.extrasUnsub = null; }
  Object.values(S.suppUnsub).forEach((u) => u()); S.suppUnsub = {};
  signOut(auth);
  loginScreen("Your code word has expired or was revoked. Ask the owner for a new one. Anything already synced is safe.");
}

// ---------- Home ----------
function startHome() {
  clearListeners();
  S.unsub.push(onSnapshot(collection(db, "submissions"), (qs) => {
    S.subs = latestByArea(qs.docs.map((d) => ({ id: d.id, ...d.data() })));
    if (S.screen === "home") homeScreen();
  }, (err) => { if (err.code === "permission-denied" && navigator.onLine) expired(); }));
  homeScreen();
}

// Answers to added checks on submitted areas (kept live for the home badges).
function watchSupp(sid) {
  if (S.suppUnsub[sid]) return;
  S.suppUnsub[sid] = onSnapshot(collection(db, "submissions", sid, "supplements"), (qs) => {
    S.supp[sid] = Object.fromEntries(qs.docs.map((d) => [d.id, d.data()]));
    if (S.screen === "home") homeScreen(); else if (S.screen === "area") drawArea();
  }, () => {});
}
// Which checks a submitted revision answered. Those answers never change, so load once,
// from the server only (an offline cache could be incomplete and show false "new checks").
function loadResIds(sid) {
  if (S.resIds[sid] || S.resLoading[sid]) return;
  S.resLoading[sid] = true;
  getDocsFromServer(collection(db, "submissions", sid, "results")).then((qs) => {
    S.resIds[sid] = new Set(qs.docs.map((d) => d.id));
    if (S.screen === "home") homeScreen();
  }).catch(() => { S.resLoading[sid] = false; });
}
function newChecksCount(areaId) {
  const s = S.subs[areaId];
  if (!s || s.status !== "submitted") return 0;
  watchSupp(s.id);
  loadResIds(s.id);
  if (!S.resIds[s.id] || !S.supp[s.id]) return null;  // not known yet
  return outstandingItems(areaId, S.extras, s, S.resIds[s.id], new Set(Object.keys(S.supp[s.id]))).length;
}

function topBar(title, back) {
  const pending = h("span", { class: "muted small" });
  const upd = (n) => { pending.textContent = n ? `${n} photo${n > 1 ? "s" : ""} waiting to upload` : ""; };
  pendingCount().then(upd);
  if (S.qUnsub) S.qUnsub();
  S.qUnsub = onQueueChange(upd);
  return h("header", {},
    back ? h("button", { class: "link", onclick: back }, "‹ Back") : null,
    h("h1", {}, title),
    h("div", { class: "muted small" },
      `${S.session.name}`, S.codeExpires ? ` · access until ${fmt(S.codeExpires)}` : "",
      navigator.onLine ? "" : " · offline, saving on this phone"),
    pending);
}

function homeScreen() {
  S.screen = "home";
  if (typing()) { S.needsDraw = true; return; }
  const todo = Object.fromEntries(AREAS.map((a) => [a.id, newChecksCount(a.id)]));
  const state = (a) => {
    const s = S.subs[a.id];
    if (!s) return "none";
    if (s.status !== "submitted") return "draft";
    return todo[a.id] == null ? "submitted" : todo[a.id] ? "partial" : "complete";
  };
  const count = (k) => AREAS.filter((a) => state(a) === k).length;
  const groups = GROUPS.map((g) => h("section", {},
    h("h2", {}, g.name),
    ...AREAS.filter((a) => a.group === g.id).map((a) => {
      const s = S.subs[a.id];
      const st = state(a);
      return h("button", { class: "area", onclick: () => openArea(a.id) },
        h("span", {}, a.name, a.size ? h("span", { class: "muted small" }, ` ${a.size} m²`) : "",
          s?.status === "submitted" ? h("div", { class: "muted small" }, `last submitted by ${s.certName}, ${fmt(s.submittedAt)}`) : ""),
        h("span", {}, statusBadge(st), st === "partial" ? h("span", { class: "badge b-new" }, `${todo[a.id]} to do`) : null));
    })));
  render(topBar("House handover"),
    h("p", {}, h("b", {}, `${count("complete")} of ${AREAS.length} areas done`),
      ` · ${count("partial")} part done · ${count("draft")} in progress · ${count("none")} not started`),
    h("p", { class: "muted small" }, "Open an area, check items, then submit what you've done. You can come back to a room any time to do the rest."),
    ...groups,
    h("p", {}, h("button", { class: "link", onclick: async () => {
      const n = await pendingCount();
      if (n && !confirm(`${n} photo${n > 1 ? "s are" : " is"} still waiting to upload. They stay on this phone and upload after you sign in again. Sign out anyway?`)) return;
      signOut(auth);
    } }, "Sign out"), h("span", { class: "muted small" }, `  · app v${APP_VERSION}`)));
}

// ---------- Area ----------
function openArea(areaId) {
  clearListeners();
  const latest = S.subs[areaId];
  const rev = latest ? latest.revision : 1;
  const sid = subId(areaId, rev);
  S.area = { areaId, rev, sid, results: {}, pendingNote: {}, photos: {}, ensured: false, addenda: [],
    suppDraft: JSON.parse(localStorage.getItem(`supp-${sid}`) || "{}") };
  watchSupp(sid);
  S.unsub.push(onSnapshot(collection(db, "submissions"), (qs) => {
    S.subs = latestByArea(qs.docs.map((d) => ({ id: d.id, ...d.data() })));
    const cur = S.subs[areaId];
    if (cur && cur.revision !== S.area.rev) return openArea(areaId);
    drawArea();
  }, (err) => { if (err.code === "permission-denied" && navigator.onLine) expired(); }));
  S.unsub.push(onSnapshot(collection(db, "submissions", sid, "results"), { includeMetadataChanges: true }, (qs) => {
    S.area.results = Object.fromEntries(qs.docs.map((d) => [d.id, { ...d.data(), _pending: d.metadata.hasPendingWrites }]));
    S.area.resultsFromServer ||= !qs.metadata.fromCache;
    drawArea();
  }));
  S.unsub.push(onSnapshot(collection(db, "submissions", sid, "photos"), (qs) => {
    S.area.photoDocs = qs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.removed);
    const counts = {};
    S.area.photoDocs.forEach((p) => { const k = p.itemId || "_"; counts[k] = (counts[k] || 0) + 1; });
    S.area.photos = counts;
    drawArea();
  }));
  S.unsub.push(onSnapshot(collection(db, "submissions", sid, "addenda"), (qs) => {
    S.area.addenda = qs.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt?.seconds || 9e9) - (b.createdAt?.seconds || 9e9));
    drawArea();
  }));
  S.screen = "area";
  drawArea();
}

function curSub() { return S.subs[S.area.areaId]; }
function editable() { const s = curSub(); return !s || s.status === "draft"; }

function ensureSub() {
  if (S.area.ensured) return;
  S.area.ensured = true;
  setDoc(doc(db, "submissions", S.area.sid), {
    areaId: S.area.areaId, revision: S.area.rev, status: "draft", checklistVersion: CHECKLIST_VERSION,
  }, { merge: true }).catch((e) => { S.area.ensured = false; toast("Could not save: " + e.code); });
}

function saveResult(item, result, note) {
  if (result !== "pass" && !note.trim()) {
    S.area.pendingNote[item.id] = result;
    drawArea();
    return toast(result === "defect" ? "Describe the defect in the note to save it." : "Give a short reason for N/A to save it.");
  }
  if (item.noteRequired && !note.trim()) {
    S.area.pendingNote[item.id] = result;
    drawArea();
    return toast("This item needs a note (e.g. the count or reading).");
  }
  delete S.area.pendingNote[item.id];
  ensureSub();
  setDoc(doc(db, "submissions", S.area.sid, "results", item.id), {
    result, note: note.trim(), by: S.session.uid, byName: S.session.name, updatedAt: serverTimestamp(),
  }).catch((e) => toast(e.code === "permission-denied" ? "Not saved: this area is locked or your access has ended." : "Not saved: " + e.code));
}

function photoButtons(itemId, addendumIdFn) {
  const make = (label, capture, source) => {
    const input = h("input", { type: "file", accept: "image/*", capture: capture ? "environment" : false, multiple: !capture, hidden: true });
    input.addEventListener("change", async () => {
      for (const f of input.files) {
        if (editable()) ensureSub();
        await queuePhoto({
          sid: S.area.sid, itemId, addendumId: addendumIdFn ? addendumIdFn() : "",
          file: f, source, byName: S.session.name,
        });
      }
      toast("Photo saved; it will upload when there is signal.");
      input.value = "";
    });
    return h("label", { class: "btn small" }, label, input);
  };
  return [make("Take photo", true, "camera"), make("From gallery", false, "gallery")];
}

// Uploaded photos for a check, with Remove. Removing hides the photo; the owner can
// still see what was removed and by whom.
const urlCache = {};
function photoStrip(itemId) {
  const list = (S.area.photoDocs || []).filter((p) => p.itemId === itemId && !p.addendumId);
  if (!list.length) return null;
  return h("div", { class: "thumbs" }, ...list.map((p) => {
    if (!(p.path in urlCache)) {
      urlCache[p.path] = null;
      getDownloadURL(ref(storage, p.path)).then((u) => { urlCache[p.path] = u; drawArea(); }).catch(() => { delete urlCache[p.path]; });
    }
    const u = urlCache[p.path];
    return h("div", { class: "thumb" },
      u ? h("a", { href: u, target: "_blank" }, h("img", { src: u, alt: "" })) : h("span", { class: "muted small" }, "loading…"),
      h("button", { class: "link small", onclick: () => removePhoto(p) }, "Remove"));
  }));
}
function removePhoto(p) {
  if (!confirm("Remove this photo? (To replace it, remove it and add a new one.)")) return;
  updateDoc(doc(db, "submissions", S.area.sid, "photos", p.id), {
    removed: true, removedBy: S.session.uid, removedByName: S.session.name, removedAt: serverTimestamp(),
  }).catch((e) => toast("Could not remove: " + e.code));
}

function itemCard(item, { r, sel, canEdit, wanted, onPick, onNote, tag, footer, actions, photos = true }) {
  const note = h("textarea", { rows: 2, placeholder: item.noteRequired ? "Required: record the count/reading" : "Note (required for Defect or N/A)", disabled: !canEdit }, r?.note || "");
  note.addEventListener("change", () => onNote(note.value));
  const btn = (val) => h("button", {
    class: `res ${val}${sel === val ? " on" : ""}`, disabled: !canEdit,
    onclick: () => onPick(val, note.value),
  }, RESULT_LABEL[val]);
  const pc = S.area.photos[item.id] || 0;
  return h("div", { id: `item-${item.id}`, class: `card item${r?.result ? " done" : ""}${item.extra ? " extra" : ""}` },
    (tag || item.extra) ? h("span", { class: "badge b-new" }, tag || "Added by owner") : null,
    h("p", { class: "itext" }, item.text),
    h("div", { class: "row" }, btn("pass"), btn("defect"), btn("na")),
    (canEdit || r?.note) ? note : null,
    photos ? photoStrip(item.id) : null,
    h("div", { class: "row small muted" },
      photos ? photoButtons(item.id) : null,
      [pc ? `${pc} photo${pc > 1 ? "s" : ""}` : "", r?.byName ? `${r._pending ? "saved on phone" : "synced"} · ${r.byName}` : ""].filter(Boolean).join(" · "),
      wanted ? h("b", { class: "warn-text" }, " · add a note to save") : ""),
    footer ? h("div", { class: "small muted" }, footer) : null,
    actions ? h("div", { class: "row" }, ...actions) : null);
}

// Editing an answer that was already submitted: the change is saved together with a
// history record (before → after, who, when) that the owner can see.
function saveEdit(item, coll, cur, next) {
  const note = (next.note || "").trim();
  if ((next.result !== "pass" || item.noteRequired) && !note) return toast("Add a note — a Defect or N/A (or this check) needs one.");
  if (next.result === cur.result && note === (cur.note || "")) { S.area.editing = null; return drawArea(); }
  const hist = doc(collection(db, "submissions", S.area.sid, "history"));
  const batch = writeBatch(db);
  batch.set(hist, {
    itemId: item.id, coll, before: { result: cur.result, note: cur.note || "" }, after: { result: next.result, note },
    by: S.session.uid, byName: S.session.name, at: serverTimestamp(),
  });
  batch.update(doc(db, "submissions", S.area.sid, coll, item.id), {
    result: next.result, note, editedAt: serverTimestamp(), editedBy: S.session.uid, editedByName: S.session.name,
    edits: (cur.edits || 0) + 1, lastEditId: hist.id,
  });
  batch.commit().catch((e) => toast(e.code === "permission-denied" ? "Change not saved: your access may have ended." : "Change not saved: " + e.code));
  S.area.editing = null;
  toast("Change saved.");
  drawArea();
}

function drawArea() {
  if (S.screen !== "area") return;
  if (typing()) { S.needsDraw = true; return; }
  const a = AREA_BY_ID[S.area.areaId];
  const sub = curSub();
  const canEdit = editable();
  const R = S.area.results;
  const supp = S.supp[S.area.sid] || {};
  const all = itemsFor(a.id, S.extras, { includeRetired: true });
  // Active items, plus retired added checks that were already answered.
  const items = all.filter((i) => !i.extra || i.active || R[i.id] || supp[i.id]);
  const back = () => { clearListeners(); startHome(); };
  const reopenNote = sub?.reopenReason ? h("p", { class: "warn" }, `Reopened by the owner: ${sub.reopenReason}`,
    Object.values(R).some((r) => r.copiedFrom) ? h("div", { class: "small" }, "Earlier answers are filled in — change what needs fixing, then submit again.") : null) : null;

  // ----- Not submitted yet: everything editable -----
  if (canEdit) {
    const list = items.filter((i) => !i.extra || i.active);
    const answered = list.filter((i) => R[i.id]).length;
    const cards = list.map((item) => {
      const wanted = S.area.pendingNote[item.id];
      const r = R[item.id];
      const sel = wanted || r?.result;
      return itemCard(item, {
        r, sel, canEdit: true, wanted,
        onPick: (val, note) => saveResult(item, val, note),
        onNote: (note) => { if (sel) saveResult(item, sel, note); },
      });
    });
    return render(topBar(a.name, back),
      h("p", {}, statusBadge(sub ? "draft" : "none"), " ",
        h("span", { class: "muted" }, `${answered}/${list.length} checked`, S.area.rev > 1 ? ` · revision ${S.area.rev}` : "")),
      reopenNote,
      h("p", { class: "muted small" }, "You don't have to finish the room in one go: submit what you've done, and the rest stays open for later."),
      ...cards,
      h("div", { class: "sticky" }, h("button", { class: "primary", onclick: reviewScreen },
        answered ? `Review and submit (${answered}/${list.length} done)` : `Review and submit (0/${list.length})`)));
  }

  // ----- Submitted (fully or partly): done checks locked, the rest still to do -----
  // Only once the answers have come from the server, so nothing is wrongly shown as to-do.
  const known = S.area.resultsFromServer || S.resIds[S.area.sid];
  const outstanding = known
    ? outstandingItems(a.id, S.extras, sub, S.resIds[S.area.sid] || new Set(Object.keys(R)), new Set(Object.keys(supp))) : [];
  S.area.outstandingIds = new Set(outstanding.map((i) => i.id));
  const done = items.filter((i) => R[i.id] || supp[i.id]);
  const total = done.length + outstanding.length;
  const doneCards = done.map((i) => {
    const coll = R[i.id] ? "results" : "supplements";
    const r = R[i.id] || supp[i.id];
    const by = (supp[i.id] ? `Certified by ${supp[i.id].certName}, ${fmt(supp[i.id].at)}` : `Certified by ${sub.certName}, ${fmt(sub.submittedAt)}`)
      + (r.edits ? ` · edited by ${r.editedByName}, ${fmt(r.editedAt)}${r.edits > 1 ? ` (${r.edits} changes)` : ""}` : "");
    if (S.area.editing === i.id) {
      const d = (S.area.editDraft ||= { result: r.result, note: r.note || "" });
      return itemCard(i, {
        r: { ...r, note: d.note }, sel: d.result, canEdit: true, tag: "Editing", footer: by,
        onPick: (val, note) => { d.result = val; d.note = note; drawArea(); },
        onNote: (note) => { d.note = note; },
        actions: [
          h("button", { class: "primary small-btn", onclick: () => saveEdit(i, coll, r, d) }, "Save change"),
          h("button", { onclick: () => { S.area.editing = null; S.area.editDraft = null; drawArea(); } }, "Cancel"),
        ],
      });
    }
    return itemCard(i, {
      r, sel: r.result, canEdit: false, tag: i.extra ? "Added by owner" : null, footer: by,
      actions: [h("button", { class: "btn small", onclick: () => { S.area.editing = i.id; S.area.editDraft = null; drawArea(); } }, "Edit answer")],
    });
  });
  render(
    topBar(a.name, back),
    h("p", {}, statusBadge(outstanding.length ? "partial" : "complete"), " ",
      h("span", { class: "muted" }, `${done.length} of ${total} checks done`, S.area.rev > 1 ? ` · revision ${S.area.rev}` : "")),
    reopenNote,
    h("p", { class: "ok" }, outstanding.length
      ? `${done.length} checks are submitted. ${outstanding.length} still to do — answer them below whenever you're ready. Submitted answers can still be edited; every change is recorded.`
      : `All checks in this room are done. You can still edit any answer or its photos; every change is recorded for the owner.`),
    ...(outstanding.length ? newChecksSection(a, outstanding) : []),
    h("details", { class: "done-list", open: S.area.doneOpen ?? !outstanding.length, ontoggle: (e) => { S.area.doneOpen = e.target.open; } },
      h("summary", {}, `Done — submitted (${done.length})`), ...doneCards),
    addendaSection(a, items));
}

// ---------- New checks added after an area was submitted ----------
function newChecksSection(a, outstanding) {
  const D = S.area.suppDraft;
  const keep = () => localStorage.setItem(`supp-${S.area.sid}`, JSON.stringify(D));
  const cards = outstanding.map((item) => {
    const d = D[item.id] || {};
    return itemCard({ id: item.id, text: item.text, noteRequired: !!item.noteRequired, extra: !!item.extra }, {
      r: d.result ? { result: d.result, note: d.note } : null, sel: d.result, canEdit: true, tag: item.extra ? "Added by owner" : null,
      onPick: (val, note) => { D[item.id] = { result: val, note }; keep(); drawArea(); },
      onNote: (note) => { D[item.id] = { ...(D[item.id] || {}), note }; keep(); },
    });
  });
  const certName = h("input", { value: S.session.name });
  const certRole = h("input", { placeholder: "e.g. Site engineer" });
  const tick = h("input", { type: "checkbox" });
  const btn = h("button", { class: "primary" }, "Certify and submit the checks I've answered");
  btn.addEventListener("click", async () => {
    const ready = outstanding.filter((i) => D[i.id]?.result);
    if (!ready.length) return toast("Answer at least one check first.");
    const bad = ready.find((i) => (D[i.id].result !== "pass" || i.noteRequired) && !(D[i.id].note || "").trim());
    if (bad) return toast(`Add a note for: ${bad.text.slice(0, 60)}`);
    if (!tick.checked) return toast("Tick the certification box.");
    if (certName.value.trim().length < 3 || certRole.value.trim().length < 2) return toast("Enter your name and role.");
    if (!navigator.onLine) return toast("Submitting needs signal. Your answers are kept on this phone.");
    const left = outstanding.length - ready.length;
    if (!confirm(`Submit ${ready.length} check${ready.length > 1 ? "s" : ""}? They cannot be changed afterwards.${left ? ` The other ${left} stay open for later.` : ""}`)) return;
    btn.disabled = true; btn.textContent = "Submitting…";
    try {
      await Promise.race([
        Promise.all(ready.map((i) => setDoc(doc(db, "submissions", S.area.sid, "supplements", i.id), {
          result: D[i.id].result, note: (D[i.id].note || "").trim(), by: S.session.uid, byName: S.session.name,
          certName: certName.value.trim(), certRole: certRole.value.trim(), at: serverTimestamp(),
        }))),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 30000)),
      ]);
      ready.forEach((i) => delete D[i.id]); keep();
      toast("Submitted and locked.");
    } catch (e) {
      toast(e.message === "timeout" ? "No response from the server; try again." : "Submit failed: " + (e.code || e.message));
      btn.disabled = false; btn.textContent = "Certify and submit the checks I've answered";
    }
  });
  return [
    h("h2", {}, `Still to do (${outstanding.length})`),
    h("p", { class: "muted" }, "Answer any of these and submit them — you can do some now and the rest later. Answers here are kept on this phone until you submit."),
    ...cards,
    h("div", { class: "card" },
      h("label", { class: "check" }, tick, " I personally carried out the checks I've answered here and the results recorded are accurate."),
      h("label", {}, "Full name"), certName, h("label", {}, "Role"), certRole, btn),
  ];
}

// ---------- Review & certify ----------
async function reviewScreen() {
  const a = AREA_BY_ID[S.area.areaId];
  const R = S.area.results;
  const items = itemsFor(a.id, S.extras);
  const missing = items.filter((i) => !R[i.id]);
  const defects = items.filter((i) => R[i.id]?.result === "defect");
  const na = items.filter((i) => R[i.id]?.result === "na");
  const local = (await localPhotos(S.area.sid)).length;
  const certName = h("input", { value: S.session.name });
  const certRole = h("input", { placeholder: "e.g. Site engineer" });
  const tick = h("input", { type: "checkbox", id: "tick" });
  const goTo = (id) => { S.screen = "area"; drawArea(); setTimeout(() => {
    const el = document.getElementById(`item-${id}`);
    if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); }
  }, 50); };
  const errBox = h("div");
  const showErr = (title, detail) => errBox.replaceChildren(h("div", { class: "card error" }, h("b", {}, title), h("p", {}, detail)));
  const answered = items.length - missing.length;
  const needNote = missing.filter((i) => S.area.pendingNote[i.id]);
  const label = !answered ? "Answer at least one check first"
    : missing.length ? `Submit the ${answered} check${answered > 1 ? "s" : ""} done so far` : "Submit and lock this area";
  const btn = h("button", { class: answered ? "primary" : "primary blocked" }, label);
  btn.addEventListener("click", async () => {
    if (!answered) { S.screen = "area"; drawArea(); return toast("Answer at least one check, then submit."); }
    if (!tick.checked) return toast("Tick the certification box.");
    if (certName.value.trim().length < 3 || certRole.value.trim().length < 2) return toast("Enter your name and role.");
    if (!navigator.onLine) return toast("Submitting needs signal. Your answers are saved; try again when online.");
    if (!confirm(missing.length
      ? `Submit ${answered} check${answered > 1 ? "s" : ""}? They will be locked. The other ${missing.length} stay open — you can do them later.`
      : "Submit this area? It cannot be changed afterwards.")) return;
    btn.disabled = true; btn.textContent = "Submitting…";
    const results = { ...S.area.results };  // every answer recorded in this revision
    try {
      const fp = await fingerprint(S.area.areaId, S.area.rev, results);
      await Promise.race([
        updateDoc(doc(db, "submissions", S.area.sid), {
          status: "submitted", submittedAt: serverTimestamp(), submittedBy: S.session.uid,
          submittedByName: S.session.name, certName: certName.value.trim(), certRole: certRole.value.trim(),
          fingerprint: fp, answeredCount: Object.keys(results).length,
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 30000)),
      ]);
      toast("Submitted and locked.");
      S.screen = "area"; drawArea();
    } catch (e) {
      if (e.message === "timeout") showErr("Not submitted: no response from the server.", "Your answers are safe on this phone. Check you have signal and tap Submit again.");
      else if (e.code === "permission-denied") showErr("Not submitted: the app refused it.", "Either the code word has expired or been revoked, or this room was changed by someone else. Go back, open the room again and retry. If it keeps happening, send the owner a screenshot of this message. (permission-denied)");
      else showErr("Not submitted.", `Please try again. If it keeps happening, send the owner a screenshot of this message. (${e.code || e.message})`);
      btn.disabled = false; btn.textContent = label;
    }
  });
  S.screen = "review";
  render(
    topBar(`Review: ${a.name}`, () => { S.screen = "area"; drawArea(); }),
    needNote.length ? h("div", { class: "card warn" },
      h("b", {}, `${needNote.length} answer${needNote.length > 1 ? "s" : ""} not saved — a Defect or N/A needs a note. Tap to fix, or they'll stay open for later:`),
      h("ul", {}, ...needNote.map((i) => h("li", {}, h("button", { class: "link left", onclick: () => goTo(i.id) }, i.text))))) : null,
    missing.length ? h("details", { class: "card" },
      h("summary", {}, `${missing.length} check${missing.length > 1 ? "s" : ""} not done yet — they stay open for later (tap to see)`),
      h("ul", {}, ...missing.map((i) => h("li", {}, h("button", { class: "link left", onclick: () => goTo(i.id) }, i.text))))) : null,
    h("div", { class: "card" },
      h("p", {}, h("b", {}, `${answered} of ${items.length} checks done. `), `Pass: ${answered - defects.length - na.length} · Defect: ${defects.length} · N/A: ${na.length}`),
      defects.length ? h("ul", {}, ...defects.map((i) => h("li", {}, h("b", {}, "Defect: "), i.text, " — ", R[i.id].note))) : null,
      local ? h("p", { class: "muted" }, `${local} photo(s) still uploading; they will attach automatically.`) : null),
    h("div", { class: "card" },
      h("label", { class: "check" }, tick, " I personally carried out the checks I've answered for this area and the results recorded are accurate."),
      h("label", {}, "Full name"), certName,
      h("label", {}, "Role"), certRole,
      h("p", { class: "warn" }, missing.length
        ? "The checks you've answered will be locked once submitted. The rest stay open: come back to this room any time to do them and submit again."
        : "Once submitted, the checks are locked. You can still add notes and photos."),
      btn, errBox));
}

// ---------- Addenda (after submission) ----------
function addendaSection(a, items) {
  const list = S.area.addenda.map((ad) => h("div", { class: "card small" },
    h("b", {}, ad.byName), ` · ${fmt(ad.createdAt) || "saving…"}`,
    ad.itemId ? h("div", { class: "muted" }, items.find((i) => i.id === ad.itemId)?.text || "") : null,
    h("p", {}, ad.text)));
  const sel = h("select", {}, h("option", { value: "" }, "Whole area"), ...items.map((i) => h("option", { value: i.id }, i.text.slice(0, 70))));
  const text = h("textarea", { rows: 3, placeholder: "e.g. Defect fixed on 3 Dec, see photo" });
  let addId = null;
  const newAddId = () => (addId ||= doc(collection(db, "submissions", S.area.sid, "addenda")).id);
  const save = h("button", { class: "primary" }, "Add note");
  save.addEventListener("click", () => {
    if (!text.value.trim()) return toast("Write the note first.");
    const id = newAddId();
    setDoc(doc(db, "submissions", S.area.sid, "addenda", id), {
      itemId: sel.value, text: text.value.trim(), by: S.session.uid, byName: S.session.name, createdAt: serverTimestamp(),
    }).catch((e) => toast("Not saved: " + e.code));
    addId = null; text.value = "";
    toast("Note added.");
  });
  return h("section", {},
    h("h2", {}, "Notes and photos added after submission"),
    ...list,
    h("div", { class: "card" }, h("label", {}, "About"), sel, h("label", {}, "Note"), text,
      h("p", { class: "muted small" }, "Photos taken here attach to this note when you press Add note."),
      h("div", { class: "row" }, photoButtons("", () => newAddId())), save));
}
