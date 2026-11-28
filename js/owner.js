import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  doc, collection, setDoc, updateDoc, getDocs, onSnapshot, query, where,
  serverTimestamp, Timestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
import {
  auth, db, storage, AREAS, h, toast, normCode, sha256, subId, latestByArea, fmt,
  fingerprint, statusBadge, RESULT_LABEL, itemsFor, outstandingItems, APP_VERSION, photoLink,
} from "./common.js";
import { GROUPS, AREA_BY_ID, CHECKLIST_VERSION, TARGETS, areasForTarget } from "./checklist.js";
import { OWNER_EMAIL, CODE_VALID_DAYS } from "./config.js";

const root = document.getElementById("app");
clearTimeout(window.__startTimer);  // the app started: no "didn't start" message
const S = { subs: [], latest: {}, reviews: {}, codes: [], extras: [], outstanding: {}, resultIds: {}, tab: "progress", unsub: [] };

const WORDS = ("acorn amber anchor apple arrow aspen autumn badger bamboo banana basket beacon bear berry birch "
  + "biscuit blossom bramble breeze brick bridge brook bucket butter cabin cactus candle canoe canyon carrot castle "
  + "cedar cherry chestnut cinnamon citrus clover cobalt comet copper coral cotton crane crystal daisy delta desert "
  + "dolphin dragon drum eagle echo ember emerald falcon feather fern fiddle forest fossil fox garden garnet ginger "
  + "glacier granite grape gravel harbor hazel heron hickory honey horizon iris island ivory jade jasmine jungle "
  + "kettle kiwi koala ladder lagoon lantern lemon lily lime linen lotus magnet mango maple marble meadow melon "
  + "mint mirror monsoon moss mountain nectar nutmeg oak oasis ocean olive onyx orange orchid otter owl paddle "
  + "palm panda papaya parrot pearl pebble pepper pine planet plum pond poppy prairie quartz quill rabbit radish "
  + "rain raven reef ribbon river robin rocket rose ruby saddle saffron salmon sand sapphire savanna shadow shell "
  + "silver sparrow spruce star stone summit sunset swan tango thistle thunder tiger timber topaz tulip turtle "
  + "valley velvet violet walnut willow window winter wren yarrow zebra zinc").split(" ");

function newCode() {
  const r = crypto.getRandomValues(new Uint32Array(5));
  const w = [0, 1, 2, 3].map((i) => WORDS[r[i] % WORDS.length]);
  return `${w.join("-")}-${String(r[4] % 100).padStart(2, "0")}`;
}

function clearListeners() { S.unsub.forEach((u) => u()); S.unsub = []; }
function render(...nodes) { root.replaceChildren(...nodes.filter(Boolean)); }

// ---------- Sign in ----------
onAuthStateChanged(auth, (user) => {
  clearListeners();
  if (!user || user.isAnonymous) return signInScreen();
  if (user.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    signOut(auth);
    return signInScreen(`${user.email} is not the owner account for this app.`);
  }
  startOwner();
});

function signInScreen(msg) {
  render(h("header", {}, h("h1", {}, "Handover — owner")),
    msg ? h("p", { class: "warn" }, msg) : null,
    h("div", { class: "card" },
      h("p", {}, "Sign in with the owner Google account."),
      h("button", { class: "primary", onclick: () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => toast(e.message)) }, "Sign in with Google")));
}

function startOwner() {
  S.unsub.push(onSnapshot(collection(db, "submissions"), (qs) => {
    S.subs = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    S.latest = latestByArea(S.subs);
    refreshOutstanding();
    if (S.tab === "progress") draw();
    else if (S.tab === "detail" && S.detailArgs) {
      // Only reload the open room if something in that room changed.
      const sig = JSON.stringify(S.subs.filter((x) => x.areaId === S.detailArgs[0]).map((x) => [x.id, x.status, x.submittedAt?.seconds]));
      if (sig !== S.detailSig) detail(S.detailArgs[0]);
    }
  }, (e) => toast("Can't read data: " + e.code)));
  S.unsub.push(onSnapshot(collection(db, "reviews"), (qs) => {
    const m = {};
    qs.docs.map((d) => d.data()).sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0)).forEach((r) => { m[r.submissionId] = r; });
    S.reviews = m;
    if (S.tab === "progress") draw();
    else if (S.tab === "detail" && S.detailArgs && S.reviews[S.latest[S.detailArgs[0]]?.id] !== S.detailReview) detail(...S.detailArgs);
  }));
  S.unsub.push(onSnapshot(collection(db, "extraItems"), (qs) => {
    S.extras = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    refreshOutstanding();
    if (S.tab === "checklist" || S.tab === "progress") draw();
  }));
  S.unsub.push(onSnapshot(collection(db, "codes"), (qs) => {
    S.codes = qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.issuedAt?.seconds || 0) - (a.issuedAt?.seconds || 0));
    if (S.tab === "access") draw();
  }));
  draw();
}

// Added checks still to be answered on submitted areas: { areaId: [extra, ...] }.
let outTimer;
function refreshOutstanding() {
  clearTimeout(outTimer);
  outTimer = setTimeout(async () => {
    const out = {};
    const later = [];
    await Promise.all(AREAS.map(async (a) => {
      const sub = S.latest[a.id];
      if (!sub || sub.status !== "submitted") return;
      // A submitted revision's answers never change, so cache them.
      S.resultIds[sub.id] ||= new Set((await getDocs(collection(db, "submissions", sub.id, "results"))).docs.map((d) => d.id));
      const suppDocs = (await getDocs(collection(db, "submissions", sub.id, "supplements"))).docs;
      suppDocs.forEach((d) => later.push({ areaId: a.id, ...d.data() }));
      const list = outstandingItems(a.id, S.extras, sub, S.resultIds[sub.id], new Set(suppDocs.map((d) => d.id)));
      if (list.length) out[a.id] = list;
    }));
    S.outstanding = out;
    S.later = later;      // checks certified after an area's first submission
    S.outReady = true;
    if (S.tab === "progress") draw();
  }, 400);
}

function nav() {
  const tab = (id, label) => h("button", { class: `tab${S.tab === id ? " on" : ""}`, onclick: () => { S.tab = id; draw(); } }, label);
  return h("header", { class: "noprint" },
    h("h1", {}, "Handover — owner ", h("span", { class: "muted small" }, `v${APP_VERSION}`)),
    h("div", { class: "row" }, tab("progress", "Progress"), tab("defects", "Defects"), tab("checklist", "Checklist"), tab("access", "Code word"), tab("export", "Export"),
      h("button", { class: "link", onclick: () => signOut(auth) }, "Sign out")));
}

function draw() {
  if (S.tab === "progress") progress();
  else if (S.tab === "defects") defects();
  else if (S.tab === "access") access();
  else if (S.tab === "checklist") checklistTab();
  else if (S.tab === "export") exportTab();
}

// ---------- Progress: one combined picture of everyone's work ----------
function progress() {
  const st = (a) => {
    const s = S.latest[a.id];
    if (!s) return "none";
    if (s.status !== "submitted") return "draft";
    if (!S.outReady) return "submitted";
    return S.outstanding[a.id]?.length ? "partial" : "complete";
  };
  const n = (k) => AREAS.filter((a) => st(a) === k).length;
  const accepted = AREAS.filter((a) => S.latest[a.id] && S.reviews[S.latest[a.id].id]?.decision === "accepted").length;
  const newChecks = Object.values(S.outstanding).reduce((t, l) => t + l.length, 0);
  // Who certified what (all revisions, plus who is mid-way through a draft).
  const team = {};
  for (const sub of S.subs) {
    if (sub.status !== "submitted") continue;
    const t = (team[sub.certName] ||= { areas: [], roles: new Set(), last: null });
    t.areas.push(AREA_BY_ID[sub.areaId]?.name + (sub.revision > 1 ? ` (rev ${sub.revision})` : ""));
    t.roles.add(sub.certRole);
    if (!t.last || sub.submittedAt?.seconds > t.last.seconds) t.last = sub.submittedAt;
  }
  // Batches submitted later on the same area (part-done rooms finished off, added checks).
  for (const x of S.later || []) {
    const t = (team[x.certName] ||= { areas: [], roles: new Set(), last: null });
    const name = AREA_BY_ID[x.areaId]?.name + " (later checks)";
    if (!t.areas.includes(name)) t.areas.push(name);
    t.roles.add(x.certRole);
    if (!t.last || x.at?.seconds > t.last.seconds) t.last = x.at;
  }
  const stat = (label, val) => h("div", { class: "stat" }, h("b", {}, val), h("span", {}, label));
  render(nav(),
    h("div", { class: "stats" },
      stat("fully done", `${n("complete")} / ${AREAS.length}`), stat("part done", n("partial") + n("submitted")),
      stat("in progress, not submitted", n("draft")), stat("not started", n("none")),
      stat("checks still to do in submitted rooms", newChecks), stat("accepted by you", accepted)),
    Object.keys(team).length ? h("details", { class: "card" }, h("summary", {}, `Who did what (${Object.keys(team).length} people)`),
      h("table", {}, h("thead", {}, h("tr", {}, ...["Certified by", "Role", "Areas", "Last submitted"].map((x) => h("th", {}, x)))),
        h("tbody", {}, ...Object.entries(team).sort((x, y) => y[1].areas.length - x[1].areas.length).map(([name, t]) =>
          h("tr", {}, h("td", {}, name), h("td", {}, [...t.roles].join(", ")), h("td", {}, `${t.areas.length}: ${t.areas.join(", ")}`), h("td", {}, fmt(t.last))))))) : null,
    ...GROUPS.map((g) => h("section", {}, h("h2", {}, g.name),
      ...AREAS.filter((a) => a.group === g.id).map((a) => {
        const s = S.latest[a.id];
        const rv = s && S.reviews[s.id];
        const nc = S.outstanding[a.id]?.length || 0;
        return h("button", { class: "area", onclick: () => detail(a.id) },
          h("span", {}, a.name, s?.revision > 1 ? h("span", { class: "muted small" }, ` rev ${s.revision}`) : "",
            s?.status === "submitted" ? h("div", { class: "muted small" }, `by ${s.certName} (${s.certRole}), ${fmt(s.submittedAt)}`) : ""),
          h("span", {}, statusBadge(st(a)),
            rv?.decision === "accepted" ? h("span", { class: "badge b-accepted" }, "Accepted") : null,
            nc ? h("span", { class: "badge b-new" }, `${nc} to do`) : null));
      }))));
}

// Read one part of a room. If Firebase refuses or fails, carry on with the rest and
// remember what was missing so the page can say so (instead of "Loading…" forever).
const PART_NAMES = { results: "answers", photos: "photos", addenda: "notes", supplements: "later checks", history: "change history" };
async function readPart(sid, part, problems) {
  try {
    return await Promise.race([
      getDocs(collection(db, "submissions", sid, part)),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), 20000)),
    ]);
  } catch (e) {
    problems.push(`${PART_NAMES[part]} (${e.code || e.message})`);
    return { docs: [] };
  }
}

async function loadSub(sid) {
  const problems = [];
  const [res, ph, ad, sp, hi] = await Promise.all(
    ["results", "photos", "addenda", "supplements", "history"].map((part) => readPart(sid, part, problems)));
  const photos = ph.docs.map((d) => ({ id: d.id, ...d.data() }));
  return {
    problems,
    results: Object.fromEntries(res.docs.map((d) => [d.id, d.data()])),
    supp: Object.fromEntries(sp.docs.map((d) => [d.id, d.data()])),
    photos: photos.filter((p) => !p.removed),
    removedPhotos: photos.filter((p) => p.removed),
    history: hi.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.at?.seconds || 9e9) - (b.at?.seconds || 9e9)),
    addenda: ad.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)),
  };
}

const thumbs = (list) => list.length ? h("div", { class: "thumbs" },
  ...list.map((p) => photoLink(p.path, { title: `${p.byName} · ${p.source} · taken ${fmt(p.takenAt)}` }))) : null;

async function detail(areaId, rev) {
  try { await detailInner(areaId, rev); } catch (e) {
    console.error(e);
    render(nav(), h("button", { class: "link noprint", onclick: () => { S.tab = "progress"; draw(); } }, "‹ Back"),
      h("div", { class: "card error" }, h("b", {}, "This room couldn't be shown."),
        h("p", {}, `${e.code || e.message}. Reload the page; if it keeps happening, send Claude a screenshot.`)));
  }
}

async function detailInner(areaId, rev) {
  S.tab = "detail";
  S.detailArgs = [areaId, rev];
  S.detailSig = JSON.stringify(S.subs.filter((x) => x.areaId === areaId).map((x) => [x.id, x.status, x.submittedAt?.seconds]));
  S.detailReview = S.reviews[S.latest[areaId]?.id];
  const a = AREA_BY_ID[areaId];
  const revs = S.subs.filter((s) => s.areaId === areaId).sort((x, y) => y.revision - x.revision);
  const sub = rev ? revs.find((s) => s.revision === rev) : revs[0];
  const back = h("button", { class: "link noprint", onclick: () => { S.tab = "progress"; draw(); } }, "‹ Back");
  if (!sub) return render(nav(), back, h("h2", {}, a.name), h("p", {}, "Not started."));
  render(nav(), back, h("h2", {}, a.name), h("p", { class: "muted" }, "Loading…"));
  const data = await loadSub(sub.id);
  // Check the fingerprint against the answers as certified: undo any later edits using
  // the change history (the earliest "before" of each edited answer).
  const original = Object.fromEntries(Object.entries(data.results).map(([k, v]) => [k, { ...v }]));
  for (const hst of data.history) {
    if (hst.coll === "results" && original[hst.itemId] && !original[hst.itemId]._restored) {
      Object.assign(original[hst.itemId], hst.before, { _restored: true });
    }
  }
  const fpOk = sub.status === "submitted" ? (await fingerprint(areaId, sub.revision, original)) === sub.fingerprint : null;
  const itemText = (id) => itemsFor(areaId, S.extras, { includeRetired: true }).find((i) => i.id === id)?.text || id;
  const review = S.reviews[sub.id];
  const isLatest = sub.revision === revs[0].revision;

  // Built-in items + checks you added (answered in this revision, answered later as an
  // added check, or still to do). Removed checks show only if someone answered them.
  const rows = itemsFor(areaId, S.extras, { includeRetired: true })
    .filter((i) => !i.extra || i.active || data.results[i.id] || data.supp[i.id])
    .map((i) => {
      const r = data.results[i.id];
      const sp = data.supp[i.id];
      const x = r || sp;
      const todo = !x && sub.status === "submitted";
      return h("tr", { class: x?.result === "defect" ? "defect" : todo ? "todo" : "" },
        h("td", {}, (i.extra || sp || todo) ? h("span", { class: "badge b-new" }, sp ? "Added check" : i.extra ? "Added by you" : "New check") : null, " ", i.text),
        h("td", {}, x ? RESULT_LABEL[x.result] : todo ? "To do" : "—"),
        h("td", {}, x?.note || "", thumbs(data.photos.filter((p) => p.itemId === i.id && !p.addendumId))),
        h("td", { class: "small muted" }, r ? `${r.byName}, ${fmt(r.updatedAt)}` : sp ? `${sp.byName}, ${fmt(sp.at)} — certified by ${sp.certName} (${sp.certRole})` : "",
          x?.edits ? h("div", { class: "warn-text" }, `Edited by ${x.editedByName}, ${fmt(x.editedAt)}${x.edits > 1 ? ` (${x.edits} changes)` : ""}`) : null));
    });

  const actions = h("div", { class: "row noprint" },
    revs.length > 1 ? h("select", { onchange: (e) => detail(areaId, Number(e.target.value)) },
      ...revs.map((s) => h("option", { value: s.revision, selected: s.revision === sub.revision }, `Revision ${s.revision} (${s.status})`))) : null,
    sub.status === "submitted" && isLatest && review?.decision !== "accepted"
      ? h("button", { class: "primary", onclick: () => decide(sub, "accepted") }, "Accept") : null,
    sub.status === "submitted" && isLatest
      ? h("button", { onclick: () => reopen(sub, true), title: "Back to the builders with their answers kept" }, "Undo submission") : null,
    sub.status === "submitted" && isLatest
      ? h("button", { onclick: () => reopen(sub, false), title: "Back to the builders with nothing filled in" }, "Reopen blank") : null,
    h("button", { onclick: () => window.print() }, "Print / PDF"));

  render(nav(), back,
    h("h2", {}, a.name, ` — revision ${sub.revision}`),
    data.problems.length ? h("div", { class: "card error" },
      h("b", {}, `Some of this room couldn't be loaded: ${data.problems.join(", ")}.`),
      h("p", {}, /permission-denied/.test(data.problems.join())
        ? "Firebase refused it, which almost always means the latest security rules haven't been published. Copy firestore.rules from GitHub into Firestore Database → Rules and click Publish (and storage.rules into Storage → Rules), then reload this page."
        : "Check your connection and reload the page.")) : null,
    h("p", {}, statusBadge(sub.status !== "submitted" ? "draft" : !isLatest ? "submitted" : S.outstanding[areaId]?.length ? "partial" : "complete"),
      isLatest && S.outstanding[areaId]?.length ? h("span", { class: "badge b-new" }, `${S.outstanding[areaId].length} to do`) : null, review ? h("span", { class: `badge b-${review.decision}` }, review.decision) : null),
    sub.reopenReason ? h("p", { class: "warn" }, `Reopened ${fmt(sub.reopenedAt)}: ${sub.reopenReason}`) : null,
    sub.status === "submitted" ? h("div", { class: "card" },
      h("p", {}, h("b", {}, "Certified by: "), `${sub.certName} (${sub.certRole}), signed in as ${sub.submittedByName}, ${fmt(sub.submittedAt)}`),
      h("p", { class: "small" }, "Fingerprint ", h("code", {}, (sub.fingerprint || "").slice(0, 16) + "…"), " ",
        fpOk ? h("span", { class: "ok-text" }, "matches the answers as certified") : h("span", { class: "warn-text" }, "does NOT match — the recorded answers differ from what was certified"),
        data.history.length ? h("span", {}, ` · ${data.history.length} change${data.history.length > 1 ? "s" : ""} made since — see Change history below`) : null),
      review?.comment ? h("p", {}, h("b", {}, "Your comment: "), review.comment) : null) : null,
    actions,
    h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Check"), h("th", {}, "Result"), h("th", {}, "Note / photos"), h("th", {}, "By"))), h("tbody", {}, ...rows)),
    h("h3", {}, "Change history"),
    data.history.length || data.removedPhotos.length
      ? h("table", {}, h("thead", {}, h("tr", {}, ...["When", "Who", "Check", "Before", "After"].map((x) => h("th", {}, x)))),
        h("tbody", {},
          ...data.history.map((x) => h("tr", {},
            h("td", { class: "small" }, fmt(x.at)), h("td", {}, x.byName), h("td", {}, itemText(x.itemId)),
            h("td", {}, RESULT_LABEL[x.before.result], x.before.note ? h("div", { class: "muted small" }, x.before.note) : null),
            h("td", {}, RESULT_LABEL[x.after.result], x.after.note ? h("div", { class: "muted small" }, x.after.note) : null))),
          ...data.removedPhotos.map((p) => h("tr", {},
            h("td", { class: "small" }, fmt(p.removedAt)), h("td", {}, p.removedByName), h("td", {}, p.itemId ? itemText(p.itemId) : "Photo on a note"),
            h("td", {}, h("div", { class: "removed" }, thumbs([p]))), h("td", {}, "Photo removed")))))
      : h("p", { class: "muted" }, "No changes since submission."),
    h("h3", {}, "Added after submission"),
    data.addenda.length || data.photos.some((p) => p.addendumId)
      ? h("div", {}, ...data.addenda.map((ad) => h("div", { class: "card small" },
        h("b", {}, ad.byName), ` · ${fmt(ad.createdAt)}`,
        ad.itemId ? h("div", { class: "muted" }, itemsFor(areaId, S.extras, { includeRetired: true }).find((i) => i.id === ad.itemId)?.text || "") : null,
        h("p", {}, ad.text), thumbs(data.photos.filter((p) => p.addendumId === ad.id)))),
      thumbs(data.photos.filter((p) => p.addendumId && !data.addenda.some((ad) => ad.id === p.addendumId))))
      : h("p", { class: "muted" }, "Nothing yet."),
    thumbs(data.photos.filter((p) => !p.itemId && !p.addendumId)));
}

async function decide(sub, decision, comment = "") {
  if (decision === "accepted") comment = prompt("Optional comment for the record:", "") ?? null;
  if (comment === null) return;
  await setDoc(doc(collection(db, "reviews")), { submissionId: sub.id, decision, comment, at: serverTimestamp() });
  toast(decision === "accepted" ? "Accepted." : "Recorded.");
  detail(sub.areaId);
}

// Undo a submission: the area goes back to the builders as a new draft revision.
// keep = true copies every answer (including answers to added checks) into it, so the
// builders only change what needs fixing. The certified revision is never altered.
async function reopen(sub, keep) {
  const reason = prompt(keep
    ? "Undo this submission. What should the builders fix? (They will see this.)"
    : "Reopen from blank. Why? (The builders will see this.)");
  if (!reason || !reason.trim()) return;
  const rev = sub.revision + 1;
  const newSid = subId(sub.areaId, rev);
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "submissions", newSid), {
      areaId: sub.areaId, revision: rev, status: "draft", checklistVersion: CHECKLIST_VERSION,
      reopenReason: reason.trim(), reopenedAt: serverTimestamp(),
    });
    let copied = 0;
    if (keep) {
      const [res, sup] = await Promise.all([
        getDocs(collection(db, "submissions", sub.id, "results")),
        getDocs(collection(db, "submissions", sub.id, "supplements")),
      ]);
      for (const d of [...res.docs, ...sup.docs]) {
        const r = d.data();
        batch.set(doc(db, "submissions", newSid, "results", d.id), {
          result: r.result, note: r.note || "", by: r.by, byName: r.byName,
          updatedAt: serverTimestamp(), copiedFrom: sub.id,
        });
        copied++;
      }
    }
    batch.set(doc(collection(db, "reviews")), { submissionId: sub.id, decision: "reopened", comment: reason.trim(), at: serverTimestamp() });
    await batch.commit();
    toast(keep ? `Submission undone: ${copied} answers kept for the builders to edit.` : "Reopened from blank.");
    detail(sub.areaId);
  } catch (e) { toast("Could not reopen: " + (e.code || e.message)); }
}

// ---------- Defects ----------
async function defects() {
  try { await defectsInner(); } catch (e) {
    console.error(e);
    render(nav(), h("div", { class: "card error" }, h("b", {}, "The defects list couldn't be loaded."),
      h("p", {}, /permission/.test(e.code || "")
        ? "Firebase refused it — publish the latest firestore.rules and storage.rules, then reload."
        : `${e.code || e.message}. Reload the page and try again.`)));
  }
}

async function defectsInner() {
  render(nav(), h("p", { class: "muted" }, "Loading defects and photos…"));
  // Latest submitted revision per area (a reopened draft keeps showing the last certified defects).
  const latest = Object.values(latestByArea(S.subs.filter((x) => x.status === "submitted")));
  const found = [];
  await Promise.all(latest.map(async (s) => {
    for (const coll of ["results", "supplements"]) {
      const qs = await getDocs(query(collection(db, "submissions", s.id, coll), where("result", "==", "defect")));
      qs.docs.forEach((d) => found.push({ sub: s, itemId: d.id, ...d.data(), when: d.data().updatedAt || d.data().at }));
    }
  }));
  // Photos and later notes for the rooms that have defects.
  const media = {};
  await Promise.all([...new Set(found.map((f) => f.sub.id))].map(async (sid) => {
    const [ph, ad] = await Promise.all([
      getDocs(collection(db, "submissions", sid, "photos")),
      getDocs(collection(db, "submissions", sid, "addenda")),
    ]);
    const photos = ph.docs.map((d) => ({ id: d.id, ...d.data() }));
    media[sid] = { photos: photos.filter((p) => !p.removed), addenda: ad.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }));
  const track = {};
  (await getDocs(collection(db, "defects"))).docs.forEach((d) => { track[d.id] = d.data(); });
  found.sort((x, y) => AREAS.indexOf(AREA_BY_ID[x.sub.areaId]) - AREAS.indexOf(AREA_BY_ID[y.sub.areaId]));
  const isClosed = (f) => !!track[`${f.sub.id}__${f.itemId}`]?.closed;
  const open = found.filter((f) => !isClosed(f)).length;
  S.showClosed ??= false;
  const shown = found.filter((f) => S.showClosed || !isClosed(f));

  const bigPhotos = (list) => list.length ? h("div", { class: "defect-photos" }, ...list.map((p) =>
    h("figure", {}, photoLink(p.path, { thumb: false }), h("figcaption", {}, `${p.byName} · taken ${fmt(p.takenAt)}`)))) : h("p", { class: "muted small" }, "No photo.");

  const cards = shown.map((f, n) => {
    const key = `${f.sub.id}__${f.itemId}`;
    const t = track[key] || {};
    const a = AREA_BY_ID[f.sub.areaId];
    const m = media[f.sub.id] || { photos: [], addenda: [] };
    const text = itemsFor(a.id, S.extras, { includeRetired: true }).find((i) => i.id === f.itemId)?.text || f.itemId;
    const later = m.addenda.filter((ad) => ad.itemId === f.itemId).sort((x, y) => (x.createdAt?.seconds || 0) - (y.createdAt?.seconds || 0));
    const save = (patch) => setDoc(doc(db, "defects", key), { ...patch, updatedAt: serverTimestamp() }, { merge: true }).catch((e) => toast(e.code));
    return h("div", { class: `card defect-card${t.closed ? " closed" : ""}` },
      h("div", { class: "defect-head" },
        h("b", {}, `${n + 1}. ${a.name}`), h("span", { class: "muted small" }, ` · ${GROUPS.find((g) => g.id === a.group).name}`),
        h("span", { class: `badge ${t.closed ? "b-complete" : "b-reopened"}` }, t.closed ? "Closed" : "Open")),
      h("p", { class: "defect-text" }, text),
      h("p", {}, h("b", {}, "Builder's note: "), f.note, h("span", { class: "muted small" }, ` — ${f.byName}, ${fmt(f.when)}`),
        f.edits ? h("span", { class: "warn-text small" }, ` · edited by ${f.editedByName}, ${fmt(f.editedAt)}`) : null),
      bigPhotos(m.photos.filter((p) => p.itemId === f.itemId && !p.addendumId)),
      ...later.map((ad) => h("div", { class: "later" },
        h("p", {}, h("b", {}, "Later note: "), ad.text, h("span", { class: "muted small" }, ` — ${ad.byName}, ${fmt(ad.createdAt)}`)),
        bigPhotos(m.photos.filter((p) => p.addendumId === ad.id)))),
      h("p", { class: "print-only" }, `Fix by: ${t.fixBy || "—"} · ${t.closed ? "Closed" : "Open"}${t.comment ? ` · ${t.comment}` : ""}`),
      h("div", { class: "row noprint" },
        h("label", {}, "Fix by ", h("input", { type: "date", value: t.fixBy || "", onchange: (e) => save({ fixBy: e.target.value }) })),
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!t.closed, onchange: (e) => save({ closed: e.target.checked }).then(defects) }), " Closed"),
        h("input", { value: t.comment || "", placeholder: "Comment", onchange: (e) => save({ comment: e.target.value }) })));
  });

  render(nav(),
    h("div", { class: "row noprint" },
      h("p", {}, `${found.length} defects recorded, ${open} open.`),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: S.showClosed, onchange: (e) => { S.showClosed = e.target.checked; defects(); } }), " Show closed"),
      h("button", { onclick: () => window.print() }, "Print / PDF")),
    h("h2", { class: "print-only" }, `Defects list — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} — ${S.showClosed ? "all" : "open"} defects (${shown.length})`),
    ...(shown.length ? cards : [h("p", { class: "muted" }, found.length ? "No open defects." : "No defects recorded.")]));
}

// ---------- Code word ----------
async function access() {
  const sessions = (await getDocs(collection(db, "sessions"))).docs.map((d) => d.data())
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const now = Date.now();
  const issue = h("button", { class: "primary" }, "Issue new code word");
  const shown = h("div");
  const showCode = ({ code, expires }) => shown.replaceChildren(h("div", { class: "card ok" },
    h("p", {}, "New code word (shown only until you leave this page — copy it now):"),
    h("p", { class: "code" }, code),
    h("p", {}, `Valid until ${fmt(expires)}.`),
    h("button", { onclick: () => navigator.clipboard.writeText(code).then(() => toast("Copied.")) }, "Copy")));
  if (S.lastCode) showCode(S.lastCode);
  issue.addEventListener("click", async () => {
    const code = newCode();
    const hash = await sha256(normCode(code));
    const expires = new Date(now + CODE_VALID_DAYS * 864e5);
    try {
      await setDoc(doc(db, "codes", hash), {
        hint: `${code.split("-")[0]}…${code.slice(-2)}`, issuedAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expires), revoked: false,
      });
      S.lastCode = { code, expires };
      showCode(S.lastCode);
    } catch (e) { toast("Could not issue: " + e.code); }
  });
  const codeRows = S.codes.map((c) => {
    const live = !c.revoked && c.expiresAt?.toMillis() > now;
    return h("tr", {},
      h("td", {}, c.hint), h("td", {}, fmt(c.issuedAt)), h("td", {}, fmt(c.expiresAt)),
      h("td", {}, c.revoked ? "Revoked" : live ? "Active" : "Expired"),
      h("td", {}, live ? h("button", {
        onclick: async () => { if (confirm("Revoke this code word? Everyone using it is signed out.")) await updateDoc(doc(db, "codes", c.id), { revoked: true }); },
      }, "Revoke") : ""));
  });
  const hintOf = Object.fromEntries(S.codes.map((c) => [c.id, c.hint]));
  render(nav(),
    h("p", {}, `Builders sign in with a code word you issue here. Each code works for ${CODE_VALID_DAYS} days from issue. Issuing a new one does not cancel the old one — revoke it if needed.`),
    issue, shown,
    h("h3", {}, "Code words"),
    h("table", {}, h("thead", {}, h("tr", {}, ...["Code", "Issued", "Expires", "Status", ""].map((x) => h("th", {}, x)))), h("tbody", {}, ...codeRows)),
    h("h3", {}, "Sign-ins"),
    h("table", {}, h("thead", {}, h("tr", {}, ...["Name", "When", "Code", "Device"].map((x) => h("th", {}, x)))),
      h("tbody", {}, ...sessions.map((s) => h("tr", {}, h("td", {}, s.name), h("td", {}, fmt(s.createdAt)), h("td", {}, hintOf[s.codeHash] || "?"), h("td", { class: "small muted" }, (s.deviceId || "").slice(0, 8)))))));
}

// ---------- Export ----------
function exportTab() {
  const btn = h("button", { class: "primary" }, "Download all results (CSV)");
  btn.addEventListener("click", async () => {
    btn.disabled = true; btn.textContent = "Preparing…";
    const lines = [["Group", "Area", "Revision", "Status", "Item", "Result", "Note", "Checked by", "Checked at", "Certified by", "Role", "Submitted at"]];
    for (const a of AREAS) {
      for (const s of S.subs.filter((x) => x.areaId === a.id).sort((x, y) => x.revision - y.revision)) {
        const res = Object.fromEntries((await getDocs(collection(db, "submissions", s.id, "results"))).docs.map((d) => [d.id, d.data()]));
        const sup = Object.fromEntries((await getDocs(collection(db, "submissions", s.id, "supplements"))).docs.map((d) => [d.id, d.data()]));
        for (const i of itemsFor(a.id, S.extras, { includeRetired: true })) {
          if (i.extra && !i.active && !res[i.id] && !sup[i.id]) continue;
          if (sup[i.id]) {
            const r = sup[i.id];
            lines.push([GROUPS.find((g) => g.id === a.group).name, a.name, s.revision, s.status, `[Added check] ${i.text}`, RESULT_LABEL[r.result], r.note || "", r.byName, fmt(r.at), r.certName, r.certRole, fmt(r.at)]);
            continue;
          }
          const r = res[i.id] || {};
          lines.push([GROUPS.find((g) => g.id === a.group).name, a.name, s.revision, s.status, (i.extra ? "[Added check] " : "") + i.text, RESULT_LABEL[r.result] || "", r.note || "", r.byName || "", fmt(r.updatedAt), s.certName || "", s.certRole || "", fmt(s.submittedAt)]);
        }
      }
    }
    const csv = lines.map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    h("a", { href: url, download: `handover-results-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    btn.disabled = false; btn.textContent = "Download all results (CSV)";
  });
  render(nav(), h("div", { class: "card" },
    h("p", {}, "One row per checklist item per area revision, with notes, who checked it and the certification."), btn,
    h("p", { class: "muted small" }, "For a PDF of an area, open it from Progress and use Print / PDF. Photos can be downloaded in bulk from Firebase console → Storage.")));
}

// ---------- Checklist: add your own checks at any time ----------
function checklistTab() {
  const target = h("select", {},
    h("optgroup", { label: "Several areas at once" }, ...TARGETS.map((t) => h("option", { value: t.id }, t.name))),
    ...GROUPS.map((g) => h("optgroup", { label: g.name }, ...AREAS.filter((a) => a.group === g.id).map((a) => h("option", { value: a.id }, a.name)))));
  const text = h("textarea", { rows: 2, placeholder: "e.g. Towel radiator heats up and has no leaks" });
  const needNote = h("input", { type: "checkbox" });
  const add = h("button", { class: "primary" }, "Add check");
  add.addEventListener("click", async () => {
    const t = text.value.trim();
    if (t.length < 4) return toast("Describe the check first.");
    const areas = areasForTarget(target.value);
    if (!confirm(`Add this check to ${areas.length} area${areas.length > 1 ? "s" : ""}?`)) return;
    add.disabled = true;
    try {
      const batch = writeBatch(db);
      areas.forEach((a) => batch.set(doc(collection(db, "extraItems")), {
        areaId: a.id, text: t, noteRequired: needNote.checked, active: true, createdAt: serverTimestamp(),
      }));
      await batch.commit();
      text.value = ""; needNote.checked = false;
      toast(`Added to ${areas.length} area${areas.length > 1 ? "s" : ""}.`);
    } catch (e) { toast("Could not add: " + e.code); }
    add.disabled = false;
  });

  const byArea = {};
  S.extras.forEach((x) => (byArea[x.areaId] ||= []).push(x));
  const list = AREAS.filter((a) => byArea[a.id]).map((a) => h("div", { class: "card" },
    h("b", {}, a.name),
    h("ul", {}, ...byArea[a.id].sort((x, y) => (x.createdAt?.seconds || 0) - (y.createdAt?.seconds || 0)).map((x) => h("li", { class: x.active ? "" : "muted" },
      x.text, x.noteRequired ? " (note required)" : "", h("span", { class: "muted small" }, ` · added ${fmt(x.createdAt)}`),
      x.active
        ? h("button", { class: "link", onclick: async () => { if (confirm("Remove this check? Answers already given are kept.")) await updateDoc(doc(db, "extraItems", x.id), { active: false }); } }, " Remove")
        : " · removed")))));

  render(nav(),
    h("div", { class: "card" },
      h("h3", {}, "Add a check"),
      h("p", { class: "muted small" }, "It appears straight away on the builders' phones. In areas not yet submitted it becomes part of the normal list. In areas already submitted it shows as a new check: the builders answer and certify it separately, and the original answers stay locked."),
      h("label", {}, "Add to"), target,
      h("label", {}, "Check"), text,
      h("label", { class: "check" }, needNote, " Builder must write a note (e.g. a reading or count)"),
      add),
    h("h3", {}, `Checks you have added (${S.extras.filter((x) => x.active).length})`),
    list.length ? h("div", {}, ...list) : h("p", { class: "muted" }, "None yet. The built-in checklist has " + AREAS.reduce((n, a) => n + a.items.length, 0) + " checks across " + AREAS.length + " areas."));
}
