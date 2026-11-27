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
  fingerprint, statusBadge, RESULT_LABEL, itemsFor, outstandingItems, APP_VERSION,
} from "./common.js";
import { GROUPS, AREA_BY_ID, CHECKLIST_VERSION, TARGETS, areasForTarget } from "./checklist.js";
import { OWNER_EMAIL, CODE_VALID_DAYS } from "./config.js";

const root = document.getElementById("app");
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
    else if (S.tab === "detail" && S.detailArgs) detail(S.detailArgs[0]);
  }, (e) => toast("Can't read data: " + e.code)));
  S.unsub.push(onSnapshot(collection(db, "reviews"), (qs) => {
    const m = {};
    qs.docs.map((d) => d.data()).sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0)).forEach((r) => { m[r.submissionId] = r; });
    S.reviews = m;
    if (S.tab === "progress") draw();
    else if (S.tab === "detail" && S.detailArgs) detail(...S.detailArgs);
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
    await Promise.all(AREAS.map(async (a) => {
      const sub = S.latest[a.id];
      if (!sub || sub.status !== "submitted") return;
      // A submitted revision's answers never change, so cache them.
      S.resultIds[sub.id] ||= new Set((await getDocs(collection(db, "submissions", sub.id, "results"))).docs.map((d) => d.id));
      const supp = new Set((await getDocs(collection(db, "submissions", sub.id, "supplements"))).docs.map((d) => d.id));
      const list = outstandingItems(a.id, S.extras, sub, S.resultIds[sub.id], supp);
      if (list.length) out[a.id] = list;
    }));
    S.outstanding = out;
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
  const st = (a) => S.latest[a.id]?.status || "none";
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
  const stat = (label, val) => h("div", { class: "stat" }, h("b", {}, val), h("span", {}, label));
  render(nav(),
    h("div", { class: "stats" },
      stat("submitted", `${n("submitted")} / ${AREAS.length}`), stat("in progress", n("draft")), stat("not started", n("none")),
      stat("accepted by you", accepted), stat("new checks to do", newChecks)),
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
          h("span", {}, statusBadge(s ? s.status : "none"),
            rv?.decision === "accepted" ? h("span", { class: "badge b-accepted" }, "Accepted") : null,
            nc ? h("span", { class: "badge b-new" }, `${nc} new check${nc > 1 ? "s" : ""} to do`) : null));
      }))));
}

async function loadSub(sid) {
  const [res, ph, ad, sp] = await Promise.all([
    getDocs(collection(db, "submissions", sid, "results")),
    getDocs(collection(db, "submissions", sid, "photos")),
    getDocs(collection(db, "submissions", sid, "addenda")),
    getDocs(collection(db, "submissions", sid, "supplements")),
  ]);
  const photos = await Promise.all(ph.docs.map(async (d) => {
    const p = d.data();
    let url = null;
    try { url = await getDownloadURL(ref(storage, p.path)); } catch { /* still uploading */ }
    return { id: d.id, ...p, url };
  }));
  return {
    results: Object.fromEntries(res.docs.map((d) => [d.id, d.data()])),
    supp: Object.fromEntries(sp.docs.map((d) => [d.id, d.data()])),
    photos,
    addenda: ad.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)),
  };
}

const thumbs = (list) => list.length ? h("div", { class: "thumbs" }, ...list.map((p) => p.url
  ? h("a", { href: p.url, target: "_blank" }, h("img", { src: p.url, alt: "", loading: "lazy", title: `${p.byName} · ${p.source} · taken ${fmt(p.takenAt)}` }))
  : h("span", { class: "muted small" }, "(uploading)"))) : null;

async function detail(areaId, rev) {
  S.tab = "detail";
  S.detailArgs = [areaId, rev];
  const a = AREA_BY_ID[areaId];
  const revs = S.subs.filter((s) => s.areaId === areaId).sort((x, y) => y.revision - x.revision);
  const sub = rev ? revs.find((s) => s.revision === rev) : revs[0];
  const back = h("button", { class: "link noprint", onclick: () => { S.tab = "progress"; draw(); } }, "‹ Back");
  if (!sub) return render(nav(), back, h("h2", {}, a.name), h("p", {}, "Not started."));
  render(nav(), back, h("h2", {}, a.name), h("p", { class: "muted" }, "Loading…"));
  const data = await loadSub(sub.id);
  const fpOk = sub.status === "submitted" ? (await fingerprint(areaId, sub.revision, data.results)) === sub.fingerprint : null;
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
        h("td", { class: "small muted" }, r ? `${r.byName}, ${fmt(r.updatedAt)}` : sp ? `${sp.byName}, ${fmt(sp.at)} — certified by ${sp.certName} (${sp.certRole})` : ""));
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
    h("p", {}, statusBadge(sub.status), review ? h("span", { class: `badge b-${review.decision}` }, review.decision) : null),
    sub.reopenReason ? h("p", { class: "warn" }, `Reopened ${fmt(sub.reopenedAt)}: ${sub.reopenReason}`) : null,
    sub.status === "submitted" ? h("div", { class: "card" },
      h("p", {}, h("b", {}, "Certified by: "), `${sub.certName} (${sub.certRole}), signed in as ${sub.submittedByName}, ${fmt(sub.submittedAt)}`),
      h("p", { class: "small" }, "Fingerprint ", h("code", {}, (sub.fingerprint || "").slice(0, 16) + "…"), " ",
        fpOk ? h("span", { class: "ok-text" }, "matches the recorded answers") : h("span", { class: "warn-text" }, "does NOT match — answers differ from what was certified")),
      review?.comment ? h("p", {}, h("b", {}, "Your comment: "), review.comment) : null) : null,
    actions,
    h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Check"), h("th", {}, "Result"), h("th", {}, "Note / photos"), h("th", {}, "By"))), h("tbody", {}, ...rows)),
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
  render(nav(), h("p", { class: "muted" }, "Loading defects…"));
  // Latest submitted revision per area (a reopened draft keeps showing the last certified defects).
  const latest = Object.values(latestByArea(S.subs.filter((x) => x.status === "submitted")));
  const found = [];
  await Promise.all(latest.map(async (s) => {
    for (const coll of ["results", "supplements"]) {
      const qs = await getDocs(query(collection(db, "submissions", s.id, coll), where("result", "==", "defect")));
      qs.docs.forEach((d) => found.push({ sub: s, itemId: d.id, ...d.data() }));
    }
  }));
  const track = {};
  (await getDocs(collection(db, "defects"))).docs.forEach((d) => { track[d.id] = d.data(); });
  found.sort((x, y) => AREAS.indexOf(AREA_BY_ID[x.sub.areaId]) - AREAS.indexOf(AREA_BY_ID[y.sub.areaId]));
  const open = found.filter((f) => !track[`${f.sub.id}__${f.itemId}`]?.closed).length;
  const rows = found.map((f, n) => {
    const key = `${f.sub.id}__${f.itemId}`;
    const t = track[key] || {};
    const a = AREA_BY_ID[f.sub.areaId];
    const save = (patch) => setDoc(doc(db, "defects", key), { ...patch, updatedAt: serverTimestamp() }, { merge: true }).catch((e) => toast(e.code));
    return h("tr", { class: t.closed ? "closed" : "" },
      h("td", {}, n + 1),
      h("td", {}, h("button", { class: "link", onclick: () => detail(a.id, f.sub.revision) }, a.name)),
      h("td", {}, itemsFor(a.id, S.extras, { includeRetired: true }).find((i) => i.id === f.itemId)?.text || f.itemId, h("div", { class: "muted" }, `${f.note} — ${f.byName}`)),
      h("td", {}, h("input", { type: "date", value: t.fixBy || "", onchange: (e) => save({ fixBy: e.target.value }) })),
      h("td", {}, h("input", { type: "checkbox", checked: !!t.closed, onchange: (e) => save({ closed: e.target.checked }) })),
      h("td", {}, h("input", { value: t.comment || "", placeholder: "Comment", onchange: (e) => save({ comment: e.target.value }) })));
  });
  render(nav(),
    h("p", {}, `${found.length} defects recorded, ${open} open.`),
    h("table", {}, h("thead", {}, h("tr", {}, ...["#", "Area", "Defect", "Fix by", "Closed", "Comment"].map((x) => h("th", {}, x)))), h("tbody", {}, ...rows)));
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
