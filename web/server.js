require('dotenv').config();
const path = require('path');
const express = require('express');

const isDemo = process.env.DEMO_MODE === 'true';

const authRoutes = require('./routes/auth');
const webhookRoutes = require('./routes/webhooks');
const tryonRoutes = isDemo ? require('./routes/demo') : require('./routes/tryon');

const app = express();

app.get('/health', (_req, res) => res.status(200).send('ok'));

// TEMP DIAGNOSTIC -- checks whether this server can actually reach FASHN's
// API at all (as opposed to locally, which was already proven to work).
// Remove once the App Proxy 500 issue is root-caused.
app.get('/debug/fashn-ping', async (_req, res) => {
  const startedAt = Date.now();
  try {
    const r = await fetch('https://api.fashn.ai/v1/status/00000000-0000-0000-0000-000000000000', {
      headers: { Authorization: `Bearer ${process.env.FASHN_API_KEY || ''}` },
    });
    const body = await r.text();
    res.json({
      reached: true,
      elapsedMs: Date.now() - startedAt,
      fashnStatus: r.status,
      bodyStart: body.slice(0, 200),
    });
  } catch (err) {
    res.json({
      reached: false,
      elapsedMs: Date.now() - startedAt,
      errorMessage: err.message,
      errorCode: err.cause?.code || err.code,
    });
  }
});

if (isDemo) {
  app.use('/tryon-assets', express.static(path.join(__dirname, '..', 'extensions', 'tryon-block', 'assets')));
  app.use('/demo', express.static(path.join(__dirname, '..', 'demo')));
}

app.use(authRoutes);
app.use(webhookRoutes);
app.use(tryonRoutes);

app.get('/', (_req, res) => {
  res.status(200).send('Threads of Creation Try-On backend is running.');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Try-on backend listening on port ${port}`);
});
