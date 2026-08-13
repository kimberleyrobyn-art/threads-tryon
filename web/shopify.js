const path = require('path');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const { SQLiteSessionStorage } = require('@shopify/shopify-app-session-storage-sqlite');

const sessionStorage = new SQLiteSessionStorage(
  path.join(__dirname, '..', 'sessions.sqlite')
);

const scopes = (process.env.SCOPES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// shopifyApi() throws at import time if any of these are missing, which
// would crash the whole server on boot -- including /health -- before the
// real Shopify credentials exist yet. Fall back to placeholders so the
// server always starts; /auth will just fail (correctly) until the real
// SHOPIFY_API_KEY / SHOPIFY_API_SECRET / HOST env vars are set.
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || 'placeholder_api_key',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'placeholder_api_secret',
  scopes,
  hostName: (process.env.HOST || 'placeholder.example.com').replace(/^https?:\/\//, ''),
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

module.exports = { shopify, sessionStorage };
