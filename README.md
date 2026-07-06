# ShowDrinks

Pre-order drinks for before, during, and after a show.

## Setup

### 1. Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) and create a project.
2. Enable **Cloud Firestore** (start in production mode).
3. Add a **Web App** to the project (Project Settings → General → Your apps).
4. Copy the config values into `firebase-config.js`.
5. In Firestore → Rules, set:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin config - readable by all, writable only from admin
    match /config/{doc} {
      allow read: if true;
      allow write: if true; // Tighten this with Firebase Auth for production
    }
    // Shows - multiple shows can exist, only one flagged isCurrent is used by the PWA
    match /shows/{id} {
      allow read: if true;
      allow write: if true;
    }
    // Menu items - read by all, write restricted
    match /menuItems/{id} {
      allow read: if true;
      allow write: if true;
    }
    // Locations - read by all
    match /locations/{id} {
      allow read: if true;
      allow write: if true;
    }
    // Orders - anyone can create/read their own
    match /orders/{id} {
      allow read, create, update: if true;
      allow delete: if false;
    }
  }
}
```

### 2. GitHub Pages

1. Push this repo to GitHub.
2. Go to repo Settings → Pages → Source: `main` branch, `/ (root)`.
3. Your site will be at `https://antonjung.github.io/showdrinks`.
4. In `admin.html` Settings tab, set the Site URL to this address and save.

### 3. PWA Icons

Convert `icons/icon.svg` to `icons/icon-192.png` and `icons/icon-512.png` using any SVG-to-PNG tool (e.g. [svgtopng.com](https://svgtopng.com)).

### 4. SumUp Payments (optional)

- Set payment mode to **Pay at Bar** to skip online payment (customers pay when they collect).
- For **SumUp Online Checkout**, enter your Merchant Code in Settings. A Firebase Cloud Function is required to securely create checkouts — see `functions/` (not yet included).
- Settings & QR holds the **system default** payment settings. Each show can optionally override payment mode/merchant code/API key in its own Payment Settings section — leave a show's fields blank to fall back to the system default.

## Usage

### Admin (`admin.html`)

| Tab | What to do |
|-----|-----------|
| Show & Sessions | Add one or more shows, mark one as **Current** (used by the PWA), add dates (optional), configure before/interval/after sessions and cut-off times |
| Menu Items | Add drinks with prices |
| Locations | Add collection points (e.g. "Bar", "Foyer") |
| Orders | See all orders, mark as ready, assign collection location |
| Settings & QR | Set site URL, configure SumUp, generate QR code for customers |

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
