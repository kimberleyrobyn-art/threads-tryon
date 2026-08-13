// One-off script to test the real FASHN API directly, bypassing the
// Express server / Shopify App Proxy signature check entirely. Not part
// of the shipped app -- just for validating the API key and field names
// (model_image / product_image vs garment_image) before wiring up the
// full flow.
//
// Usage: node web/test-fashn.js <path-to-photo>
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { runTryon, getStatus } = require('./fashn');

const GARMENT_IMAGE_URL =
  'https://cdn.shopify.com/s/files/1/0739/5101/9310/files/il_fullxfull.8329839552_qlhz.jpg?v=1786234970'; // Crescent Moon Eco Polyester Yoga Top

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90000;

function toDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const buffer = fs.readFileSync(filePath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function main() {
  const photoPath = process.argv[2];
  if (!photoPath) {
    console.error('Usage: node web/test-fashn.js <path-to-photo>');
    process.exit(1);
  }

  console.log('Reading photo:', photoPath);
  const modelImage = toDataUri(photoPath);

  console.log('Calling FASHN /v1/run ...');
  let id;
  try {
    id = await runTryon({ modelImage, productImage: GARMENT_IMAGE_URL });
  } catch (err) {
    console.error('FASHN /run failed:', err.message);
    process.exit(1);
  }
  console.log('Prediction id:', id);

  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    let result;
    try {
      result = await getStatus(id);
    } catch (err) {
      console.error('FASHN /status failed:', err.message);
      process.exit(1);
    }

    console.log('Status:', result.status);

    if (result.status === 'completed') {
      console.log('Output:', result.output);
      return;
    }
    if (result.status === 'failed') {
      console.error('Generation failed:', result.error);
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.error('Timed out waiting for FASHN to finish.');
  process.exit(1);
}

main();
