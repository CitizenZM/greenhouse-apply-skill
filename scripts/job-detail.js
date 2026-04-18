// Extract full job description from job detail page — run via browser_evaluate
// Returns: { title, company, salary, location, jdText, applyUrl, requirements, qualifications }
(async () => {
  // Wait for DOM to be fully interactive
  await new Promise(r => {
    if (document.readyState === 'complete') {
      r();
    } else {
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'complete') r();
      }, {once: true});
    }
  });

  // Title
  const title = (
    document.querySelector('h1, .job-title, [data-testid="job-title"], [class*="JobTitle"], [class*="job-title"]')
    ?.textContent?.trim() || document.title
  );

  // Company
  const company = (
    document.querySelector('.company-name, [data-testid="company-name"], [class*="company"], [class*="Company"], .employer')
    ?.textContent?.trim() || ''
  );

  // Salary/Compensation
  const salaryEl = document.querySelector(
    '.salary, .compensation, [class*="salary"], [class*="compensation"], ' +
    '[class*="Salary"], [class*="Compensation"], [data-testid*="salary"]'
  );
  const salary = salaryEl?.textContent?.trim() || '';

  // Location
  const locationEl = document.querySelector(
    '.location, [class*="location"], [class*="Location"], [data-testid*="location"]'
  );
  const location = locationEl?.textContent?.trim() || '';

  // Full JD content — try multiple selectors
  const jdSelectors = [
    '.job-description', '.description', '[data-testid="job-description"]',
    'article', '.content', '.job-details', '.job-content',
    '[class*="description"]', '[class*="Description"]',
    '#job-description', '#content', 'main'
  ];

  let jdText = '';
  for (const sel of jdSelectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.length > 200) {
      jdText = el.innerText;
      break;
    }
  }

  // If still empty, get the main content area
  if (!jdText || jdText.length < 200) {
    jdText = document.querySelector('main')?.innerText ||
             document.body.innerText.substring(0, 5000);
  }

  // Find Apply button/link
  const applyBtn = document.querySelector(
    'a[href*="apply"], button[aria-label*="Apply" i], ' +
    '[class*="apply" i], [data-testid*="apply"]'
  );
  const applyUrl = applyBtn?.href || '';

  return JSON.stringify({
    title,
    company,
    salary,
    location,
    jdText: jdText.substring(0, 8000), // Cap to avoid context bloat
    applyUrl,
    pageUrl: window.location.href,
    hasApplyButton: !!applyBtn
  });
})();
