# StripLoop: Destroy. Recover. Prove.

Working prototype for **Sankalp by Satin Finserv: The Climate Edition** (Students Track, Circular Economy).

StripLoop follows every sealed bin of medicine packaging (blister packs, strips, cartons and hospital vials) from the chemist counter or factory line to shredded aluminium and plastic. Every handover is sealed, weighed and written to a hash-linked ledger. Pharma companies get certificates they can audit, and Satin Finserv sees verified kilograms behind every green loan.

All names of people, shops, hospitals and companies in the demo data are fictional.

## What is inside

| Screen | Who uses it | What works |
|---|---|---|
| Overview | Jury | Runs one bin through the whole chain live, step by step, ending in a certificate with QR |
| Collector (mobile) | Women collectors | Today's route, scan bin QR (real phone camera on Chrome for Android), seal check, weight keypad, photo, GPS, earnings, Satin loan, UPI log, offline queue, English, Hindi and Gujarati |
| Aggregation point | Local MSMEs | Intake with automatic weight check, reconciliation table, sealed bales with printable QR labels, dispatch notes |
| Hub operator | Women-led hub | Seal audit at receiving (broken seals hold the bale), shredding batches with mass balance, certificates, exceptions queue, vial protocol, branded resale block |
| Client portal | Factory QA, hospital pharmacy | Book pickups, live chain of custody per bin, certificates, CSV audit packs for GMP and BRSR |
| StripLoop admin | Network control room | Rate card, tolerance, rules, reconciliation engine, certificate issuing, ledger verify and tamper test |
| Satin desk | Satin credit officer | Loan book across hub, MSMEs and collectors, repayment cover (DSCR), covenants, risk flags, live stress test, green lending claim |
| Impact | Everyone | Tonnes recovered, CO2e avoided, women's income, MSMEs financed |
| Certificate check | Anyone with the QR | Public page that re-checks the certificate against the ledger |

Each screen is labelled honestly as **Working demo**, **Clickable mockup** or **Planned roadmap**.

## How it is built

* **Backend:** Node.js and Express (`server/`). In-memory data with a SHA-256 hash-chained event log. Business rules (seal checks, weight gap tolerance, mass balance, branded resale block, vial protocol, certificate issue, loan maths) live in `server/services.js`. Live updates are pushed to every open screen with Server-Sent Events.
* **Frontend:** React, Vite, Tailwind CSS, Recharts, Lucide icons, QR codes (`client/`).
* One web service serves both the API and the website.

Demo data reloads every time the server starts, and every 24 hours. The **Reset demo** button reloads it at any time.

## Run it on your computer

You need Node.js 18 or newer.

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000

Backend self-test: `npm test`

## Put it on GitHub

1. Unzip this folder.
2. On github.com, click **New repository**, give it a name (for example `striploop-prototype`), keep it **Public**, and click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Drag in everything inside the unzipped folder (the `client` and `server` folders and all the files next to them). Do not upload a `node_modules` folder.
5. Click **Commit changes**.

## Get a live link on Render

1. Sign in at https://render.com with your GitHub account.
2. Click **New** and then **Web Service**, and pick your `striploop-prototype` repository.
3. Use these settings (Render usually fills them from `render.yaml`):
   * Runtime: **Node**
   * Build command: `npm install && npm run build`
   * Start command: `npm start`
   * Instance type: **Free**
4. Click **Create Web Service**. The first build takes 3 to 5 minutes.
5. Your link looks like `https://striploop-prototype.onrender.com`. Put it in the PPT.

Alternative: click **New**, then **Blueprint**, and pick the repository. Render reads `render.yaml` and sets everything up.

**Before you present:** free Render services sleep after 15 minutes without visitors. Open the link about a minute before your slot so it is awake.

## Useful links once it is live

* `/` overview and live journey
* `/collector` collector app (open this one on a phone)
* `/satin` Satin credit officer view
* `/verify/CERT-2026-0001` a public certificate check
* `/labels` printable bin QR labels for a live scanning demo
