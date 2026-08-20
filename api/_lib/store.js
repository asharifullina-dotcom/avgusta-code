// Shared helpers for reading/writing our two data collections in Vercel KV.
// Vercel KV env vars (KV_REST_API_URL / KV_REST_API_TOKEN) are auto-injected
// once you connect a KV store to this project in the Vercel dashboard —
// you never need to type them in yourself.
const { createClient } = require('@vercel/kv');

// Seed data. Loaded via static `require()` (not fs.readFileSync with a computed
// path) so Vercel's file-tracing reliably bundles these JSON files into the
// serverless function — otherwise they're missing at runtime (ENOENT).
const SEED_MERCHANTS = require('../_seed_merchants.json');
const SEED_PAYMENTS = require('../_seed_payments.json');

// Vercel's Marketplace KV/Upstash integration may prefix the injected env vars
// (e.g. `storage_KV_REST_API_URL`). The default `kv` export only reads the
// unprefixed names, so we build the client explicitly and accept either form.
const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.storage_KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.storage_KV_REST_API_TOKEN,
});

const MERCHANTS_KEY = 'merchants_v1';
const PAYMENTS_KEY = 'payment_methods_v1';
const LEADS_KEY = 'leads_v1';
const PROCESSING_KEY = 'processing_v1';

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ---- Shared normalization (case-insensitive throughout) ----
// Bare host of a URL: no protocol, no www., no path/trailing slash, lowercased.
function normDomain(u) {
  return String(u || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '')
    .replace(/\/.*$/, '').replace(/\/+$/, '');
}
// Company name for identity/dedupe: trimmed, collapsed spaces, lowercased.
function normName(n) {
  return String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
// A merchant's list of sites. Back-compat: older records only have `url`.
function merchantUrls(m) {
  if (m && Array.isArray(m.urls) && m.urls.length) return m.urls.slice();
  if (m && m.url) return [m.url];
  return [];
}
// Store a merchant's URLs as a de-duplicated (by host) list and keep the legacy
// single `url` field pointing at the primary (first) site for back-compat.
function setMerchantUrls(m, urls) {
  const seen = new Set();
  const clean = [];
  (urls || []).forEach((u) => {
    const bare = String(u || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!bare) return;
    const key = normDomain(bare);
    if (seen.has(key)) return;
    seen.add(key);
    clean.push(bare);
  });
  m.urls = clean;
  m.url = clean[0] || '';
  return m;
}

async function getMerchants() {
  let data = await kv.get(MERCHANTS_KEY);
  if (!data) {
    const seed = SEED_MERCHANTS.map((m) => ({ ...m, id: uid('m') }));
    await kv.set(MERCHANTS_KEY, seed);
    return seed;
  }
  return data;
}

async function saveMerchants(merchants) {
  await kv.set(MERCHANTS_KEY, merchants);
}

async function getPaymentMethods() {
  let data = await kv.get(PAYMENTS_KEY);
  if (!data) {
    const seed = SEED_PAYMENTS.map((p) => ({ ...p, id: uid('p') }));
    await kv.set(PAYMENTS_KEY, seed);
    return seed;
  }
  return data;
}

async function savePaymentMethods(methods) {
  await kv.set(PAYMENTS_KEY, methods);
}

// Leads: prospect sites (URL-only) that we run the same Similarweb checks on.
// Separate collection from merchants; starts empty (no seed).
async function getLeads() {
  const data = await kv.get(LEADS_KEY);
  return data || [];
}
async function saveLeads(leads) {
  await kv.set(LEADS_KEY, leads);
}

// Pick the read/write pair for a named collection (used by the shared
// Similarweb endpoints so they can operate on merchants OR leads).
function collectionIO(name) {
  if (name === 'leads') return { get: getLeads, save: saveLeads };
  return { get: getMerchants, save: saveMerchants };
}

// Processing coverage: aggregated order data — one record per unique
// (site, country, method) combo, accumulated across uploaded files.
async function getProcessing() {
  const data = await kv.get(PROCESSING_KEY);
  return data || [];
}
async function saveProcessing(rows) {
  await kv.set(PROCESSING_KEY, rows);
}

module.exports = {
  getMerchants, saveMerchants, getPaymentMethods, savePaymentMethods, uid,
  getLeads, saveLeads, collectionIO, getProcessing, saveProcessing,
  normDomain, normName, merchantUrls, setMerchantUrls,
};
