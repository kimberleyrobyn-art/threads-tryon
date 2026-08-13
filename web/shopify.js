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

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes,
  hostName: (process.env.HOST || '').replace(/^https?:\/\//, ''),
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

module.exports = { shopify, sessionStorage };
