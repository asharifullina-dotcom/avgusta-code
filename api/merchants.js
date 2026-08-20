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
      } else if (body.action === 'importMany' && Array.isArray(body.merchants)) {
        // Bulk import from CSV/Excel. A row is a duplicate only when BOTH the
        // normalized domain AND the normalized company name already exist
        // (either in the store or earlier in this same file).
        const normDomain = (u) => String(u || '').trim().toLowerCase()
          .replace(/^https?:\/\//, '').replace(/^www\./, '')
          .replace(/\/.*$/, '').replace(/\/+$/, '');
        const normName = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const keyOf = (m) => normDomain(m.url) + '|' + normName(m.company);

        const seen = new Set(merchants.map(keyOf));
        let added = 0, skippedDuplicates = 0, skippedInvalid = 0;

        for (const raw of body.merchants) {
          const company = String((raw && raw.company) || '').trim();
          const url = String((raw && raw.url) || '').trim()
            .replace(/^https?:\/\//, '').replace(/\/+$/, '');
          if (!company || !url) { skippedInvalid++; continue; }
          const candidate = {
            company,
            url,
            countries: Array.isArray(raw.countries) ? raw.countries.slice(0, 5) : [],
            confidence: raw.confidence || 'Medium',
            notes: (raw.notes != null && String(raw.notes).trim()) || 'Imported from file',
          };
          const k = keyOf(candidate);
          if (seen.has(k)) { skippedDuplicates++; continue; }
          seen.add(k);
          merchants.push({ id: uid('m'), ...candidate });
          added++;
        }

        await saveMerchants(merchants);
        return res.status(200).json({ merchants, added, skippedDuplicates, skippedInvalid });
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
