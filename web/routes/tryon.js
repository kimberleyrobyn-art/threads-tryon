const crypto = require('crypto');
const express = require('express');
const { runTryon, getStatus } = require('../fashn');

const router = express.Router();

// Shopify signs every App Proxy request's query string with the app's
// client secret so the backend can be sure it's really Shopify forwarding
// a storefront request, not someone hitting the backend URL directly.
function verifyProxySignature(req) {
  const { signature, ...rest } = req.query;
  if (!signature) return false;

  const message = Object.keys(rest)
    .sort()
    .map((key) => {
      const value = Array.isArray(rest[key]) ? rest[key].join(',') : rest[key];
      return `${key}=${value}`;
    })
    .join('');

  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  const digestBuf = Buffer.from(digest, 'utf8');
  const signatureBuf = Buffer.from(String(signature), 'utf8');
  if (digestBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(digestBuf, signatureBuf);
}

// Shopify's `image_url` Liquid filter returns a protocol-relative URL
// (starting with "//"), which only resolves in a browser. FASHN's server
// has no "current protocol" to infer, so it must be a fully-qualified URL.
function normalizeImageUrl(url) {
  return url.startsWith('//') ? `https:${url}` : url;
}

// Light abuse guard: only allow garment images that actually come from
// this store, not arbitrary URLs -- otherwise this endpoint becomes a free
// way for anyone to burn your FASHN credits on unrelated images. Stores
// with a connected custom domain (like threadsofcreation.com) serve their
// CDN images from that domain's /cdn/shop/ path rather than
// cdn.shopify.com, so the storefront domain needs to be allow-listed too.
function isAllowedProductImage(url) {
  try {
    const { hostname } = new URL(url);
    if (hostname === 'cdn.shopify.com' || hostname.endsWith('.myshopify.com')) {
      return true;
    }
    const storefrontDomain = process.env.STOREFRONT_DOMAIN;
    return Boolean(storefrontDomain) && hostname === storefrontDomain;
  } catch {
    return false;
  }
}

router.post('/proxy/start', express.json({ limit: '15mb' }), async (req, res) => {
  if (!verifyProxySignature(req)) {
    return res.status(401).json({ error: 'Invalid request signature' });
  }

  const { model_image: modelImage, product_image: rawProductImage } = req.body || {};

  if (!modelImage || !rawProductImage) {
    return res.status(400).json({ error: 'model_image and product_image are required' });
  }
  if (!modelImage.startsWith('data:image/')) {
    return res.status(400).json({ error: 'model_image must be a base64 data URI' });
  }

  const productImage = normalizeImageUrl(rawProductImage);
  if (!isAllowedProductImage(productImage)) {
    return res.status(400).json({ error: 'product_image must be a Shopify-hosted image URL' });
  }

  try {
    const id = await runTryon({ modelImage, productImage });
    res.json({ id });
  } catch (err) {
    console.error('FASHN run failed:', err.message);
    res.status(502).json({ error: 'Try-on generation failed to start. Please try again.' });
  }
});

router.get('/proxy/status/:id', async (req, res) => {
  if (!verifyProxySignature(req)) {
    return res.status(401).json({ error: 'Invalid request signature' });
  }

  try {
    const result = await getStatus(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('FASHN status check failed:', err.message);
    res.status(502).json({ error: 'Could not check try-on status.' });
  }
});

module.exports = router;
