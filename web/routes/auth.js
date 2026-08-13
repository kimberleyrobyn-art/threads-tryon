const express = require('express');
const { shopify, sessionStorage } = require('../shopify');

const router = express.Router();

// Start of the OAuth install flow. A merchant hits this (usually via the
// install link generated in the Dev Dashboard) with ?shop=xxx.myshopify.com
router.get('/auth', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }

  await shopify.auth.begin({
    shop: shopify.utils.sanitizeShop(shop, true),
    callbackPath: '/auth/callback',
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });
});

// Shopify redirects here after the merchant approves the install.
router.get('/auth/callback', async (req, res) => {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    await sessionStorage.storeSession(callback.session);

    res.status(200).send(
      'Threads of Creation Try-On app installed. You can close this tab and add the "See it on you" block from the theme editor.'
    );
  } catch (err) {
    console.error('OAuth callback failed:', err);
    res.status(500).send('Authentication failed. Check server logs.');
  }
});

module.exports = router;
