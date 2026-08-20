const { getMerchants, saveMerchants, merchantUrls } = require('./_lib/store');
const { getPaymentTechnologies } = require('./_lib/similarweb');

function domainOf(url) {
  return String(url || '').replace(/^https?:\/\//, '').split('/')[0];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing merchant id' });

    const merchants = await getMerchants();
    const merchant = merchants.find((m) => m.id === id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    const urls = merchantUrls(merchant);
    if (!urls.length) return res.status(400).json({ error: 'Merchant has no site URL' });

    // Check every site in parallel, then union the detected payment methods
    // (case-insensitive de-dupe, keeping the first-seen spelling).
    const settled = await Promise.allSettled(urls.map((u) => getPaymentTechnologies(domainOf(u))));
    const ok = settled.filter((s) => s.status === 'fulfilled');
    if (!ok.length) throw (settled[0] && settled[0].reason) || new Error('Similarweb returned no data');

    const seen = new Set();
    const merged = [];
    ok.forEach((s) => (s.value || []).forEach((name) => {
      const key = String(name).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(name);
    }));

    merchant.paymentMethodsOnSite = merged;
    merchant.paymentMethodsUpdatedAt = new Date().toISOString();

    await saveMerchants(merchants);
    return res.status(200).json(merchant);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err && err.message || err) });
  }
};
