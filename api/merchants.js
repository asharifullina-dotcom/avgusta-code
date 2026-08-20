const {
  getMerchants, saveMerchants, uid, normDomain, normName, merchantUrls, setMerchantUrls,
} = require('./_lib/store');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const merchants = await getMerchants();
      return res.status(200).json(merchants);
    }

    if (req.method === 'POST') {
      // Body can be:
      //  { action: 'replaceAll', merchants: [...] }   -> overwrite the whole list
      //  { action: 'add', merchant: {...} }           -> append one new merchant (merchant.url may be array or string)
      //  { action: 'delete', id }                     -> remove one merchant
      //  { action: 'addSites', id, urls: [...] }      -> attach site(s) to a merchant
      //  { action: 'removeSite', id, url }            -> drop one site from a merchant
      //  { action: 'importMany', merchants: [...] }   -> bulk import; attaches sites to existing companies (by name)
      const body = req.body || {};
      let merchants = await getMerchants();

      // Company identity is the (case-insensitive) name; a company holds many sites.
      const findByName = (name) => merchants.find((m) => normName(m.company) === normName(name));

      if (body.action === 'replaceAll' && Array.isArray(body.merchants)) {
        merchants = body.merchants;
      } else if (body.action === 'add' && body.merchant) {
        const src = body.merchant;
        const urls = Array.isArray(src.url) ? src.url : (Array.isArray(src.urls) ? src.urls : [src.url]);
        const m = setMerchantUrls({ id: uid('m'), ...src }, urls);
        delete m.urls_input;
        merchants.push(m);
      } else if (body.action === 'delete' && body.id) {
        merchants = merchants.filter((m) => m.id !== body.id);
      } else if (body.action === 'addSites' && body.id && (Array.isArray(body.urls) || body.url)) {
        const m = merchants.find((x) => x.id === body.id);
        if (!m) return res.status(404).json({ error: 'Merchant not found' });
        const incoming = Array.isArray(body.urls) ? body.urls : [body.url];
        const before = merchantUrls(m).length;
        setMerchantUrls(m, merchantUrls(m).concat(incoming));
        await saveMerchants(merchants);
        return res.status(200).json({ merchants, merchant: m, addedSites: merchantUrls(m).length - before });
      } else if (body.action === 'removeSite' && body.id && body.url) {
        const m = merchants.find((x) => x.id === body.id);
        if (!m) return res.status(404).json({ error: 'Merchant not found' });
        const target = normDomain(body.url);
        setMerchantUrls(m, merchantUrls(m).filter((u) => normDomain(u) !== target));
        await saveMerchants(merchants);
        return res.status(200).json({ merchants, merchant: m });
      } else if (body.action === 'importMany' && Array.isArray(body.merchants)) {
        // Bulk import (CSV/Excel or pasted rows). Rows are grouped by company
        // name (case-insensitive). A new site is attached to the matching
        // company; a site already present under that company is skipped.
        let addedCompanies = 0, attachedSites = 0, skippedDuplicates = 0, skippedInvalid = 0;

        for (const raw of body.merchants) {
          const company = String((raw && raw.company) || '').trim();
          const url = String((raw && raw.url) || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
          if (!company || !url) { skippedInvalid++; continue; }

          let m = findByName(company);
          if (m) {
            const domains = new Set(merchantUrls(m).map(normDomain));
            if (domains.has(normDomain(url))) { skippedDuplicates++; continue; }
            setMerchantUrls(m, merchantUrls(m).concat(url));
            attachedSites++;
          } else {
            m = setMerchantUrls({
              id: uid('m'),
              company,
              countries: Array.isArray(raw.countries) ? raw.countries.slice(0, 5) : [],
              confidence: raw.confidence || 'Medium',
              notes: (raw.notes != null && String(raw.notes).trim()) || 'Imported from file',
            }, [url]);
            merchants.push(m);
            addedCompanies++;
          }
        }

        await saveMerchants(merchants);
        return res.status(200).json({ merchants, added: addedCompanies, attachedSites, skippedDuplicates, skippedInvalid });
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
