// Batch-uploads product photos to app.arvin.business's "AI Model" tool.
//
// Automated: login persistence, navigating to AI Model, picking the
// product type, uploading each file, clicking Generate, and capturing the
// downloaded result.
//
// Model/Pose/Background handling depends on config.json's "styleMode":
//   - "once" (default): you pick Model/Pose/Background yourself for the
//     FIRST photo only. The script watches which exact tiles you click and
//     automatically re-clicks those same tiles for every photo after —
//     this replay is necessary because Arvin resets the selection on every
//     new upload rather than remembering it itself.
//   - "auto": picks Model/Pose/Background itself by tile position (see
//     config.json's "styling" block) — a best-effort guess at Arvin's page
//     structure, since this was written without access to Arvin's actual
//     HTML. Useful if you want variety (e.g. a different pose per photo)
//     without touching anything yourself.
//   - "manual": pauses and asks you to pick every single photo.
//
// With "watch": true in config.json, the script keeps running and polls
// inputDir on an interval instead of exiting after one pass — point
// inputDir/outputDir at a folder synced from your iPad (iCloud Drive,
// Dropbox, etc.) via Files app, leave this running on a Mac/PC, and drop
// photos in from your iPad whenever. Results show up in outputDir, which
// syncs back.
//
// Run with `npm start` from this folder. See README.md for setup.

const path = require("path");
const fs = require("fs");
const readline = require("readline");
const { chromium } = require("playwright");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const ARVIN_URL = "https://app.arvin.business";
const AI_MODEL_URL = "https://app.arvin.business/feature/ai-model-photos";
const PROFILE_DIR = path.join(__dirname, ".browser-profile"); // gitignored, holds your login
const MANIFEST_PATH = path.join(__dirname, "manifest.json"); // gitignored, tracks what's done

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return { processed: [], nextStyleIndex: 0, capturedStyle: null };
  }
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

async function ensureLoggedIn(page) {
  await page.goto(ARVIN_URL, { waitUntil: "domcontentloaded" });
  // Give the page a real chance to render before deciding you're logged
  // out — checking instantly after navigation can catch it mid-load and
  // wrongly conclude "not logged in" even with a perfectly valid session.
  const loggedIn = await page
    .getByText("AI Model", { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (loggedIn) return;

  console.log("\nNot logged in yet.");
  console.log("A browser window is open — log into Arvin there manually.");
  await prompt("Once you're logged in and can see the Home page, press Enter here to continue... ");
}

// Best-effort: some sites show a cookie/consent banner that sits on top of
// the page and can silently swallow clicks meant for the real UI. Dismiss
// it if present; do nothing if not.
async function dismissCookieBanner(page) {
  const candidates = [
    page.getByRole("button", { name: /accept|agree|got it|allow/i }),
    page.getByRole("button", { name: /^(ok|close)$/i }),
  ];
  for (const loc of candidates) {
    if ((await loc.count().catch(() => 0)) > 0) {
      try {
        await loc.first().click({ force: true, timeout: 3000 });
        return;
      } catch {
        // try the next candidate
      }
    }
  }
}

async function goToUploadScreen(page) {
  // Hard navigate to a fresh load of the AI Model page each time, rather
  // than clicking through the nav from whatever screen a previous
  // download left us on — avoids leftover overlays/state blocking clicks.
  await page.goto(AI_MODEL_URL, { waitUntil: "domcontentloaded" });
  const productTile = page.getByText(config.productType, { exact: true }).first();
  await productTile.waitFor({ timeout: 30000 });
  // force: true — the text is reliably there, but something in the tile's
  // layout (likely the thumbnail image on top of it) blocks a normal
  // click's overlap check. Force bypasses that and clicks through.
  await productTile.click({ force: true, timeout: 15000 });
  await page.getByText("Upload Image", { exact: true }).first().waitFor({ timeout: 15000 });
}

async function uploadImage(page, filePath) {
  // Prefer setting the page's file input directly — this works even if
  // clicking Arvin's styled "Upload Image" button doesn't trigger a real
  // OS file dialog (e.g. it's wired to a hidden <input type="file">).
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count() > 0) {
    await fileInput.setInputFiles(filePath);
  } else {
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }),
      page.getByText("Upload Image", { exact: true }).first().click(),
    ]);
    await fileChooser.setFiles(filePath);
  }

  // Preferences panel appearing confirms the upload was accepted.
  await page.getByText("Preferences", { exact: true }).waitFor({ timeout: 30000 });

  // Not clicking an aspect ratio tile here on purpose: Arvin appears to
  // default to 1:1 already, and a stray force-click on the wrong element
  // (this ran automatically, before the user gets a chance to pick
  // Model/Pose/Background themselves) was the likely cause of a reported
  // bug where the wrong Model/Background got selected. If you need a
  // non-default aspect ratio, click it yourself along with Model/Pose/
  // Background during the manual pick step.
}

// Clicks the Nth tile in the grid that follows a section heading like
// "Model" / "Pose" / "Background". Best-effort: assumes the tile grid is
// a sibling container right after the heading, containing clickable
// image/button elements in DOM order.
async function clickTileAtIndex(page, sectionLabel, index) {
  const heading = page.getByText(sectionLabel, { exact: true }).first();
  await heading.scrollIntoViewIfNeeded();

  const container = heading.locator("xpath=following-sibling::*[1]");
  const tiles = container.locator('img, button, [role="button"]');

  const count = await tiles.count();
  if (count === 0) {
    throw new Error(`no tiles found under "${sectionLabel}"`);
  }
  const clampedIndex = Math.min(index, count - 1);

  const tile = tiles.nth(clampedIndex);
  await tile.scrollIntoViewIfNeeded();
  await tile.click({ force: true, timeout: 5000 });
  return clampedIndex;
}

// Only used in styleMode "auto".
async function applyStyling(page, styleIndex) {
  const picks = {};
  for (const [label, key] of [["Model", "model"], ["Pose", "pose"], ["Background", "background"]]) {
    const optionConfig = config.styling[key];
    const index = optionConfig.mode === "cycle" ? styleIndex % optionConfig.count : optionConfig.index;
    picks[key] = await clickTileAtIndex(page, label, index);
  }
  return picks;
}

// Only used in styleMode "once": watches which tile you actually click
// under each "Model" / "Pose" / "Background" heading, so those exact tiles
// can be re-clicked automatically for every photo after this one — instead
// of hoping Arvin remembers your picks itself (it doesn't; it resets the
// selection on every new upload).
let styleClickCaptureRegistered = false;
async function captureStyleClicks(page) {
  const captured = { model: null, pose: null, background: null };

  if (!styleClickCaptureRegistered) {
    await page.exposeFunction("__reportStyleClick", (section, index) => {
      captured[section] = index;
      console.log(`  (captured your ${section} pick: tile ${index})`);
    });
    styleClickCaptureRegistered = true;
  }

  await page.evaluate(() => {
    const sections = [
      ["Model", "model"],
      ["Pose", "pose"],
      ["Background", "background"],
    ];
    for (const [label, key] of sections) {
      const heading = [...document.querySelectorAll("*")].find(
        (el) => el.children.length === 0 && el.textContent.trim() === label
      );
      if (!heading) continue;
      const container = heading.nextElementSibling;
      if (!container) continue;
      const tiles = container.querySelectorAll('img, button, [role="button"]');
      tiles.forEach((tile, index) => {
        if (tile.dataset.styleCaptureBound) return;
        tile.dataset.styleCaptureBound = "1";
        tile.addEventListener(
          "click",
          () => {
            window.__reportStyleClick(key, index);
          },
          { capture: true }
        );
      });
    }
  });

  return captured;
}

async function generateAndDownload(page, outputDir, baseName) {
  const downloadPromise = page.waitForEvent("download", { timeout: config.generateTimeoutMs });

  await page.getByText("Generate", { exact: true }).first().click({ force: true });

  // Best-effort: wait for the "Processing..." overlay to appear then clear.
  try {
    await page.getByText("Processing...").first().waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("Processing...").first().waitFor({ state: "hidden", timeout: config.generateTimeoutMs });
  } catch {
    // Overlay text might differ or already be gone — fine, we still wait
    // on the actual download event below.
  }

  // Try to auto-click a Download control under a few common patterns.
  const candidates = [
    page.getByRole("button", { name: /download/i }),
    page.getByRole("link", { name: /download/i }),
    page.locator('[aria-label*="download" i]'),
    page.locator('[title*="download" i]'),
  ];
  let clicked = false;
  for (const loc of candidates) {
    if ((await loc.count().catch(() => 0)) > 0) {
      try {
        await loc.first().click({ force: true, timeout: 5000 });
        clicked = true;
        break;
      } catch {
        // try the next candidate
      }
    }
  }
  if (!clicked) {
    console.log("  Couldn't find a Download button automatically — click Download yourself now.");
  }

  const download = await downloadPromise;
  const savePath = path.join(outputDir, `${baseName}__${download.suggestedFilename()}`);
  await download.saveAs(savePath);
  return savePath;
}

// Processes one file. Returns true on success (caller marks it done in the
// manifest), false on failure (caller leaves it to retry next pass).
async function processFile(page, filePath, outputDir, manifest) {
  const baseName = path.parse(filePath).name;

  try {
    await goToUploadScreen(page);
    await uploadImage(page, filePath);
  } catch (err) {
    console.log(`  Failed to upload: ${err.message}`);
    return false;
  }

  let stylingHandled = false;

  if (config.styleMode === "auto") {
    try {
      const picks = await applyStyling(page, manifest.nextStyleIndex);
      console.log(`  Auto-picked tiles: model[${picks.model}] pose[${picks.pose}] background[${picks.background}]`);
      stylingHandled = true;
    } catch (err) {
      console.log(`  Auto-styling failed (${err.message}).`);
    }
  } else if (config.styleMode === "once" && manifest.capturedStyle) {
    // Re-click the exact tiles captured from the first photo — Arvin
    // resets the selection on every new upload, so this has to be
    // repeated for real each time, not skipped.
    try {
      const { model, pose, background } = manifest.capturedStyle;
      await clickTileAtIndex(page, "Model", model);
      await clickTileAtIndex(page, "Pose", pose);
      await clickTileAtIndex(page, "Background", background);
      console.log(`  Replayed your picks: model[${model}] pose[${pose}] background[${background}]`);
      stylingHandled = true;
    } catch (err) {
      console.log(`  Replaying your picks failed (${err.message}) — pick manually this time.`);
    }
  }

  if (!stylingHandled) {
    let capture = null;
    if (config.styleMode === "once" && !manifest.capturedStyle) {
      capture = await captureStyleClicks(page);
    }

    const label =
      config.styleMode === "once"
        ? "  Pick Model / Pose / Background for this batch (I'll watch which tiles you click and reuse those exact ones for every photo after this), then press Enter to Generate (or 's' to skip this photo): "
        : "  Pick Model / Pose / Background in the browser, then press Enter to Generate (or 's' to skip this photo): ";
    const answer = await prompt(label);
    if (answer.toLowerCase() === "s") {
      console.log("  Skipped.");
      return false;
    }

    if (capture) {
      if (capture.model !== null && capture.pose !== null && capture.background !== null) {
        manifest.capturedStyle = capture;
      } else {
        console.log("  (couldn't tell exactly which tiles you clicked — will ask again next photo.)");
      }
    }
  }

  try {
    const savedTo = await generateAndDownload(page, outputDir, baseName);
    console.log(`  Saved: ${savedTo}`);
    return true;
  } catch (err) {
    console.log(`  Failed to generate/download: ${err.message}`);
    return false;
  }
}

function listNewFiles(inputDir, processedSet) {
  return fs
    .readdirSync(inputDir)
    .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .filter((f) => !processedSet.has(f))
    .sort();
}

async function main() {
  const inputDir = path.resolve(__dirname, config.inputDir);
  const outputDir = path.resolve(__dirname, config.outputDir);
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const manifest = loadManifest();
  const processedSet = new Set(manifest.processed);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
  const page = context.pages()[0] || (await context.newPage());
  await ensureLoggedIn(page);
  await dismissCookieBanner(page);

  let shuttingDown = false;
  process.on("SIGINT", () => {
    console.log("\nShutting down after the current photo...");
    shuttingDown = true;
  });

  if (config.styleMode === "once") {
    console.log(
      manifest.capturedStyle
        ? `styleMode is 'once' and picks are already captured (model[${manifest.capturedStyle.model}] pose[${manifest.capturedStyle.pose}] background[${manifest.capturedStyle.background}]) — every photo will replay them automatically.`
        : "styleMode is 'once' — pick Model/Pose/Background for the first photo, I'll capture exactly which tiles you click, then replay those same clicks automatically for every photo after.\n"
    );
  } else if (config.styleMode === "auto") {
    console.log("styleMode is 'auto' — Model/Pose/Background will be picked automatically per photo by tile position.");
    console.log("Watch the first couple of photos to make sure it's clicking the right tiles.\n");
  }

  do {
    const newFiles = listNewFiles(inputDir, processedSet);

    for (const file of newFiles) {
      if (shuttingDown) break;
      console.log(`\n${file}`);

      let ok = false;
      try {
        ok = await processFile(page, path.join(inputDir, file), outputDir, manifest);
      } catch (err) {
        console.log(`  Unexpected error on this photo: ${err.message}`);
        console.log("  Continuing with the next photo.");
      }
      processedSet.add(file);
      manifest.processed.push(file);
      if (ok && config.styleMode === "auto") manifest.nextStyleIndex++;
      saveManifest(manifest);

      await sleep(config.delayBetweenPhotosMs);
    }

    if (config.watch && !shuttingDown) {
      if (newFiles.length === 0) {
        process.stdout.write(".");
      }
      await sleep(config.watchIntervalMs);
    }
  } while (config.watch && !shuttingDown);

  console.log(`\nDone. ${manifest.processed.length} photo(s) processed total.`);
  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
