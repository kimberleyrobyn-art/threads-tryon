// DEMO ONLY -- stands in for the real /apps/tryon/* routes so the UI can
// be clicked through locally without a live FASHN key or Shopify App
// Proxy. Not mounted unless DEMO_MODE=true. Do not deploy this.
const express = require('express');
const router = express.Router();

const fakeJobs = new Map();

router.post('/apps/tryon/start', express.json({ limit: '15mb' }), (req, res) => {
  const { model_image: modelImage, product_image: productImage } = req.body || {};
  if (!modelImage || !productImage) {
    return res.status(400).json({ error: 'model_image and product_image are required' });
  }
  const id = Math.random().toString(36).slice(2);
  fakeJobs.set(id, Date.now());
  res.json({ id });
});

router.get('/apps/tryon/status/:id', (req, res) => {
  const startedAt = fakeJobs.get(req.params.id);
  if (!startedAt) {
    return res.status(404).json({ error: 'Unknown job' });
  }
  const elapsed = Date.now() - startedAt;
  if (elapsed < 4000) {
    return res.json({ status: 'processing' });
  }
  fakeJobs.delete(req.params.id);
  res.json({ status: 'completed', output: ['/demo/sample-result.svg'] });
});

module.exports = router;
