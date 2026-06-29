// Playwright runner for eznamka.sk
// Spustí flow: výber typu známky → zadanie EČV → email → captcha (Capsolver) → Potvrdiť
// Vráti redirect URL na platobnú bránu.
//
// Captcha: Capsolver vyrieši reCAPTCHA v2 a vráti g-recaptcha-response token,
// ktorý vstrekneme do skrytého <textarea> pred odoslaním formulára.

import { chromium } from "playwright";

const CAPSOLVER_KEY = process.env.CAPSOLVER_API_KEY;
const SITE_URL = "https://eznamka.sk/selfcare/purchase/";
const SITE_KEY = "6LfHAjkUAAAAADameCOtUdnICQbHOiH4Xqt1lMAw";

// Mapovanie typov známok na text v UI
const VIGNETTE_LABEL = {
  "1day": "1-dňová",
  "10day": "Dnešná",
  "1month": "30-dňová",
  "1year": "Ročná",
};

async function solveCaptcha(pageUrl) {
  if (!CAPSOLVER_KEY) throw new Error("CAPSOLVER_API_KEY chýba v .env");

  // 1) createTask
  const create = await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: CAPSOLVER_KEY,
      task: {
        type: "ReCaptchaV2TaskProxyLess",
        websiteURL: pageUrl,
        websiteKey: SITE_KEY,
      },
    }),
  }).then((r) => r.json());

  if (create.errorId) throw new Error("Capsolver createTask: " + create.errorDescription);
  const taskId = create.taskId;

  // 2) getTaskResult (poll)
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: CAPSOLVER_KEY, taskId }),
    }).then((r) => r.json());

    if (res.status === "ready") return res.solution.gRecaptchaResponse;
    if (res.status !== "processing") throw new Error("Capsolver: " + JSON.stringify(res));
  }
  throw new Error("Capsolver timeout");
}

/**
 * @param {object} task     { license_plate, country_code, vignette_type, validity_date, email }
 * @param {function} log    (step, message, level?, metadata?) => Promise
 * @param {function} shot   (step, buffer) => Promise<url>
 */
export async function runPurchase(task, log, shot) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await log("start", `Spúšťam flow pre ${task.license_plate}`);
    await page.goto(SITE_URL, { waitUntil: "domcontentloaded" });

    await page.locator("#purchase-single").click();
    await page.locator("#select-car").click();

    const label = VIGNETTE_LABEL[task.vignette_type] || VIGNETTE_LABEL["1day"];
    await page.getByText(label, { exact: false }).first().click();
    await log("vignette_selected", `Vybraná známka: ${label}`);
    await shot("vignette_selected", await page.screenshot());

    // Formulár – EČV, krajina, email (real field names from eznamka.sk)
    await page.waitForSelector('input[name="Vignette.LicensePlateNumber"]', { timeout: 30000 });
    await page.fill('input[name="Vignette.LicensePlateNumber"]', task.license_plate);
    const ecvAgain = page.locator('input[name="Vignette.RegistrationNumberAgain"]');
    if (await ecvAgain.count()) await ecvAgain.fill(task.license_plate);

    const countrySelect = page.locator('select[name="Vignette.VehicleCountryCode"]');
    if (await countrySelect.count()) {
      await countrySelect.selectOption(task.country_code).catch(async () => {
        await countrySelect.selectOption({ label: task.country_code });
      });
    }

    await page.fill('input[name="Vignette.Email"]', task.email);
    const emailAgain = page.locator('input[name="Vignette.EmailAgain"]');
    if (await emailAgain.count()) await emailAgain.fill(task.email);

    await shot("form_filled", await page.screenshot());
    await log("form_filled", "Formulár vyplnený");

    // Captcha
    await log("captcha_start", "Riešim reCAPTCHA cez Capsolver…");
    const token = await solveCaptcha(page.url());
    await page.evaluate((tok) => {
      document.querySelectorAll('textarea[name="g-recaptcha-response"]').forEach((ta) => {
        ta.style.display = "block";
        ta.value = tok;
        ta.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // Fire reCAPTCHA callback if present
      try {
        if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
          const findCb = (obj) => {
            for (const k in obj) {
              const v = obj[k];
              if (v && typeof v === "object") {
                if (typeof v.callback === "function") { v.callback(tok); return true; }
                if (findCb(v)) return true;
              }
            }
            return false;
          };
          findCb(window.___grecaptcha_cfg.clients);
        }
      } catch (e) {}
    }, token);
    await log("captcha_solved", "Captcha vyriešená");

    // Zaškrtni všetky required checkboxy (GDPR, súhlas s podmienkami)
    const checkboxes = await page.locator('input[type="checkbox"]').all();
    for (const cb of checkboxes) {
      try {
        if (!(await cb.isChecked())) await cb.check({ force: true });
      } catch {}
    }
    await page.waitForTimeout(500);
    await shot("before_submit", await page.screenshot());

    // Potvrdiť – počkaj kým sa enabluje
    const submitBtn = page.locator('#button-purchase-confirm');
    await submitBtn.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(
      () => {
        const b = document.querySelector('#button-purchase-confirm');
        return b && !b.disabled && !b.classList.contains('ui-state-disabled');
      },
      { timeout: 30000 }
    );
    await Promise.all([
      page.waitForURL(/payment|gp-webpay|besteron|tatra|gopay|stripe|checkout/i, { timeout: 30000 }).catch(() => {}),
      submitBtn.click(),
    ]);

    await shot("after_submit", await page.screenshot());
    const paymentUrl = page.url();
    await log("done", `Platobná URL: ${paymentUrl}`);

    return { paymentUrl };
  } catch (e) {
    await log("error", e.message, "error");
    try {
      await shot("error", await page.screenshot());
    } catch {}
    throw e;
  } finally {
    await browser.close();
  }
}
