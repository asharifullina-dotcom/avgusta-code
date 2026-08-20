const { getProcessing, saveProcessing, normDomain } = require('./_lib/store');

// Processing coverage = which site processes which country with which method,
// aggregated from uploaded order reports. One stored record per unique
// (site, country, method); repeated uploads accumulate order counts.
const up = (v) => String(v || '').trim().toUpperCase();
const keyOf = (site, cardCountry, customerCountry, method) =>
  normDomain(site) + '|' + up(cardCountry) + '|' + up(customerCountry) + '|' + String(method || '').trim().toLowerCase();

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await getProcessing());
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.action === 'clear') {
        await saveProcessing([]);
        return res.status(200).json({ records: [], cleared: true });
      }

      if (body.action === 'import' && Array.isArray(body.rows)) {
        const records = await getProcessing();
        const index = new Map();
        // `country` is the legacy field name for card country (back-compat).
        records.forEach((r) => index.set(keyOf(r.site, r.cardCountry || r.country, r.customerCountry, r.method), r));

        let newCombos = 0, updatedCombos = 0, addedOrders = 0, skipped = 0;

        for (const raw of body.rows) {
          const site = normDomain((raw && raw.site) || '');
          const cardCountry = up((raw && (raw.cardCountry || raw.country)));
          const customerCountry = up((raw && raw.customerCountry));
          const method = String((raw && raw.method) || '').trim().toLowerCase();
          const count = Math.max(1, parseInt((raw && raw.count), 10) || 1);
          const currencies = Array.isArray(raw && raw.currencies) ? raw.currencies : (raw && raw.currency ? [raw.currency] : []);
          if (!site || !cardCountry || !method) { skipped++; continue; }

          const k = keyOf(site, cardCountry, customerCountry, method);
          let rec = index.get(k);
          if (!rec) {
            rec = { site, cardCountry, customerCountry, method, currencies: [], count: 0 };
            index.set(k, rec);
            records.push(rec);
            newCombos++;
          } else {
            updatedCombos++;
          }
          rec.count += count;
          addedOrders += count;
          currencies.forEach((c) => {
            const cur = String(c || '').trim().toUpperCase();
            if (cur && !rec.currencies.includes(cur)) rec.currencies.push(cur);
          });
        }

        await saveProcessing(records);
        return res.status(200).json({ records, newCombos, updatedCombos, addedOrders, skipped });
      }

      return res.status(400).json({ error: 'Unrecognized action/body shape' });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
};
