const { getLeads, saveLeads, uid, normDomain } = require('./_lib/store');

// Leads are prospect sites — URL only. Identity/dedupe is by domain
// (case-insensitive). Same Similarweb checks run via /api/refresh-countries
// and /api/check-payments with { collection: 'leads' }.
module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await getLeads());
    }

    if (req.method === 'POST') {
      // Body:
      //  { action: 'add', url: 'x.com' | ['a.com','b.com'] }  -> add one/many, skip dupes
      //  { action: 'importMany', urls: ['a.com', ...] }        -> bulk add, skip dupes
      //  { action: 'delete', id }                              -> remove one
      const body = req.body || {};
      let leads = await getLeads();

      const cleanUrl = (u) => String(u || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');

      if (body.action === 'add' || body.action === 'importMany') {
        const incoming = body.action === 'importMany'
          ? (Array.isArray(body.urls) ? body.urls : [])
          : (Array.isArray(body.url) ? body.url : [body.url]);

        const seen = new Set(leads.map((l) => normDomain(l.url)));
        let added = 0, skippedDuplicates = 0, skippedInvalid = 0;

        for (const raw of incoming) {
          const url = cleanUrl(raw);
          if (!url) { skippedInvalid++; continue; }
          const key = normDomain(url);
          if (seen.has(key)) { skippedDuplicates++; continue; }
          seen.add(key);
          leads.push({ id: uid('l'), url });
          added++;
        }

        await saveLeads(leads);
        return res.status(200).json({ leads, added, skippedDuplicates, skippedInvalid });
      } else if (body.action === 'delete' && body.id) {
        leads = leads.filter((l) => l.id !== body.id);
        await saveLeads(leads);
        return res.status(200).json(leads);
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
