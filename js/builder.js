import {
  signInAnonymously, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  doc, collection, setDoc, updateDoc, getDoc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  auth, db, AREAS, h, toast, normCode, sha256, subId, latestByArea, fmt,
  fingerprint, statusBadge, RESULT_LABEL, itemsFor, outstandingExtras,
} from "./common.js";
import { GROUPS, AREA_BY_ID, CHECKLIST_VERSION } from "./checklist.js";
import { queuePhoto, onQueueChange, pendingCount, processQueue, localPhotos } from "./photos.js";

const root = document.getElementById("app");
const S = { session: null, subs: {}, unsub: [], codeExpires: null, extras: [], supp: {}, suppUnsub: {} };

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
  processQueue();
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
function newChecksCount(areaId) {
  const s = S.subs[areaId];
  if (!s || s.status !== "submitted") return 0;
  const mine = S.extras.filter((x) => x.areaId === areaId && x.active);
  if (!mine.length) return 0;
  watchSupp(s.id);
  const done = S.supp[s.id] || {};
  // Checks added after submission that nobody has answered yet.
  return mine.filter((x) => !done[x.id] && (!x.createdAt || !s.submittedAt || x.createdAt.seconds > s.submittedAt.seconds)).length;
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
  const done = AREAS.filter((a) => S.subs[a.id]?.status === "submitted").length;
  const newTotal = AREAS.reduce((n, a) => n + newChecksCount(a.id), 0);
  const groups = GROUPS.map((g) => h("section", {},
    h("h2", {}, g.name),
    ...AREAS.filter((a) => a.group === g.id).map((a) => {
      const s = S.subs[a.id];
      const nc = newChecksCount(a.id);
      return h("button", { class: "area", onclick: () => openArea(a.id) },
        h("span", {}, a.name, a.size ? h("span", { class: "muted small" }, ` ${a.size} m²`) : "",
          s?.status === "submitted" ? h("div", { class: "muted small" }, `by ${s.certName}, ${fmt(s.submittedAt)}`) : ""),
        h("span", {}, statusBadge(s ? s.status : "none"), nc ? h("span", { class: "badge b-new" }, `${nc} new check${nc > 1 ? "s" : ""}`) : null));
    })));
  render(topBar("House handover"),
    h("p", { class: "muted" }, `${done} of ${AREAS.length} areas submitted. Open an area, check every item, then certify and submit it.`),
    newTotal ? h("p", { class: "warn" }, `The owner has added ${newTotal} new check${newTotal > 1 ? "s" : ""} to areas already submitted. Open the areas marked "new checks".`) : null,
    ...groups,
    h("p", {}, h("button", { class: "link", onclick: () => { signOut(auth); } }, "Sign out")));
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
    drawArea();
  }));
  S.unsub.push(onSnapshot(collection(db, "submissions", sid, "photos"), (qs) => {
    const counts = {};
    qs.docs.forEach((d) => { const k = d.data().itemId || "_"; counts[k] = (counts[k] || 0) + 1; });
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
        // Locked area: photos only for a note, or for a new check the owner added.
        if (!editable() && !addendumIdFn && !S.extras.some((x) => x.id === itemId)) continue;
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

function itemCard(item, { r, sel, canEdit, wanted, onPick, onNote, tag }) {
  const note = h("textarea", { rows: 2, placeholder: item.noteRequired ? "Required: record the count/reading" : "Note (required for Defect or N/A)", disabled: !canEdit }, r?.note || "");
  note.addEventListener("change", () => onNote(note.value));
  const btn = (val) => h("button", {
    class: `res ${val}${sel === val ? " on" : ""}`, disabled: !canEdit,
    onclick: () => onPick(val, note.value),
  }, RESULT_LABEL[val]);
  const pc = S.area.photos[item.id] || 0;
  return h("div", { class: `card item${r?.result ? " done" : ""}${item.extra ? " extra" : ""}` },
    item.extra ? h("span", { class: "badge b-new" }, tag || "Added by owner") : null,
    h("p", { class: "itext" }, item.text),
    h("div", { class: "row" }, btn("pass"), btn("defect"), btn("na")),
    (canEdit || r?.note) ? note : null,
    h("div", { class: "row small muted" },
      canEdit ? photoButtons(item.id) : null,
      [pc ? `${pc} photo${pc > 1 ? "s" : ""} uploaded` : "", r?.byName ? `${r._pending ? "saved on phone" : "synced"} · ${r.byName}` : ""].filter(Boolean).join(" · "),
      wanted ? h("b", { class: "warn-text" }, " · add a note to save") : ""));
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
  const inRev = canEdit ? items.filter((i) => !i.extra || i.active) : items.filter((i) => R[i.id]);
  const answered = inRev.filter((i) => R[i.id]).length;

  const head = [
    topBar(a.name, () => { clearListeners(); startHome(); }),
    h("p", {}, statusBadge(sub ? sub.status : "none"), " ",
      h("span", { class: "muted" }, `${answered}/${inRev.length} checked`, S.area.rev > 1 ? ` · revision ${S.area.rev}` : "")),
  ];
  if (sub?.reopenReason) head.push(h("p", { class: "warn" }, `Reopened by the owner: ${sub.reopenReason}`,
    Object.values(R).some((r) => r.copiedFrom) ? h("div", { class: "small" }, "Earlier answers are filled in — change what needs fixing, then submit again.") : null));
  if (!canEdit) head.push(h("p", { class: "ok" }, `Submitted ${fmt(sub.submittedAt)} by ${sub.certName} (${sub.certRole}). Locked — you can add notes and photos below.`));

  const cards = inRev.map((item) => {
    const wanted = S.area.pendingNote[item.id];
    const r = R[item.id];
    const sel = wanted || r?.result;
    return itemCard(item, {
      r, sel, canEdit, wanted,
      onPick: (val, note) => saveResult(item, val, note),
      onNote: (note) => { if (sel) saveResult(item, sel, note); },
    });
  });

  const parts = [...head, ...cards];
  if (!canEdit) {
    const outstanding = outstandingExtras(a.id, S.extras, sub, new Set(Object.keys(R)), new Set(Object.keys(supp)));
    const answeredSupp = items.filter((i) => supp[i.id]);
    if (answeredSupp.length) {
      parts.push(h("h2", {}, "Added checks — certified"));
      answeredSupp.forEach((i) => parts.push(itemCard(i, { r: supp[i.id], sel: supp[i.id].result, canEdit: false, tag: `Added check · certified by ${supp[i.id].certName}` })));
    }
    if (outstanding.length) parts.push(...newChecksSection(a, outstanding));
    parts.push(addendaSection(a, items));
  } else {
    parts.push(h("div", { class: "sticky" }, h("button", { class: "primary", onclick: reviewScreen }, `Review and submit (${answered}/${inRev.length})`)));
  }
  render(...parts);
}

// ---------- New checks added after an area was submitted ----------
function newChecksSection(a, outstanding) {
  const D = S.area.suppDraft;
  const keep = () => localStorage.setItem(`supp-${S.area.sid}`, JSON.stringify(D));
  const cards = outstanding.map((item) => {
    const d = D[item.id] || {};
    return itemCard({ id: item.id, text: item.text, noteRequired: !!item.noteRequired, extra: true }, {
      r: d.result ? { result: d.result, note: d.note } : null, sel: d.result, canEdit: true, tag: "New check from the owner",
      onPick: (val, note) => { D[item.id] = { result: val, note }; keep(); drawArea(); },
      onNote: (note) => { D[item.id] = { ...(D[item.id] || {}), note }; keep(); },
    });
  });
  const certName = h("input", { value: S.session.name });
  const certRole = h("input", { placeholder: "e.g. Site engineer" });
  const tick = h("input", { type: "checkbox" });
  const btn = h("button", { class: "primary" }, "Certify and submit these checks");
  btn.addEventListener("click", async () => {
    const ready = outstanding.filter((i) => D[i.id]?.result);
    if (!ready.length) return toast("Answer at least one new check first.");
    const bad = ready.find((i) => (D[i.id].result !== "pass" || i.noteRequired) && !(D[i.id].note || "").trim());
    if (bad) return toast(`Add a note for: ${bad.text.slice(0, 60)}`);
    if (!tick.checked) return toast("Tick the certification box.");
    if (certName.value.trim().length < 3 || certRole.value.trim().length < 2) return toast("Enter your name and role.");
    if (!navigator.onLine) return toast("Submitting needs signal. Your answers are kept on this phone.");
    if (!confirm(`Submit ${ready.length} check(s)? They cannot be changed afterwards.`)) return;
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
      toast("New checks submitted and locked.");
    } catch (e) {
      toast(e.message === "timeout" ? "No response from the server; try again." : "Submit failed: " + (e.code || e.message));
      btn.disabled = false; btn.textContent = "Certify and submit these checks";
    }
  });
  return [
    h("h2", {}, `New checks from the owner (${outstanding.length})`),
    h("p", { class: "muted" }, "These were added after this area was submitted. The original answers stay locked; answer these and certify them separately."),
    ...cards,
    h("div", { class: "card" },
      h("label", { class: "check" }, tick, " I personally carried out these new checks and the results recorded are accurate."),
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
  const btn = h("button", { class: "primary", disabled: missing.length > 0 }, "Submit and lock this area");
  btn.addEventListener("click", async () => {
    if (!tick.checked) return toast("Tick the certification box.");
    if (certName.value.trim().length < 3 || certRole.value.trim().length < 2) return toast("Enter your name and role.");
    if (!navigator.onLine) return toast("Submitting needs signal. Your answers are saved; try again when online.");
    if (!confirm("Submit this area? It cannot be changed afterwards.")) return;
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
      toast(e.message === "timeout" ? "No response from the server; check signal and try again." : "Submit failed: " + (e.code || e.message));
      btn.disabled = false; btn.textContent = "Submit and lock this area";
    }
  });
  S.screen = "review";
  render(
    topBar(`Review: ${a.name}`, () => { S.screen = "area"; drawArea(); }),
    missing.length ? h("div", { class: "card warn" }, h("b", {}, `${missing.length} item(s) not checked yet:`), h("ul", {}, ...missing.map((i) => h("li", {}, i.text)))) : null,
    h("div", { class: "card" },
      h("p", {}, `Pass: ${items.length - missing.length - defects.length - na.length} · Defect: ${defects.length} · N/A: ${na.length}`),
      defects.length ? h("ul", {}, ...defects.map((i) => h("li", {}, h("b", {}, "Defect: "), i.text, " — ", R[i.id].note))) : null,
      local ? h("p", { class: "muted" }, `${local} photo(s) still uploading; they will attach automatically.`) : null),
    h("div", { class: "card" },
      h("label", { class: "check" }, tick, " I personally carried out each check listed for this area and the results recorded are accurate."),
      h("label", {}, "Full name"), certName,
      h("label", {}, "Role"), certRole,
      h("p", { class: "warn" }, "Once submitted, this area is locked. You will only be able to add notes and photos."),
      btn));
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
