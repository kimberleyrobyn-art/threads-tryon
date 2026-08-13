# Threads of Creation — Virtual Try-On

Shopify custom app + theme app extension that adds a "See it on you" button
to product pages. Customers upload a photo, it's combined with the
product's garment image via the FASHN API (`tryon-max` model), and the
result is shown inline.

## How it fits together

```
Product page (theme app extension block)
  -> reads garment image straight from Liquid (product.featured_image)
  -> customer uploads photo, converted to base64 in the browser
  -> POST /apps/tryon/start  (Shopify App Proxy, same-origin, signed)
       -> forwarded to backend: web/routes/tryon.js
       -> backend calls FASHN /v1/run, returns a prediction id
  -> browser polls GET /apps/tryon/status/:id every 3s
       -> backend calls FASHN /v1/status/:id
  -> on "completed", result image shown + downloadable
```

The backend never writes the customer's photo to disk or a database — it's
proxied straight through to FASHN in the request body and forgotten.

## File map

- `shopify.app.toml` — app config: URLs, scopes, webhooks, App Proxy mapping
- `web/server.js` — Express entry point
- `web/shopify.js` — Shopify API client + SQLite session storage
- `web/routes/auth.js` — OAuth install flow
- `web/routes/webhooks.js` — mandatory webhooks (app/uninstalled, GDPR compliance)
- `web/routes/tryon.js` — App Proxy endpoints that call FASHN
- `web/fashn.js` — FASHN API client (`runTryon`, `getStatus`)
- `extensions/tryon-block/` — the theme app extension (the actual button/UI)

## Prerequisites checklist

- [ ] FASHN API key generated (app.fashn.ai → Developer API → API Keys) —
      requires topping up **API credits** first (separate from any FASHN
      app credits), Sidebar → API → API Billing → Top up ($7.50 minimum)
      unlocks the "Create new API key" button
- [ ] Shopify Partner organization created (done)
- [ ] App created in the Dev Dashboard (done — you're on "Create a version")
- [ ] Backend deployed somewhere with a stable HTTPS URL (see below)

## 1. Deploy the backend first

The Dev Dashboard's "Create a version" screen needs a real URL before you
can finish it, so deploy first with placeholder env vars, then fill in the
Dev Dashboard, then update env vars with the real Shopify credentials once
they exist (chicken-and-egg, but the URL doesn't need to be "working" yet
to be accepted).

Using [Render](https://render.com) (free/cheap tier, persistent — needed
because we store the OAuth session in a local SQLite file):

1. Push this folder to a GitHub repo (or use Render's "deploy from local").
2. Render → New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables from `.env.example` (leave `SHOPIFY_API_KEY`,
   `SHOPIFY_API_SECRET`, `FASHN_API_KEY` blank for now if you don't have
   them yet — the service will still boot, those routes just won't work
   until they're set).
5. Set `HOST` to the Render URL Render gives you, e.g.
   `https://threads-tryon.onrender.com`.
6. Deploy. Confirm `https://<your-app>.onrender.com/health` returns `ok`.

Railway/Fly.io work the same way if you prefer those.

## 2. Finish the Dev Dashboard "Create a version" screen

| Dev Dashboard field | Value |
|---|---|
| App URL | `https://<your-app>.onrender.com` |
| Redirect URL(s) | `https://<your-app>.onrender.com/auth/callback` |
| Scopes | none — this app doesn't call the Admin API |
| Webhook API version | whatever "latest" is when you get here |
| App Proxy → Subpath prefix | `apps` |
| App Proxy → Subpath | `tryon` |
| App Proxy → Proxy URL | `https://<your-app>.onrender.com/proxy` |

After creating the version, the Dev Dashboard shows a **Client ID** and
**Client secret**. Put those in Render's env vars as `SHOPIFY_API_KEY` and
`SHOPIFY_API_SECRET`, then redeploy. Also update `shopify.app.toml`
locally with the same client_id and real URLs (keeps the repo in sync with
what's configured on Shopify — useful if you ever manage this with the
Shopify CLI instead of the Dev Dashboard UI).

## 3. Install the app on Threads of Creation

Visit:
```
https://<your-app>.onrender.com/auth?shop=<your-store>.myshopify.com
```
Approve the install. You should land on a plain confirmation page.

## 4. Add the FASHN API key

Once you've topped up API credits and generated a key at app.fashn.ai, set
`FASHN_API_KEY` in Render's env vars and redeploy.

## 5. Add the block to the product page

Theme editor → open a product page → Add block → **See it on you** (under
Apps). Place it near the Add to Cart button. Configure the button text and
garment category (Auto-detect works for most items; override to Tops /
Bottoms / One-pieces if FASHN misclassifies a specific product type).

## 6. What to disclose to customers

FASHN processes the uploaded photo and auto-deletes the output after 3
days; Threads of Creation's backend never stores it. The block's upload
step already shows a short version of this inline. Consider also adding a
line to your privacy policy along the lines of:

> Photos uploaded for the virtual try-on feature are sent to our try-on
> technology provider, FASHN AI, solely to generate the preview image
> shown to you. We do not store these photos. FASHN automatically deletes
> generated results after 3 days.

## Cost / abuse note

`/apps/tryon/start` is a public endpoint (App Proxy requests aren't tied to
a logged-in customer) and each call spends FASHN credits. There's a basic
guard limiting `product_image` to Shopify-hosted URLs, but there's no rate
limiting yet. If this becomes a problem, add per-IP or per-session
throttling in `web/routes/tryon.js` before it ships broadly.

## Local development

```bash
npm install
cp .env.example .env   # fill in what you have
npm start
```
Visit `http://localhost:3000/health`. OAuth and the FASHN calls need real
credentials and a public HTTPS URL (Shopify won't redirect to localhost),
so full end-to-end testing has to happen against the deployed URL.
