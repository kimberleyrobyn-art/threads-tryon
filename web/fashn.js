// Thin client for the FASHN API (https://api.fashn.ai).
//
// Field names verified against the live API on 2026-08-13 via
// web/test-fashn.js: model_image / product_image are correct for the
// tryon-max model. tryon-max does NOT accept a "category" input -- it
// auto-detects the garment type; passing one returns a 400.
//
// generation_mode: "fast" verified working the same day -- cuts per-item
// time roughly in half (documented ~10s vs ~25s "balanced" default),
// which matters a lot once outfits chain multiple sequential generations.

const FASHN_BASE_URL = 'https://api.fashn.ai/v1';

function fashnHeaders() {
  const apiKey = process.env.FASHN_API_KEY;
  if (!apiKey) {
    throw new Error('FASHN_API_KEY is not set');
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

// modelImage: base64 data URI of the customer's uploaded photo.
// productImage: public URL of the garment image (from Shopify CDN).
async function runTryon({ modelImage, productImage }) {
  const res = await fetch(`${FASHN_BASE_URL}/run`, {
    method: 'POST',
    headers: fashnHeaders(),
    body: JSON.stringify({
      model_name: 'tryon-max',
      inputs: {
        model_image: modelImage,
        product_image: productImage,
        generation_mode: 'fast',
      },
    }),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.message || body?.error || `FASHN /run failed with status ${res.status}`;
    throw new Error(message);
  }

  if (!body?.id) {
    throw new Error('FASHN /run did not return a prediction id');
  }

  return body.id;
}

async function getStatus(predictionId) {
  const res = await fetch(`${FASHN_BASE_URL}/status/${predictionId}`, {
    method: 'GET',
    headers: fashnHeaders(),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.message || body?.error || `FASHN /status failed with status ${res.status}`;
    throw new Error(message);
  }

  return body; // { id, status, output, error }
}

module.exports = { runTryon, getStatus };
