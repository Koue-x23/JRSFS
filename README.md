# Johnrois Stainless Steel Fabrication Shop — Business Manager

A complete, working business management web application for **Johnrois Stainless Steel
Fabrication Shop** (Davao City). It manages quotations, invoices, service reports, billing
statements, customers, products & services, payments, reports and a fully editable business
profile — in one integrated app.

There is **no login, sign-up or authentication** by design. The site opens directly on the
Dashboard, every module is reachable from the sidebar, and refreshing never redirects anywhere.

---

## Running it

```bash
npm start          # http://localhost:3000  (listens on 0.0.0.0)
npm run dev        # same, with request logging and NODE_ENV=development
```

Requirements: **Node.js 22.13+** (uses the built-in `node:sqlite` driver). There are **no
runtime npm dependencies** — nothing to compile, no database server to install.

Optional environment variables:

| Variable   | Default              | Purpose                                            |
| ---------- | -------------------- | -------------------------------------------------- |
| `PORT`     | `3000`               | HTTP port                                          |
| `HOST`     | `0.0.0.0`            | Bind address                                       |
| `DATA_DIR` | `./data`             | Folder for the SQLite database                     |
| `DB_PATH`  | `./data/johnrois.db` | Explicit database file path                        |

The database file is created automatically on first start and seeded with the business name,
location and Facebook page that could be verified publicly. Everything else (phone, email,
logo, TIN, registration details, products) is intentionally blank and editable in
**Business Settings** / **Products & Services**.

### Tests

The server must be running for the test suites.

```bash
npm test          # 62 API/PDF checks (test data is created by the test itself)
npm run test:ui   # renders every page module in a DOM emulator, checks interactions
npm run test:shell# loads the real app shell and navigates all 21 routes
```

`test:ui` and `test:shell` need the `happy-dom` dev dependency (`npm install`); the app itself
does not. Those suites create their own fixture records when the database is empty, then exercise
the real page modules and routes. Run them against a scratch database (or delete
`data/johnrois.db` afterwards) if you do not want test records in your working data.

### Data, backups and access

* Records live in **SQLite** on the server (`data/johnrois.db`), so they survive refreshes,
  restarts and deployments of the code. Nothing is kept only in the browser.
* **Business Settings → Data & backup** offers a full JSON export and a copy of the database file.
* The app is a single-shop tool with no accounts. Anyone who can reach the URL can use it, so
  publish it only where that is acceptable (e.g. a private network or a password-protected proxy).
  No credentials or secret keys are stored in the browser.

---

## What's implemented

### Dashboard
Quotation totals/pending/approved, invoice totals, unpaid, partially paid and overdue counts,
outstanding balances, billing statement and service report counts, recent transactions, recent
customer activity, quick-create actions. Every figure is computed from saved records and each
tile links to the matching filtered list.

### Quotations
Auto numbers (`QTN-YYYY-0001`, prefix editable, never reused), customer/project details, unlimited
line items with unit and computed line totals, amount or % discount, tax, grand total, terms,
delivery schedule, remarks, prepared-by and signature areas. Statuses Draft / Sent / Approved /
Rejected / Expired (expiry is applied automatically from the validity date). Edit, duplicate,
search, filter, print, download PDF, and **convert approved quotations to invoices** (customer
info and line items carry over; the quotation is then locked to protect the audit trail).

### Invoices
Auto numbers, dates and due dates (default due-days configurable), optional link to the source
quotation, line items, discount/tax, total, amount paid, remaining balance, statuses Unpaid /
Partially Paid / Paid / Overdue. Multiple payments per invoice with full history, duplicate
reference protection, overpayment protection, and recalculation on every payment change.
Direct creation or creation from an approved quotation.

### Service Reports
Auto numbers, customer/contact/site, equipment, reported problem, findings, work performed,
materials with quantities and costs, labor, technician, start/finish times, job status
(Scheduled / In Progress / Completed / Cancelled), recommendations, remarks, customer
acknowledgment, technician/customer/preparer signature areas and up to six before/after photos.
Only customer and service date are required.

### Billing Statements
Pick a customer and billing period. The statement pulls **real invoices and payments** for the
period, computes or accepts an opening balance, and prints a transaction ledger with a running
balance, total charges, total payments and outstanding balance. Saved statements are snapshots.

### Customers
Customer ID, name, company, phone, email, billing address, project locations, remarks, plus a
detail page with tabs for quotations, invoices, payments, service reports and statements and
totals for invoiced/collected/outstanding. Archive/restore never deletes history.

### Products & Services
Name, description, category, unit, default price, notes, active/archived. Selecting an item in a
document fills its description, unit and price; changing the price on a document never changes the
saved default.

### Payments
Reference (auto or manual), customer, invoice, date, amount, method (configurable list), reference
details and remarks. Recording, editing and deleting a payment immediately recalculates the
invoice's amount paid, balance and status.

### Reports
Date range and optional customer filter. Quotations by status, invoices by status, payments
received (by method), invoiced vs collected vs outstanding (clearly separated), overdue invoices,
customer transaction summary, service report summary, monthly billing summary. CSV export
(Excel-friendly, UTF-8 BOM) and print view.

### Business Settings
Business name, tagline, phone, mobile, email, address, Facebook URL, other social links, website,
authorized representative, default footer, payment terms, notes, tax settings, registration info,
TIN, document number prefixes, default due days and payment methods. Logo and signature upload
from the device with preview, replace, remove, size and alignment controls (aspect ratio always
preserved; images are downscaled in the browser and normalized to PNG/JPEG for the PDF engine).
Save / cancel / preview actions; every document reads the saved profile at generation time, so
one edit updates all future documents.

### Documents (PDF)
All four document types are produced by a built-in PDF engine (`server/pdf/`) that embeds
subsetted DejaVu Sans fonts, so the **₱** symbol and all text stay correct and searchable.
A4 pages, proper margins, business logo + verified business info, document title/number, customer
block, itemized tables, totals, terms, remarks, signature areas, page numbers and multi-page
pagination with repeated table headers. Print opens the PDF in a new tab; **Download PDF** saves a
genuine `.pdf` file — not a renamed HTML page.

---

## Project structure

```
server/
  index.js        HTTP server, REST API, static files, PDF endpoints
  db.js           SQLite schema, atomic document numbering, query helpers
  store.js        Validation, business rules, totals, snapshots, reports, exports
  documents.js    A4 document layouts (quotation, invoice, service report, statement)
  pdf/            Dependency-free PDF writer + TrueType subsetter + PNG/JPEG decoder
  test/           smoke (API), ui (page modules), shell (routing) test suites
public/
  index.html      App shell (sidebar + main view)
  css/app.css     Industrial design system, responsive layout, print rules
  js/app.js       Hash router, navigation, bootstrap
  js/shell.js     Shared profile/lookup state
  js/api.js       Fetch wrapper with typed errors
  js/ui.js        Icons, modals, toasts, form helpers, escape utilities
  js/calc.js      Shared totals/status/formatting rules (server + browser use the same file)
  js/images.js    Browser image resizing for logo/signature/photos
  js/pages/       One module per screen
fonts/            DejaVu Sans (regular + bold) embedded in generated PDFs
data/             SQLite database (created at runtime, ignored by git)
```

## Notes & limitations

* The business phone, email, logo, TIN and registration details could not be verified from the
  public page, so they are blank rather than invented — fill them in under Business Settings.
* "Print" opens the generated PDF in a new tab; use the PDF viewer's print button (A4). Pop-up
  blockers must allow the new tab, otherwise use Download PDF.
* Reports are printable through the browser print dialog (including "Save as PDF"); the four
  business documents use the dedicated PDF engine.
* This deployment is single-shop and unauthenticated by design. Use a trusted network or put it
  behind your own access control if the URL is public.
