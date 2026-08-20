const { getMerchants, saveMerchants } = require('./_lib/store');
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

    const domain = domainOf(merchant.url);
    const result = await getPaymentTechnologies(domain);

    merchant.paymentMethodsOnSite = result;
    merchant.paymentMethodsUpdatedAt = new Date().toISOString();

    await saveMerchants(merchants);
    return res.status(200).json(merchant);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err && err.message || err) });
  }
};
