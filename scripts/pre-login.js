// Bundled: Search jobs by keyword + extract all job cards from results
// Run via browser_evaluate after navigating to job search page
// Returns: { searchCompleted, totalJobs, jobs, hasNextPage, paginationText }
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const keyword = typeof SEARCH_KEYWORD !== 'undefined' ? SEARCH_KEYWORD : 'marketing';

  // ===== PART 1: Search =====
  let searchCompleted = false;
  const searchInput = document.querySelector(
    'input[type="search"], input[placeholder*="Search" i], input[placeholder*="search" i], ' +
    'input[name="query"], input[name="search"], input[name="q"], input[aria-label*="search" i]'
  );

  if (searchInput) {
    searchInput.focus();
    searchInput.value = keyword;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Wait for search results to populate
    await sleep(1500);
    searchCompleted = true;
  }

  // ===== PART 2: Extract jobs from results =====
  const jobs = [];
  const cards = document.querySelectorAll(
    '.job-listing, .job-row, [data-testid="job-card"], .job-post, ' +
    'tr.job, .job_listing, li.job, [class*="JobCard"], [class*="job-card"]'
  );

  if (cards.length > 0) {
    cards.forEach((card, idx) => {
      const titleEl = card.querySelector('a[href], .job-title, h3, h4, h2, [class*="title"]');
      const companyEl = card.querySelector('.company-name, .employer, [class*="company" i], [class*="Company"]');
      const salaryEl = card.querySelector('.salary, .compensation, [class*="salary" i], [class*="compensation" i]');
      const locationEl = card.querySelector('.location, [class*="location" i], [class*="Location"]');
      const linkEl = card.querySelector('a[href*="/job"], a[href*="/application"], a[href*="/posting"], a');

      jobs.push({
        index: idx,
        title: titleEl?.textContent?.trim() || '',
        company: companyEl?.textContent?.trim() || '',
        salary: salaryEl?.textContent?.trim() || '',
        location: locationEl?.textContent?.trim() || '',
        jobUrl: linkEl?.href || '',
        jobId: linkEl?.href?.match(/\/(\d+)/)?.[1] || ''
      });
    });
  }

  // Fallback: look for any job-related links
  if (jobs.length === 0) {
    const allLinks = Array.from(document.querySelectorAll('a')).filter(a =>
      a.href && (a.href.includes('/job') || a.href.includes('/application') || a.href.includes('/posting'))
    );

    allLinks.forEach((link, idx) => {
      jobs.push({
        index: idx,
        title: link.textContent?.trim() || '',
        company: '',
        salary: '',
        location: '',
        jobUrl: link.href,
        jobId: link.href.match(/\/(\d+)/)?.[1] || ''
      });
    });
  }

  // Check pagination
  const nextBtn = document.querySelector(
    '[aria-label="Next"], [aria-label="Next page"], .pagination-next, ' +
    '[class*="next" i], a[rel="next"]'
  );
  const pageInfo = document.querySelector(
    '.pagination, [class*="pagination"], [class*="Pagination"], [aria-label="pagination"]'
  );

  return JSON.stringify({
    searchCompleted,
    totalJobs: jobs.length,
    jobs: jobs,
    hasNextPage: !!nextBtn,
    paginationText: pageInfo?.textContent?.trim()?.substring(0, 100) || ''
  });
})();
