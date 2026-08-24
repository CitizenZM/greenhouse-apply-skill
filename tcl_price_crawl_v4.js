/**
 * TCL 价格监控 v4 — 用户指定 URL 抓取
 * 严格按用户提供的 URL，不做任何搜索或名字匹配
 * 输出 CSV + JSON
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = '/tmp/tcl_price_monitor_products.json';
const OUTPUT_DIR = '/Users/xiaozuo/Downloads/tcl_price_reports';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const CSV_FILE = path.join(OUTPUT_DIR, `tcl_prices_${TIMESTAMP}.csv`);
const JSON_FILE = path.join(OUTPUT_DIR, `tcl_prices_${TIMESTAMP}.json`);

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 读取产品列表
const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));

console.log('='.repeat(80));
console.log(`TCL 价格监控 v4 — 用户指定 URL 抓取`);
console.log(`时间: ${new Date().toLocaleString('zh-CN')}`);
console.log('='.repeat(80));
console.log(`\n共 ${products.length} 个 URL 待抓取\n`);

// 价格解析函数
function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/【【\\$€£¥,\s】】/g, '');
  const match = cleaned.match(/^(\d+\.?\d*)$/);
  if (match) return parseFloat(match[1]);
  return null;
}

// 获取页面价格的通用函数
async function extractPrice(page) {
  // 等待页面加载
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // 先尝试从页面的 JSON 数据中提取
  let priceData = await page.evaluate(() => {
    try {
      // Amazon: 从 JSON-LD 或页面数据中提取
      const scripts = document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"]');
      for (const script of scripts) {
        const data = JSON.parse(script.textContent);
        if (data && data.offers && data.offers.price) {
          return { price: data.offers.price, source: 'json-ld-offers' };
        }
        if (data && data.price) {
          return { price: data.price, source: 'json-ld' };
        }
        // Amazon specific: product data
        if (data && data.name && data.offers) {
          const offers = data.offers;
          if (typeof offers === 'object' && offers.price) {
            return { price: offers.price, source: 'product-json' };
          }
          if (Array.isArray(offers)) {
            for (const o of offers) {
              if (o.price) return { price: o.price, source: 'product-json-array' };
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  });

  if (priceData) {
    const price = parsePrice(String(priceData.price));
    if (price && price > 1) {
      return { price, source: priceData.source, method: 'json-data' };
    }
  }

  // 尝试从可见的价格元素中提取
  const priceSelectors = [
    // Amazon 通用
    '[data-testid="product-price"]',
    '.a-price .a-offscreen',
    '.a-price .a-text-price',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#corePrice_feature_div .a-price .a-offscreen',
    // Best Buy 通用  
    '[data-testid="price-block-customer-price"] span[aria-hidden="true"]',
    '.priceView-customer-price span[aria-hidden="true"]',
    '[data-testid="price-block-sale-price"] span[aria-hidden="true"]',
    '.salePrice span[aria-hidden="true"]',
    '.regularPrice span[aria-hidden="true"]',
  ];

  for (const selector of priceSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const text = await el.textContent();
        const price = parsePrice(text);
        if (price && price > 1) {
          return { price, source: selector, method: 'css-selector' };
        }
      }
    } catch (e) {
      // continue
    }
  }

  // 最后尝试: 扫描页面中所有包含 $ 的文本
  const dollarTexts = await page.evaluate(() => {
    const elements = document.querySelectorAll('span, div, p, td');
    const prices = [];
    elements.forEach(el => {
      const text = el.textContent || '';
      const matches = text.match(/\$[,\d]+\.?\d*/g);
      if (matches) {
        matches.forEach(m => {
          const cleaned = m.replace(/[$,]/g, '');
          const num = parseFloat(cleaned);
          if (num > 1 && num < 100000) {
            prices.push({ text: m, price: num, element: el.tagName });
          }
        });
      }
    });
    // 返回最可能的价格 (通常是第一个带 $ 的数字，且不太小)
    return prices.sort((a, b) => b.price - a.price).slice(0, 3);
  });

  if (dollarTexts && dollarTexts.length > 0) {
    // 取最可能的那个 (通常是最大的，而且不是太离谱)
    const best = dollarTexts.find(t => t.price > 50 && t.price < 20000);
    if (best) {
      return { price: best.price, source: `text-scan (${best.element})`, method: 'text-scan' };
    }
    // 如果没找到合适的，取第一个
    if (dollarTexts.length > 0) {
      return { price: dollarTexts[0].price, source: `text-scan-fallback (${dollarTexts[0].element})`, method: 'text-scan-fallback' };
    }
  }

  return null;
}

// 抓取单个 URL
async function fetchPrice(product, browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const result = {
    product: product.product,
    dct_pricing: product.dct_pricing,
    lowest_market_price: product.lowest_market_price,
    price_difference: product.price_difference,
    url: product.url,
    platform: product.url.includes('bestbuy.com') ? 'Best Buy' : 'Amazon',
    check_date: product.check_date,
    remark: product.remark,
    fetched_at: new Date().toISOString(),
    status: 'pending',
    price_text: null,
    price_value: null,
    http_status: null,
    page_title: null,
    error: null,
  };

  try {
    const response = await page.goto(product.url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
      referer: 'https://www.google.com/',
    });
    result.http_status = response ? response.status() : 'unknown';

    // 获取页面标题
    result.page_title = await page.title();

    // 检查是否被封锁
    const bodyText = await page.evaluate(() => {
      return document.body ? document.body.innerText.substring(0, 300) : '';
    });

    if (result.platform === 'Best Buy') {
      if (bodyText.toLowerCase().includes('robot') ||
          bodyText.toLowerCase().includes('captcha') ||
          bodyText.toLowerCase().includes('unusual activity') ||
          result.http_status === undefined) {
        result.status = '🚫 封锁/CAPTCHA';
        result.error = 'Best Buy 封锁了 headless Chromium 请求';
        // 参考 CLAUDE.md 说明
        result.remark = result.remark ? result.remark + ' | ' : '';
        result.remark += 'Best Buy HTTP2_INTERNAL_ERROR: 需要 BESTBUY_API_KEY 或搜索页面 scrape';
      } else {
        // Best Buy 成功路由
        const priceResult = await extractPrice(page);
        if (priceResult) {
          result.status = '✅ 成功';
          result.price_text = priceResult.source ? `$${priceResult.price.toFixed(2)} (从 ${priceResult.source})` : `$${priceResult.price.toFixed(2)}`;
          result.price_value = priceResult.price;
        } else {
          result.status = '⚠️ 无价格';
          result.error = '页面加载成功但未找到价格元素';
        }
      }
    } else {
      // Amazon
      if (bodyText.toLowerCase().includes('robot') ||
          bodyText.toLowerCase().includes('captcha') ||
          bodyText.toLowerCase().includes('suspicious') ||
          bodyText.toLowerCase().includes('enter the characters') ||
          bodyText.toLowerCase().includes('sorry') ||
          bodyText.toLowerCase().includes('action required') ||
          result.page_title === 'Amazon.com' || result.page_title === '') {
        result.status = '🚫 封锁/重定向';
        result.error = 'Amazon 封锁了请求或重定向到首页';
        if (result.page_title === 'Amazon.com' || result.page_title === '') {
          result.error = '重定向到 Amazon 首页，未加载到产品页面';
        }
      } else {
        const priceResult = await extractPrice(page);
        if (priceResult) {
          result.status = '✅ 成功';
          result.price_text = priceResult.source ? `$${priceResult.price.toFixed(2)} (从 ${priceResult.source})` : `$${priceResult.price.toFixed(2)}`;
          result.price_value = priceResult.price;
        } else {
          result.status = '⚠️ 无价格';
          result.error = '页面加载成功但未找到价格元素';
        }
      }
    }
  } catch (e) {
    result.status = '❌ 错误';
    result.error = e.message.substring(0, 200);
  } finally {
    await context.close();
  }

  return result;
}

// 主执行函数
async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  });

  const results = [];
  let successCount = 0;
  let blockedCount = 0;
  let errorCount = 0;
  let noPriceCount = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    console.log(`[${i + 1}/${products.length}] ${p.product} (${p.platform}) — ${p.url.split('/').pop()}`);
    const result = await fetchPrice(p, browser);
    results.push(result);

    if (result.status === '✅ 成功') successCount++;
    else if (result.status?.startsWith('🚫')) blockedCount++;
    else if (result.status === '❌ 错误') errorCount++;
    else if (result.status === '⚠️ 无价格') noPriceCount++;

    // 每 5 个打印一次进度
    if ((i + 1) % 5 === 0 || i === products.length - 1) {
      console.log(`  进度: ${i + 1}/${products.length} | ✅${successCount} 🚫${blockedCount} ⚠️${noPriceCount} ❌${errorCount}`);
    }
  }

  await browser.close();

  // 生成 CSV
  const csvHeader = 'Product,DCT_Pricing,Lowest_Market_Price,Price_Difference,URL,Platform,Check_Date,Remark,Fetched_At,Status,Price_Text,Price_Value,HTTP_Status,Page_Title,Error\n';
  const csvRows = results.map(r => {
    return [
      `"${r.product}"`,
      `"${r.dct_pricing}"`,
      `"${r.lowest_market_price}"`,
      `"${r.price_difference}"`,
      `"${r.url}"`,
      `"${r.platform}"`,
      `"${r.check_date}"`,
      `"${r.remark}"`,
      `"${r.fetched_at}"`,
      `"${r.status}"`,
      `"${r.price_text || ''}"`,
      r.price_value !== null ? r.price_value.toString() : '',
      `"${r.http_status || ''}"`,
      `"${r.page_title || ''}"`,
      `"${r.error || ''}"`,
    ].join(',');
  }).join('\n');

  fs.writeFileSync(CSV_FILE, csvHeader + csvRows);
  fs.writeFileSync(JSON_FILE, JSON.stringify(results, null, 2));

  // 生成摘要
  console.log('\n' + '='.repeat(80));
  console.log('📊 结果摘要');
  console.log('='.repeat(80));
  console.log(`总 URL: ${products.length}`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`🚫 封锁: ${blockedCount}`);
  console.log(`⚠️ 无价格: ${noPriceCount}`);
  console.log(`❌ 错误: ${errorCount}`);
  console.log(`\n📁 CSV 报告: ${CSV_FILE}`);
  console.log(`📁 JSON 数据: ${JSON_FILE}`);

  // 按平台分组统计
  const amazonResults = results.filter(r => r.platform === 'Amazon');
  const bbResults = results.filter(r => r.platform === 'Best Buy');
  console.log(`\n📱 Amazon (${amazonResults.length} 个):`);
  console.log(`  ✅ 成功: ${amazonResults.filter(r => r.status === '✅ 成功').length}`);
  console.log(`  🚫 封锁: ${amazonResults.filter(r => r.status?.startsWith('🚫')).length}`);
  console.log(`  ⚠️ 无价格: ${amazonResults.filter(r => r.status === '⚠️ 无价格').length}`);
  console.log(`\n📱 Best Buy (${bbResults.length} 个):`);
  console.log(`  ✅ 成功: ${bbResults.filter(r => r.status === '✅ 成功').length}`);
  console.log(`  🚫 封锁: ${bbResults.filter(r => r.status?.startsWith('🚫')).length}`);
  console.log(`  ⚠️ 无价格: ${bbResults.filter(r => r.status === '⚠️ 无价格').length}`);

  // 打印成功的结果详情
  if (successCount > 0) {
    console.log('\n✅ 成功抓取的价格详情:');
    console.log('-'.repeat(80));
    results.filter(r => r.status === '✅ 成功').forEach(r => {
      const dct = r.dct_pricing ? parsePrice(r.dct_pricing.replace(/[$,]/g, '')) : null;
      const diff = dct && r.price_value ? ((r.price_value - dct) / dct * 100).toFixed(1) : 'N/A';
      console.log(`  ${r.product}`);
      console.log(`    DCT 定价: ${r.dct_pricing} | 实际价格: $${r.price_value.toFixed(2)} | 差距: ${diff}%`);
      console.log(`    URL: ${r.url}`);
      console.log(`    标题: ${r.page_title}`);
      console.log('');
    });
  }

  // 打印封锁的结果
  if (blockedCount > 0) {
    console.log('\n🚫 被封锁的 URL:');
    console.log('-'.repeat(80));
    results.filter(r => r.status?.startsWith('🚫')).forEach(r => {
      console.log(`  ${r.product} (${r.platform})`);
      console.log(`    URL: ${r.url}`);
      console.log(`    状态: ${r.status}`);
      console.log(`    错误: ${r.error}`);
      console.log(`    页面标题: ${r.page_title}`);
      console.log('');
    });
  }

  console.log('\n✅ 完成!');
}

main().catch(console.error);
