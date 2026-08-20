const { getPaymentMethods, savePaymentMethods, uid } = require('./_lib/store');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const methods = await getPaymentMethods();
      return res.status(200).json(methods);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      let methods = await getPaymentMethods();

      if (body.action === 'add' && body.method) {
        methods.push({ id: uid('p'), ...body.method });
      } else if (body.action === 'delete' && body.id) {
        methods = methods.filter((p) => p.id !== body.id);
      } else if (body.action === 'replaceAll' && Array.isArray(body.methods)) {
        methods = body.methods;
      } else {
        return res.status(400).json({ error: 'Unrecognized action/body shape' });
      }

      await savePaymentMethods(methods);
      return res.status(200).json(methods);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err && err.message || err) });
  }
};
