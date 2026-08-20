const { getMerchants, saveMerchants, uid } = require('./_lib/store');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const merchants = await getMerchants();
      return res.status(200).json(merchants);
    }

    if (req.method === 'POST') {
      // Body can be:
      //  { action: 'replaceAll', merchants: [...] }  -> overwrite the whole list
      //  { action: 'add', merchant: {...} }          -> append one new merchant
      //  { action: 'delete', id: '...' }              -> remove one merchant
      const body = req.body || {};
      let merchants = await getMerchants();

      if (body.action === 'replaceAll' && Array.isArray(body.merchants)) {
        merchants = body.merchants;
      } else if (body.action === 'add' && body.merchant) {
        merchants.push({ id: uid('m'), ...body.merchant });
      } else if (body.action === 'delete' && body.id) {
        merchants = merchants.filter((m) => m.id !== body.id);
      } else {
        return res.status(400).json({ error: 'Unrecognized action/body shape' });
      }

      await saveMerchants(merchants);
      return res.status(200).json(merchants);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err && err.message || err) });
  }
};
