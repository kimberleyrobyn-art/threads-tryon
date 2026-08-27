// Batch-uploads product photos to app.arvin.business's "AI Model" tool.
//
// Fully automated: login persistence, navigating to AI Model, picking the
// product type, uploading each file, clicking Generate, and capturing the
// downloaded result.
//
// Left to you (per photo): clicking Model / Pose / Background. Those are
// unlabeled image tiles on Arvin's site, so there's no reliable text to
// automate picking them from outside the browser. If Arvin remembers your
// last picks, this is just pressing Enter each time.
//
// Run with `npm start` from this folder. See README.md for setup.

const path = require("path");
const fs = require("fs");
const readline = require("readline");
const { chromium } = require("playwright");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const ARVIN_URL = "https://app.arvin.business";
const PROFILE_DIR = path.join(__dirname, ".browser-profile"); // gitignored, holds your login

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

async function ensureLoggedIn(page) {
  await page.goto(ARVIN_URL, { waitUntil: "domcontentloaded" });
  const loggedIn = await page.getByText("AI Model", { exact: true }).first().isVisible().catch(() => false);
  if (loggedIn) return;

  console.log("\nNot logged in yet.");
  console.log("A browser window is open — log into Arvin there manually.");
  await prompt("Once you're logged in and can see the Home page, press Enter here to continue... ");
}

async function goToUploadScreen(page) {
  // Re-navigate from the nav each time rather than guessing what screen a
  // previous download left us on — slower but far more reliable.
  await page.getByText("AI Model", { exact: true }).first().click();
  await page.getByText(config.productType, { exact: true }).first().click();
  await page.getByText("Upload Image", { exact: true }).first().waitFor({ timeout: 15000 });
}

async function uploadImage(page, filePath) {
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByText("Upload Image", { exact: true }).first().click(),
  ]);
  await fileChooser.setFiles(filePath);

  // Preferences panel appearing confirms the upload was accepted.
  await page.getByText("Preferences", { exact: true }).waitFor({ timeout: 30000 });

  // Aspect ratio is optional/best-effort — skip quietly if it's not there
  // or the label doesn't match.
  try {
    await page.getByText(config.aspectRatio, { exact: true }).first().click({ timeout: 5000 });
  } catch {
    console.log(`  (couldn't select aspect ratio "${config.aspectRatio}" — leaving default)`);
  }
}

async function generateAndDownload(page, outputDir, baseName) {
  const downloadPromise = page.waitForEvent("download", { timeout: config.generateTimeoutMs });

  await page.getByText("Generate", { exact: true }).first().click();

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
        await loc.first().click({ timeout: 5000 });
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

async function main() {
  const inputDir = path.resolve(__dirname, config.inputDir);
  const outputDir = path.resolve(__dirname, config.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const files = fs
    .readdirSync(inputDir)
    .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort();

  if (files.length === 0) {
    console.log(`No image files found in ${inputDir}. Drop some in there (jpg/png/webp) and re-run.`);
    return;
  }

  console.log(`Found ${files.length} photo(s) to process: ${files.join(", ")}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
  const page = context.pages()[0] || (await context.newPage());

  await ensureLoggedIn(page);

  let done = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(inputDir, file);
    const baseName = path.parse(file).name;
    console.log(`\n[${done + skipped + 1}/${files.length}] ${file}`);

    await goToUploadScreen(page);
    await uploadImage(page, filePath);

    const answer = await prompt(
      "  Pick Model / Pose / Background in the browser, then press Enter to Generate (or 's' to skip this photo): "
    );
    if (answer.toLowerCase() === "s") {
      console.log("  Skipped.");
      skipped++;
      continue;
    }

    try {
      const savedTo = await generateAndDownload(page, outputDir, baseName);
      console.log(`  Saved: ${savedTo}`);
      done++;
    } catch (err) {
      console.log(`  Failed to generate/download for ${file}: ${err.message}`);
      console.log("  Moving on to the next photo.");
    }

    await sleep(config.delayBetweenPhotosMs);
  }

  console.log(`\nDone. ${done} generated, ${skipped} skipped, out of ${files.length}.`);
  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
