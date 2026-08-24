const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const targets = [
    'https://jobs.lever.co/acceldata/d69a1a62-284c-47d1-b74f-ea02dffad32f/apply',
    'https://jobs.lever.co/collate/31c0b6b3-3a59-4fd4-8ca9-63ff2740780a/apply'
  ];
  
  for (const url of targets) {
    console.log(`\n=== Navigating to ${url} ===`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const title = await page.title();
    console.log(`Title: ${title}`);
    
    // 抓取所有輸入字段
    const inputs = await page.$$eval('input, textarea, select', els => 
      els.map(el => ({
        tag: el.tagName,
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        required: el.required,
        readonly: el.readOnly,
        disabled: el.disabled,
        value: el.value,
        class: el.className
      }))
    );
    console.log(`\nInput fields (${inputs.length}):`);
    inputs.forEach((inp, i) => {
      console.log(`  [${i}] ${inp.tag} name=${inp.name || '?'} type=${inp.type} id=${inp.id || '?'} required=${inp.required} placeholder=${inp.placeholder || '?'}`);
    });
    
    // 找出所有的按鈕
    const buttons = await page.$$eval('button, input[type="submit"], input[type="button"]', els =>
      els.map(el => ({
        tag: el.tagName,
        type: el.type,
        id: el.id,
        text: el.textContent?.trim()?.substring(0, 50),
        class: el.className,
        disabled: el.disabled,
        hidden: el.classList?.contains('hidden')
      }))
    );
    console.log(`\nButtons (${buttons.length}):`);
    buttons.forEach((btn, i) => {
      console.log(`  [${i}] ${btn.tag} id=${btn.id || '?'} type=${btn.type} text="${btn.text}" class=${btn.class} hidden=${btn.hidden}`);
    });
    
    // 檢查 hCaptcha / reCAPTCHA 元素
    const captchaCheck = await page.evaluate(() => {
      return {
        hCaptchaDiv: !!document.getElementById('h-captcha'),
        hCaptchaClass: !!document.querySelector('.h-captcha'),
        hCaptchaIframe: !!document.querySelector('iframe[src*="hcaptcha"]'),
        googleRecaptcha: !!document.querySelector('.g-recaptcha'),
        googleRecaptchaIframe: !!document.querySelector('iframe[src*="recaptcha"]'),
        cfTurnstile: !!document.querySelector('.cf-challenge') || !!document.querySelector('iframe[src*="challenges.cloudflare"]'),
        hcaptchaScript: !!document.querySelector('script[src*="hcaptcha.com"]'),
        recaptchaScript: !!document.querySelector('script[src*="google.com/recaptcha"]'),
        submitBtn: document.getElementById('btn-submit') ? 'found' : 'missing',
        hcaptchaSubmitBtn: document.getElementById('hcaptchaSubmitBtn') ? 'found' : 'missing',
        form: document.getElementById('application-form') ? 'found' : 'missing',
      };
    });
    console.log(`\nCAPTCHA / Security elements:`);
    Object.entries(captchaCheck).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    
    // 抓取頁面可見文字（表單區域）
    const visibleText = await page.evaluate(() => {
      return document.body.innerText.substring(0, 3000);
    });
    console.log(`\nVisible text (first 1500 chars):`);
    console.log(visibleText.substring(0, 1500));
    
    // 檢查是否有 LinkedIn 登入按鈕
    const linkedinBtn = await page.$('button:has-text("LinkedIn")');
    console.log(`\nLinkedIn button: ${linkedinBtn ? 'FOUND' : 'not found'}`);
    
    // 檢查是否有文件上傳區域
    const fileInput = await page.$('input[type="file"]');
    console.log(`File upload input: ${fileInput ? 'FOUND' : 'not found'}`);
    
    console.log(`\n\n--- Done with ${url} ---\n`);
  }
  
  await browser.close();
})();
