// DEMO ONLY -- launches the backend with fake Shopify/FASHN credentials and
// the mock tryon routes (web/routes/demo.js) mounted instead of the real
// ones, purely so the theme block's UX can be clicked through locally.
// Not used in production; do not deploy this file.
process.env.DEMO_MODE = 'true';
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'demo_key';
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'demo_secret';
process.env.HOST = process.env.HOST || 'http://localhost:3000';
process.env.PORT = process.env.PORT || 3000;

require('./server.js');
