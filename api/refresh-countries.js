const { collectionIO, merchantUrls } = require('./_lib/store');
const { getTopCountries } = require('./_lib/similarweb');

function domainOf(url) {
  return String(url || '').replace(/^https?:\/\//, '').split('/')[0];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { id, collection } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing record id' });

    const { get, save } = collectionIO(collection);
    const merchants = await get();
    const merchant = merchants.find((m) => m.id === id);
    if (!merchant) return res.status(404).json({ error: 'Record not found' });

    const urls = merchantUrls(merchant);
    if (!urls.length) return res.status(400).json({ error: 'Merchant has no site URL' });

    // Query Similarweb for every site in parallel, then merge by country
    // (summing traffic share across sites) and keep the top 5.
    const settled = await Promise.allSettled(urls.map((u) => getTopCountries(domainOf(u), 5)));
    const ok = settled.filter((s) => s.status === 'fulfilled');
    if (!ok.length) throw (settled[0] && settled[0].reason) || new Error('Similarweb returned no data');

    const byCountry = new Map();
    ok.forEach((s) => (s.value || []).forEach((r) => {
      if (!r.country) return;
      byCountry.set(r.country, (byCountry.get(r.country) || 0) + (r.share_pct || 0));
    }));
    const merged = Array.from(byCountry.entries())
      .map(([country, share_pct]) => ({ country, share_pct: Math.round(share_pct * 100) / 100 }))
      .sort((a, b) => b.share_pct - a.share_pct)
      .slice(0, 5);

    merchant.countries = merged.map((r) => r.country);
    merchant.countriesDetail = merged;
    merchant.countriesSource = 'similarweb';
    merchant.countriesUpdatedAt = new Date().toISOString();
    if (merchant.countries.length) { merchant.confidence = 'High'; delete merchant.countriesNote; }
    else { merchant.countriesNote = 'No Similarweb data for this site'; }

    await save(merchants);
    return res.status(200).json(merchant);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err && err.message || err) });
  }
};
