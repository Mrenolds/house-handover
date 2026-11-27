# House handover app

A mobile web app for the builders to go through the house handover room by room,
certify each area and submit it. Submitted areas are locked by the database;
afterwards the builders can only add notes and photos. Only the owner can see
the results dashboard.

- **Builder app:** `index.html` — sign in with a code word, check items (Pass / Defect / N/A),
  add notes and photos, certify and submit. Works offline once opened; photos upload when there is signal.
- **Owner dashboard:** `owner.html` — progress by floor, area detail with photos, accept or reopen,
  defects list with fix dates, code words, CSV export, print to PDF.
- **Security:** `firestore.rules` and `storage.rules` enforce who can read and write what.

The checklist (55 areas, from the floor plans and the revised handover checklist) is in `js/checklist.js`.

## One-time setup (about 20 minutes, on a computer)

### 1. Firebase project
1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project (or use an existing one dedicated to this).
2. **Upgrade to Blaze** (needed for photo storage). Then in Google Cloud Billing → Budgets, set a budget of £1 with email alerts.
3. **Security → Authentication → Get started.** Enable two sign-in providers:
   - **Anonymous** (used by the builders, together with the code word)
   - **Google** (used by you for the dashboard)
4. **Authentication → Settings → Authorized domains → Add domain:** `mrenolds.github.io`
5. **Databases & Storage → Firestore Database → Create database** → Standard edition, production mode, location `europe-west2` (London).
6. **Databases & Storage → Storage → Get started** → location **US-EAST1** (only US-CENTRAL1, US-EAST1 and US-WEST1 get the "Always Free" storage allowance), production mode.

### 2. Put your owner email into the code (3 places)
Use the Google account you will sign in with on the dashboard, in lower case.
- `js/config.js` → `OWNER_EMAIL`
- `firestore.rules` → `PASTE_OWNER_EMAIL@gmail.com`
- `storage.rules` → `PASTE_OWNER_EMAIL@gmail.com`

### 3. Paste the Firebase web config
Firebase console → ⚙ Project settings → General → Your apps → **Add app → Web** (no hosting needed).
Copy the `firebaseConfig` values into `js/config.js`. These values are not secret.

### 4. Publish the security rules
Either paste them in the console:
- Firestore Database → **Rules** tab → replace everything with the contents of `firestore.rules` → **Publish**
- Storage → **Rules** tab → replace with `storage.rules` → **Publish**. If the console asks to
  grant Storage permission to read Firestore (the photo rules check the code word), click **Grant**.

or, with the Firebase CLI: `firebase deploy --only firestore:rules,storage`

### 5. Turn on GitHub Pages
GitHub → this repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch `main`, folder `/ (root)` → Save.
After a minute the app is live at:
- Builders: `https://mrenolds.github.io/house-handover/`
- You: `https://mrenolds.github.io/house-handover/owner.html`

### 6. Recommended hardening
- Turn on 2-step verification on your Google account (it protects the dashboard).
- Firebase console → **App Check** → register the web app with reCAPTCHA Enterprise and enforce it for
  Firestore and Storage. This stops scripts outside the app from even trying code words.

## Running the handover
1. Open `owner.html`, sign in with Google, go to **Code word → Issue new code word**. Copy it (it is shown only once).
2. Send the team the app link and the code word, ideally in two separate messages.
3. Each person signs in with their name and the code word. The code works for 10 days from issue;
   issue a new one to extend, or **Revoke** to cut access immediately.
4. Watch progress on the dashboard. **Accept** an area when you're happy, or **Reopen** it with a reason —
   that creates revision 2 for the builders; revision 1 stays as it was certified.
5. Track fixes on the **Defects** tab (fix-by date, closed, comment). Export everything as CSV, and use
   **Print / PDF** on any area for a signed record.

## How the locking works
| Rule | Enforced by |
| --- | --- |
| Only people with a live (unexpired, unrevoked) code word can write | `isBuilder()` in both rule files, checked on every request |
| Answers can change only while the area is a draft | `results` rule checks the parent submission's status |
| Submitting is one-way and records who, when, and a SHA-256 fingerprint of the answers | `submissions` update rule; the dashboard re-checks the fingerprint |
| Nothing can be deleted; notes and photos after submission are append-only | `delete: if false`, no update rules on addenda/photos, storage `create` only |
| Reopening never edits the certified revision | owner creates revision n+1 only after revision n is submitted |
| Builders cannot view photos or other people's sign-ins | storage `read` is owner-only; sessions readable by their owner only |

Only someone signed into the Firebase console as project owner can bypass the rules, so protect that Google account with 2-step verification.

## Changing the checklist
Edit `js/checklist.js`. Rewording items is fine at any time. Do **not** change area or item ids, or
`CHECKLIST_VERSION`, once builders have started — drafts are keyed on them. After editing, bump `CACHE`
in `sw.js` (e.g. `handover-v2`) so phones pick up the new files.
