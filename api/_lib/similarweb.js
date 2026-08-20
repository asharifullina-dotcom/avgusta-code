// Thin wrapper around Similarweb's REST API.
//
// IMPORTANT — please read:
// I don't have your exact Similarweb API plan's documented endpoint paths/response
// shapes in front of me (these differ by product tier and change over time), so the
// two URLs below are my best-effort guess at Similarweb's standard "Digital Rank API"
// pattern. Before relying on this in production, log into your Similarweb account,
// open their API docs / Postman collection, and confirm:
//   1. The exact path for "traffic by country" for a domain
//   2. The exact path for "website technologies" for a domain
//   3. Whether countries come back as names or numeric codes (if codes, you'll need
//      a country-code lookup table — ask me and I'll add one once you tell me the
//      format you're seeing)
// Adjust SIMILARWEB_ENDPOINTS below to match; everything else in this project stays
// the same.

const SIMILARWEB_ENDPOINTS = {
  trafficByCountry: (domain) =>
    `https://api.similarweb.com/v1/website/${encodeURIComponent(domain)}/geo/traffic-by-country` +
    `?api_key=${process.env.SIMILARWEB_API_KEY}&main_domain_only=false`,
  technologies: (domain) =>
    `https://api.similarweb.com/v1/website/${encodeURIComponent(domain)}/technology/tags` +
    `?api_key=${process.env.SIMILARWEB_API_KEY}`,
};

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Similarweb response was not JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`Similarweb HTTP ${res.status}: ${data.message || JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

async function getTopCountries(domain, limit) {
  if (!process.env.SIMILARWEB_API_KEY) {
    throw new Error('SIMILARWEB_API_KEY is not set — add it in Vercel project Settings → Environment Variables.');
  }
  const data = await fetchJson(SIMILARWEB_ENDPOINTS.trafficByCountry(domain));
  const records = data.records || data.data || [];
  const sorted = records
    .filter((r) => r.country || r.country_name)
    .sort((a, b) => (b.share || b.value || 0) - (a.share || a.value || 0))
    .slice(0, limit || 5);
  return sorted.map((r) => ({
    country: r.country_name || r.country, // may be a numeric code — see note above
    share_pct: Math.round(((r.share || r.value || 0) * 100) * 100) / 100,
  }));
}

const PAYMENT_TECH_KEYWORDS = [
  'stripe', 'paypal', 'adyen', 'klarna', 'braintree', 'checkout.com', 'worldpay',
  'square', '2checkout', 'authorize.net', 'razorpay', 'mollie', 'payu', 'skrill',
  'neteller', 'trustly', 'sofort', 'dlocal', 'mercado pago', 'pix', 'boleto',
];

async function getPaymentTechnologies(domain) {
  if (!process.env.SIMILARWEB_API_KEY) {
    throw new Error('SIMILARWEB_API_KEY is not set — add it in Vercel project Settings → Environment Variables.');
  }
  const data = await fetchJson(SIMILARWEB_ENDPOINTS.technologies(domain));
  const techList = data.technologies || data.tags || data.records || [];
  const names = techList.map((t) => (typeof t === 'string' ? t : t.name || t.tag || '')).filter(Boolean);
  return names.filter((name) =>
    PAYMENT_TECH_KEYWORDS.some((kw) => name.toLowerCase().includes(kw))
  );
}

module.exports = { getTopCountries, getPaymentTechnologies };
