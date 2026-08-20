// Shared helpers for reading/writing our two data collections in Vercel KV.
// Vercel KV env vars (KV_REST_API_URL / KV_REST_API_TOKEN) are auto-injected
// once you connect a KV store to this project in the Vercel dashboard —
// you never need to type them in yourself.
const { createClient } = require('@vercel/kv');
const fs = require('fs');
const path = require('path');

// Vercel's Marketplace KV/Upstash integration may prefix the injected env vars
// (e.g. `storage_KV_REST_API_URL`). The default `kv` export only reads the
// unprefixed names, so we build the client explicitly and accept either form.
const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.storage_KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.storage_KV_REST_API_TOKEN,
});

const MERCHANTS_KEY = 'merchants_v1';
const PAYMENTS_KEY = 'payment_methods_v1';

function loadSeed(filename) {
  const p = path.join(__dirname, '..', filename);
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

async function getMerchants() {
  let data = await kv.get(MERCHANTS_KEY);
  if (!data) {
    const seed = loadSeed('_seed_merchants.json').map((m) => ({ ...m, id: uid('m') }));
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
    const seed = loadSeed('_seed_payments.json').map((p) => ({ ...p, id: uid('p') }));
    await kv.set(PAYMENTS_KEY, seed);
    return seed;
  }
  return data;
}

async function savePaymentMethods(methods) {
  await kv.set(PAYMENTS_KEY, methods);
}

module.exports = { getMerchants, saveMerchants, getPaymentMethods, savePaymentMethods, uid };
