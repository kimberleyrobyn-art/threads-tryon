const express = require('express');
const { DeliveryMethod } = require('@shopify/shopify-api');
const { shopify, sessionStorage } = require('../shopify');

const router = express.Router();

// This app never writes customer photos or order/customer data to disk or
// a database -- uploaded photos are proxied straight through to FASHN and
// nothing is persisted here. So the mandatory privacy webhooks below have
// nothing to redact; they just need to acknowledge receipt for compliance.
shopify.webhooks.addHandlers({
  APP_UNINSTALLED: [
    {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: '/webhooks/app-uninstalled',
      callback: async (_topic, shop) => {
        const sessions = await sessionStorage.findSessionsByShop(shop);
        if (sessions.length) {
          await sessionStorage.deleteSessions(sessions.map((s) => s.id));
        }
        console.log(`App uninstalled for ${shop}, session(s) removed.`);
      },
    },
  ],
  CUSTOMERS_DATA_REQUEST: [
    {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: '/webhooks/compliance',
      callback: async (_topic, shop) => {
        console.log(`customers/data_request received for ${shop}: no customer data is stored by this app.`);
      },
    },
  ],
  CUSTOMERS_REDACT: [
    {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: '/webhooks/compliance',
      callback: async (_topic, shop) => {
        console.log(`customers/redact received for ${shop}: no customer data is stored by this app.`);
      },
    },
  ],
  SHOP_REDACT: [
    {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: '/webhooks/compliance',
      callback: async (_topic, shop) => {
        console.log(`shop/redact received for ${shop}: no shop data is stored by this app.`);
      },
    },
  ],
});

async function handleWebhook(req, res) {
  try {
    const response = await shopify.webhooks.process({
      rawBody: req.body.toString('utf8'),
      rawRequest: req,
      rawResponse: res,
    });
    if (!res.writableEnded) {
      res.status(response?.statusCode || 200).send();
    }
  } catch (err) {
    console.error('Webhook processing failed:', err);
    if (!res.writableEnded) {
      res.status(500).send();
    }
  }
}

// Both URIs are registered per-topic in shopify.app.toml; process() reads
// the X-Shopify-Topic header to find the right handler above regardless of
// which of these two paths Shopify actually posts to.
router.post('/webhooks/app-uninstalled', express.raw({ type: '*/*' }), handleWebhook);
router.post('/webhooks/compliance', express.raw({ type: '*/*' }), handleWebhook);

module.exports = router;
