#!/usr/bin/env node
/**
 * Fills and submits a Greenhouse embed job application form via a real
 * Playwright-controlled browser (not the flaky Claude-in-Chrome extension
 * relay, which repeatedly stalled/split across phantom device sessions).
 *
 * ============================================================================
 * KNOWN LIMITATION (2026-08-04) — CANNOT COMPLETE A REAL GREENHOUSE SUBMISSION.
 * The --dry-run field-fill logic works correctly and is verified (every field
 * on a real posting filled with zero errors, confirmed via screenshot). But
 * real Submit silently does nothing: Greenhouse's invisible reCAPTCHA
 * Enterprise checks `navigator.webdriver` (true in any Playwright/Puppeteer/
 * Selenium-launched browser) and never issues a token, so the click is a
 * no-op with no visible error. Confirmed directly — the token textarea stays
 * empty even seconds after clicking Submit on a fully, correctly filled form.
 * Do NOT attempt to patch/spoof navigator.webdriver or otherwise mask
 * automation fingerprints to get past this — that is circumventing CAPTCHA
 * protection, which is prohibited regardless of which tool executes it.
 * This script is kept as a reference for the fill-logic (selectors, the
 * react-select combobox handling pattern, the label-fuzzy-match approach for
 * per-posting custom questions) and as a pre-flight dry-run validator, not as
 * a working submission path. See CLAUDE.md's "KNOWN BLOCKER" section (Browser
 * automation) for the full incident writeup and current status. Ashby forms
 * may not carry the same invisible-reCAPTCHA-Enterprise setup — untested,
 * worth trying if Ashby (not Greenhouse) applications are what's blocked.
 * ============================================================================
 *
 * Usage:
 *   node playwright-apply-greenhouse.js <job_url> <answers_json_path> <resume_path> <cover_letter_path> [--headed] [--dry-run]
 *
 * answers_json shape: { text_answers: { "<label substring>": "<value>", ... },
 *                        combobox_answers: { "<label substring>": "<option substring>", ... } }
 * Matching is done by fuzzy label substring since Greenhouse's question IDs
 * are per-posting and not stable across companies.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const STANDARD_FIELDS = {
  first_name: 'Xiao',
  last_name: 'Zuo',
  preferred_name: 'Barron Zuo',
  email: 'xz429@cornell.edu',
  phone: '9094132840',
};
const STANDARD_LOCATION = 'San Francisco, California, United States';
// Note: Greenhouse forms often have TWO separate gender-identity questions —
// a standalone "gender identity" optional field (id varies per posting, e.g.
// numeric like "66906") plus the standard EEOC "Gender" field (id="gender").
// Both must be filled; matching by id alone misses the first one.
const EEOC_DECLINE = {
  gender: 'Decline To Self Identify',
  hispanic_ethnicity: 'Decline To Self Identify',
  veteran_status: "I don't wish to answer",
  disability_status: "I don't wish to answer",
};
const EEOC_LABEL_FALLBACKS = [
  { labelIncludes: 'gender identity', optionText: 'Decline To Self Identify' },
];

async function fillLabeledCombobox(page, elId, searchText, optionMatchText) {
  const el = page.locator(`#${elId}`);
  await el.click();
  // Deliberately no el.fill('') before typing — calling fill('') on a
  // react-select's underlying input triggers a React re-render that can
  // desync/close the dropdown right before typing, which silently broke
  // every combobox fill (country, location, all yes/no questions) despite
  // each one working fine when tested in isolation without a preceding
  // fill(''). Clicking already focuses/opens the combobox; just type.
  await el.type(searchText, { delay: 60 });
  await page.waitForTimeout(1200);
  const listboxId = await el.getAttribute('aria-controls');
  if (!listboxId) return false;
  const options = page.locator(`#${listboxId} [role="option"]`);
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const text = await options.nth(i).innerText();
    if (text.toLowerCase().includes(optionMatchText.toLowerCase())) {
      await options.nth(i).click();
      return true;
    }
  }
  // fall back to first option if nothing matched exactly
  if (count > 0) {
    await options.nth(0).click();
    return true;
  }
  return false;
}

async function getFieldLabels(page) {
  return page.evaluate(() => {
    const results = [];
    document.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.id) return;
      let label = '';
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) label = lbl.innerText.trim();
      results.push({ id: el.id, tag: el.tagName, type: el.type, label });
    });
    return results;
  });
}

async function main() {
  const [, , jobUrl, answersPath, resumePath, coverLetterPath, ...flags] = process.argv;
  const headed = flags.includes('--headed');
  const dryRun = flags.includes('--dry-run');

  if (!jobUrl || !resumePath || !coverLetterPath) {
    console.error(JSON.stringify({ success: false, error: 'Usage: node playwright-apply-greenhouse.js <job_url> <answers_json_path> <resume_path> <cover_letter_path> [--headed] [--dry-run]' }));
    process.exit(1);
  }
  const answers = answersPath && fs.existsSync(answersPath) ? JSON.parse(fs.readFileSync(answersPath, 'utf8')) : { text_answers: {}, combobox_answers: {} };

  const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 50 : 0 });
  const page = await browser.newPage();
  const log = [];

  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    const fields = await getFieldLabels(page);
    log.push(`Found ${fields.length} labeled fields`);

    // Standard identity fields
    for (const [id, value] of Object.entries(STANDARD_FIELDS)) {
      const exists = await page.locator(`#${id}`).count();
      if (exists) {
        await page.fill(`#${id}`, value);
        log.push(`filled #${id} = ${value}`);
      }
    }

    // Country (react-select combobox, needed before phone renders correctly on some forms)
    if (await page.locator('#country').count()) {
      await fillLabeledCombobox(page, 'country', 'United States', 'United States');
      log.push('set country = United States');
    }

    // Location combobox
    if (await page.locator('#candidate-location').count()) {
      await fillLabeledCombobox(page, 'candidate-location', 'San Francisco', 'San Francisco, California, United States');
      log.push(`set candidate-location = ${STANDARD_LOCATION}`);
    }

    // Resume / cover letter uploads
    if (await page.locator('#resume').count()) {
      await page.setInputFiles('#resume', resumePath);
      log.push(`uploaded resume: ${resumePath}`);
    }
    if (await page.locator('#cover_letter').count()) {
      await page.setInputFiles('#cover_letter', coverLetterPath);
      log.push(`uploaded cover letter: ${coverLetterPath}`);
    }
    await page.waitForTimeout(1000);

    // Custom question_XXXXXX fields — match by label substring against answers_json
    const questionFields = fields.filter((f) => f.id.startsWith('question_'));
    for (const f of questionFields) {
      const labelLower = f.label.toLowerCase();
      let matched = false;

      for (const [key, value] of Object.entries(answers.text_answers || {})) {
        if (labelLower.includes(key.toLowerCase())) {
          const isCombobox = await page.locator(`#${f.id}`).getAttribute('role').catch(() => null) === 'combobox';
          if (isCombobox) {
            await fillLabeledCombobox(page, f.id, value, value);
          } else {
            await page.fill(`#${f.id}`, value);
          }
          log.push(`Q[${f.label.slice(0, 60)}] = ${value}`);
          matched = true;
          break;
        }
      }
      if (matched) continue;

      for (const [key, optionText] of Object.entries(answers.combobox_answers || {})) {
        if (labelLower.includes(key.toLowerCase())) {
          await fillLabeledCombobox(page, f.id, optionText, optionText);
          log.push(`Q[${f.label.slice(0, 60)}] -> selected "${optionText}"`);
          matched = true;
          break;
        }
      }
      if (!matched) {
        log.push(`UNMATCHED question field: id=${f.id} label="${f.label.slice(0, 100)}"`);
      }
    }

    // EEOC section — standard decline codes, matched by id first
    for (const [id, optionText] of Object.entries(EEOC_DECLINE)) {
      if (await page.locator(`#${id}`).count()) {
        const role = await page.locator(`#${id}`).getAttribute('role').catch(() => null);
        if (role === 'combobox') {
          await fillLabeledCombobox(page, id, optionText, optionText);
        } else {
          await page.selectOption(`#${id}`, { label: optionText }).catch(() => {});
        }
        log.push(`EEOC #${id} = ${optionText}`);
      }
    }

    // Re-scan for ANY remaining unfilled EEOC-style fields by label — catches
    // duplicate/differently-id'd gender-identity-style questions Greenhouse
    // sometimes renders in addition to the standard #gender field above.
    const postEeocFields = await getFieldLabels(page);
    for (const f of postEeocFields) {
      if (Object.keys(EEOC_DECLINE).includes(f.id)) continue; // already handled
      const labelLower = f.label.toLowerCase();
      for (const fallback of EEOC_LABEL_FALLBACKS) {
        if (labelLower.includes(fallback.labelIncludes)) {
          const currentValue = await page.locator(`#${f.id}`).inputValue().catch(() => '');
          if (currentValue && currentValue.trim() && currentValue.trim().toLowerCase() !== 'select...') continue;
          const role = await page.locator(`#${f.id}`).getAttribute('role').catch(() => null);
          if (role === 'combobox') {
            await fillLabeledCombobox(page, f.id, fallback.optionText, fallback.optionText);
          } else {
            await page.selectOption(`#${f.id}`, { label: fallback.optionText }).catch(() => {});
          }
          log.push(`EEOC-fallback #${f.id} [${f.label.slice(0, 50)}] = ${fallback.optionText}`);
        }
      }
    }

    await page.waitForTimeout(1000);

    // Safety check: fail loudly (don't submit) if any required field still
    // shows a placeholder/empty state — catches exactly the class of bug
    // that silently shipped an unanswered gender-identity dropdown before
    // this check existed. React-select comboboxes keep the underlying
    // <input>'s .value EMPTY even after a real selection (the chosen text
    // renders in a sibling display node instead) — so this checks the
    // rendered container text, not the input's own value, for those.
    const unfilledRequired = await page.evaluate(() => {
      const problems = [];
      document.querySelectorAll('input[aria-required="true"], select[aria-required="true"]').forEach((el) => {
        const label = document.querySelector(`label[for="${el.id}"]`);
        const labelText = label ? label.innerText.trim() : '';
        let displayText = (el.value || '').trim();
        if (el.getAttribute('role') === 'combobox') {
          // react-select: walk up to the select__control container and read its full text
          const control = el.closest('[class*="select__control"], [class*="-control"]') || el.closest('div')?.parentElement;
          if (control) displayText = control.innerText.trim();
        }
        const lower = displayText.toLowerCase();
        if (!displayText || lower === 'select...' || lower === labelText.toLowerCase()) {
          problems.push({ id: el.id, label: labelText.slice(0, 80), displayText });
        }
      });
      return problems;
    });
    if (unfilledRequired.length > 0) {
      log.push(`UNFILLED REQUIRED FIELDS DETECTED: ${JSON.stringify(unfilledRequired)}`);
    }

    if (dryRun) {
      await page.screenshot({ path: '/tmp/dry_run_preview.png', fullPage: true });
      console.log(JSON.stringify({ success: true, dry_run: true, log, screenshot: '/tmp/dry_run_preview.png' }, null, 2));
      await browser.close();
      return;
    }

    if (unfilledRequired.length > 0 && !flags.includes('--force')) {
      console.log(JSON.stringify({ success: false, error: 'Aborting before submit: required fields still unfilled', unfilledRequired, log }, null, 2));
      await browser.close();
      process.exit(1);
    }

    // Submit
    const submitBtn = page.locator('button#submit_app, button[type="submit"]').first();
    await submitBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500); // let invisible reCAPTCHA settle before submit
    await submitBtn.click();
    // wait up to 10s for either a navigation/URL change or an error to appear,
    // rather than a fixed sleep — invisible reCAPTCHA execution + form submit
    // can take longer than 4s under load
    await page.waitForTimeout(6000);

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    const visibleErrors = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[id$="-error"], .field-error, [role="alert"]'))
        .map((e) => e.innerText).filter(Boolean);
    }).catch(() => []);
    if (visibleErrors.length) log.push(`VISIBLE FORM ERRORS AFTER SUBMIT CLICK: ${JSON.stringify(visibleErrors)}`);
    const confirmed = /thank you|application.*received|application.*submitted|we.?ve received/i.test(bodyText) || /confirmation/i.test(finalUrl);

    console.log(JSON.stringify({
      success: confirmed,
      final_url: finalUrl,
      confirmation_text_found: confirmed,
      body_snippet: bodyText.slice(0, 500),
      log,
    }, null, 2));

    await browser.close();
  } catch (err) {
    await page.screenshot({ path: '/tmp/error_screenshot.png' }).catch(() => {});
    console.log(JSON.stringify({ success: false, error: err.message, log, screenshot: '/tmp/error_screenshot.png' }, null, 2));
    await browser.close();
    process.exit(1);
  }
}

main();
