require('dotenv').config();
const path = require('path');
const express = require('express');

const isDemo = process.env.DEMO_MODE === 'true';

const authRoutes = require('./routes/auth');
const webhookRoutes = require('./routes/webhooks');
const tryonRoutes = isDemo ? require('./routes/demo') : require('./routes/tryon');

const app = express();

app.get('/health', (_req, res) => res.status(200).send('ok'));

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
