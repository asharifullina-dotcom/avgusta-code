// Thin wrapper around Similarweb's REST API.
//
// Both endpoints below were verified against Similarweb's live API and their
// developer docs (https://developers.similarweb.com/reference/website-technologies):
//   1. "traffic by country" -> v1 Web Traffic API. Countries come back as names
//      (not numeric codes) and shares as fractions (0..1).
//   2. "website technologies" -> v4 technographics API. Payment providers appear
//      under the category "Payment & Currencies" (e.g. PayPal, MasterCard).

const SIMILARWEB_ENDPOINTS = {
  trafficByCountry: (domain) =>
    `https://api.similarweb.com/v1/website/${encodeURIComponent(domain)}/geo/traffic-by-country` +
    `?api_key=${process.env.SIMILARWEB_API_KEY}&main_domain_only=false`,
  technologies: (domain) =>
    `https://api.similarweb.com/v4/website/${encodeURIComponent(domain)}/technographics/all` +
    `?api_key=${process.env.SIMILARWEB_API_KEY}&format=json&limit=500`,
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
  // v4 technographics returns { technologies: [...] }; be tolerant of shape variants.
  const techList = data.technologies || data.data || data.records || [];
  const items = techList
    .map((t) => {
      if (typeof t === 'string') return { name: t, category: '', sub: '', status: 'installed' };
      return {
        name: t.technology_name || t.technology || t.name || t.tag || '',
        category: String(t.category || ''),
        sub: String(t.sub_category || ''),
        status: String(t.status || 'installed').toLowerCase(),
      };
    })
    // Drop technologies Similarweb marks as no longer present on the site.
    .filter((t) => t.name && t.status !== 'removed');

  const isPayment = (t) => {
    // Currency-symbol markers (€/$ on the page) aren't a payment method — skip them.
    if (t.sub.toLowerCase() === 'payment currency') return false;
    // Similarweb groups card networks, wallets, PSPs under "Payment & Currencies".
    if (t.category.toLowerCase().includes('payment')) return true;
    // Fallback: match well-known PSP/gateway names anywhere in the tech list.
    return PAYMENT_TECH_KEYWORDS.some((kw) => t.name.toLowerCase().includes(kw));
  };

  const names = items.filter(isPayment).map((t) => t.name);
  return Array.from(new Set(names)); // de-dupe
}

module.exports = { getTopCountries, getPaymentTechnologies };
