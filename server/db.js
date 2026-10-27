// SQLite persistence layer. Uses Node's built-in SQLite driver (no external deps).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nowISO } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(DATA_DIR, 'johnrois.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  facebook_url TEXT NOT NULL DEFAULT '',
  social_links TEXT NOT NULL DEFAULT '[]',
  website_url TEXT NOT NULL DEFAULT '',
  representative TEXT NOT NULL DEFAULT '',
  default_footer TEXT NOT NULL DEFAULT '',
  default_payment_terms TEXT NOT NULL DEFAULT '',
  default_notes TEXT NOT NULL DEFAULT '',
  tax_enabled INTEGER NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_label TEXT NOT NULL DEFAULT 'VAT',
  registration_info TEXT NOT NULL DEFAULT '',
  tin TEXT NOT NULL DEFAULT '',
  logo_image TEXT NOT NULL DEFAULT '',
  logo_height INTEGER NOT NULL DEFAULT 56,
  logo_align TEXT NOT NULL DEFAULT 'left',
  signature_image TEXT NOT NULL DEFAULT '',
  default_due_days INTEGER NOT NULL DEFAULT 30,
  payment_methods TEXT NOT NULL DEFAULT '["Cash","Bank Transfer","GCash","Check"]',
  quotation_prefix TEXT NOT NULL DEFAULT 'QTN',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  service_prefix TEXT NOT NULL DEFAULT 'SR',
  statement_prefix TEXT NOT NULL DEFAULT 'BS',
  payment_prefix TEXT NOT NULL DEFAULT 'PAY',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  billing_address TEXT NOT NULL DEFAULT '',
  project_locations TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'pc',
  default_price REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  issue_date TEXT NOT NULL,
  valid_until TEXT NOT NULL DEFAULT '',
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  contact_number TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  project_name TEXT NOT NULL DEFAULT '',
  project_location TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'amount',
  discount_value REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  payment_terms TEXT NOT NULL DEFAULT '',
  delivery_schedule TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  prepared_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  invoice_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  product_id INTEGER,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pc',
  unit_price REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  invoice_date TEXT NOT NULL,
  due_date TEXT NOT NULL DEFAULT '',
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  contact_number TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  quotation_id INTEGER,
  quotation_number TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'amount',
  discount_value REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  payment_terms TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  prepared_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  product_id INTEGER,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pc',
  unit_price REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL DEFAULT '',
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'Cash',
  details TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  service_date TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  contact_number TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  equipment TEXT NOT NULL DEFAULT '',
  reported_problem TEXT NOT NULL DEFAULT '',
  findings TEXT NOT NULL DEFAULT '',
  work_performed TEXT NOT NULL DEFAULT '',
  technician TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  materials TEXT NOT NULL DEFAULT '[]',
  materials_cost REAL NOT NULL DEFAULT 0,
  labor_cost REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled',
  recommendations TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  customer_ack TEXT NOT NULL DEFAULT '',
  photos TEXT NOT NULL DEFAULT '[]',
  prepared_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  statement_date TEXT NOT NULL,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  contact_number TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  previous_balance REAL NOT NULL DEFAULT 0,
  total_charges REAL NOT NULL DEFAULT 0,
  total_payments REAL NOT NULL DEFAULT 0,
  outstanding_balance REAL NOT NULL DEFAULT 0,
  payment_terms TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  prepared_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_statement_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statement_id INTEGER NOT NULL REFERENCES billing_statements(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  txn_date TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  charges REAL NOT NULL DEFAULT 0,
  credits REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_q_customer ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_q_date ON quotations(issue_date);
CREATE INDEX IF NOT EXISTS idx_i_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_i_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_p_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_p_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_bs_customer ON billing_statements(customer_id);
CREATE INDEX IF NOT EXISTS idx_sr_customer ON service_reports(customer_id);
`;

db.exec(SCHEMA);

export function seedSettings() {
  const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (existing) return;
  const now = nowISO();
  db.prepare(
    `INSERT INTO settings (id, business_name, address, facebook_url, updated_at)
     VALUES (1, ?, ?, ?, ?)`
  ).run(
    'Johnrois Stainless Steel Fabrication Shop',
    'Brgy. Ubalde, Davao City, Davao del Sur, Philippines',
    'https://www.facebook.com/johnroiscanon',
    now
  );
}
seedSettings();

// Small query helpers -------------------------------------------------------
// Normalize JS values that SQLite cannot bind directly (undefined, booleans).
const bindable = (params) =>
  params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });

export const all = (sql, params = []) => db.prepare(sql).all(...bindable(params));
export const get = (sql, params = []) => db.prepare(sql).get(...bindable(params));
export const run = (sql, params = []) => db.prepare(sql).run(...bindable(params));

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  }
}

/** Atomically reserve the next sequence value for a document kind. */
export function nextSequence(key) {
  db.prepare(
    'INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1'
  ).run(key);
  return Number(db.prepare('SELECT value FROM counters WHERE key = ?').get(key).value);
}

export function yearOf(isoDate) {
  return String(isoDate || nowISO()).slice(0, 4);
}

export function docNumber(prefix, isoDate) {
  const year = yearOf(isoDate);
  const seq = nextSequence(`${prefix}-${year}`);
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}

export function customerNumber() {
  const seq = nextSequence('CUS');
  return `CUS-${String(seq).padStart(5, '0')}`;
}

export function checkpoint() {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    /* checkpoint is best-effort */
  }
}

export const dbInfo = { path: DB_PATH, dataDir: DATA_DIR };
