# ShowDrinks

Pre-order drinks for before, during, and after a show.

## Setup

### 1. Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) and create a project.
2. Enable **Cloud Firestore** (start in production mode).
3. Add a **Web App** to the project (Project Settings → General → Your apps).
4. Copy the config values into `firebase-config.js`.
5. Deploy the security rules in `firestore.rules` with `firebase deploy --only firestore:rules` —
   admin-only collections require `request.auth != null`, the customer-facing paths the PWA needs
   stay open to anonymous users.

### 2. Admin Login

1. Firebase Console → Authentication → Sign-in method → enable **Email/Password**.
2. Create the first admin login: Firebase Console → Authentication → Users → Add user (email + password).
3. Sign in at `admin.html` with that email/password. Once signed in you can add further admin
   logins from Settings & QR → Admin Users (this uses a secondary Firebase app instance so it
   doesn't sign you out in the process).
4. Removing a login still has to be done from Firebase Console → Authentication → Users — there's
   no in-app way to list/delete accounts (that needs a Cloud Function with the Admin SDK).
5. Forgot your password? Use "Forgot password?" on the login screen, or once signed in use
   "Change Password" in the header.

### 3. GitHub Pages

1. Push this repo to GitHub.
2. Go to repo Settings → Pages → Source: `main` branch, `/ (root)`.
3. Your site will be at `https://antonjung.github.io/showdrinks`.
4. In `admin.html` Settings tab, set the Site URL to this address and save.

### 4. PWA Icons

Convert `icons/icon.svg` to `icons/icon-192.png` and `icons/icon-512.png` using any SVG-to-PNG tool (e.g. [svgtopng.com](https://svgtopng.com)).

### 5. SumUp Payments (optional)

- Set payment mode to **Pay at Bar** to skip online payment (customers pay when they collect).
- For **SumUp Online Checkout**, enter your Merchant Code in Settings. A Firebase Cloud Function is required to securely create checkouts — `functions/` currently only has the email-sending function (see below); a similar one for SumUp isn't built yet.
- Settings & QR holds the **system default** payment settings. Each show can optionally override payment mode/merchant code/API key in its own Payment Settings section — leave a show's fields blank to fall back to the system default.

### 6. Show Tabs Email (Brevo SMTP)

The Show Tabs ✉ button sends real email via a Cloud Function (`functions/sendMemberEmail`), using
[Brevo](https://www.brevo.com) SMTP. Requires the **Blaze (pay-as-you-go)** plan — the free tier
comfortably covers this app's volume.

1. In Brevo: SMTP & API → SMTP tab → note your **SMTP login** and **SMTP key**, and make sure the
   "from" address you plan to use is a verified sender.
2. Set the secrets (run these yourself so the values never end up in chat/logs):
   ```
   firebase functions:secrets:set SMTP_USER
   firebase functions:secrets:set SMTP_PASS
   firebase functions:secrets:set SMTP_FROM
   ```
3. Deploy: `firebase deploy --only functions`.
4. Update a secret later: re-run the `secrets:set` command, then redeploy functions so it picks up
   the new value.

## Usage

### Admin (`admin.html`)

| Tab | What to do |
|-----|-----------|
| Show & Sessions | Add one or more shows, mark one as **Current** (used by the PWA), add dates (optional), configure before/interval/after sessions |
| Menu Items | Add drinks with prices |
| Locations | Add collection points (e.g. "Bar", "Foyer") |
| Orders | See all orders, mark as ready, assign collection location |
| Show Tabs | For cast/crew who order drinks and pay later — pick or add a member (with optional email), add drinks via the POS grid, view what each member has ordered and their running total, mark paid when they settle up, email a member their tab via the ✉ button, export all tab sales as CSV |
| Settings & QR | Set site URL, configure SumUp, edit the Show Tabs email template, generate QR code for customers |

### Customers (`index.html`)

1. Scan the QR code displayed in admin → Settings & QR.
2. Enter name → pick a session (Before/Interval/After Show) → choose drinks → confirm order.
3. Check back later to see if drinks are ready and where to collect.

## Local Testing

Serve the files with any static server, e.g.:

```
npx serve .
```

or Python:

```
python -m http.server 8080
```

Then open `http://localhost:8080/admin.html` for admin and `http://localhost:8080/` for the customer PWA.
