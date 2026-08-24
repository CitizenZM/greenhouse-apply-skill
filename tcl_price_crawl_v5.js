/**
 * TCL 价格监控 v5 — 修正 Amazon 价格提取逻辑
 * 关键修正：Amazon 页面有多个价格（MSRP/List Price + 实际销售价）
 *          以前的文本扫描取了最高值（往往是 MSRP），现在改为取最低合理值
 *          优先从精确选择器读取，失败时智能文本扫描
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = '/tmp/tcl_price_monitor_products.json';
const OUTPUT_DIR = '/Users/xiaozuo/Downloads/tcl_price_reports';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const CSV_FILE = path.join(OUTPUT_DIR, `tcl_prices_${TIMESTAMP}.csv`);
const JSON_FILE = path.join(OUTPUT_DIR, `tcl_prices_${TIMESTAMP}.json`);

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 从 v4 结果中读取已有数据（Best Buy 的错误我们保留，仅重跑 Amazon）
const existingResults = JSON.parse(fs.readFileSync(
  '/Users/xiaozuo/Downloads/tcl_price_reports/tcl_prices_2026-08-24T16-27-07.json', 'utf-8'
));

const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));

console.log('='.repeat(80));
console.log(`TCL 价格监控 v5 — 修正 Amazon 价格提取`);
console.log(`时间: ${new Date().toLocaleString('zh-CN')}`);
console.log('='.repeat(80));

// 价格解析
function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/【【\\$€£¥,\s】】/g, '');
  const match = cleaned.match(/^(\d+\.?\d*)$/);
  return match ? parseFloat(match[1]) : null;
}

// 提取页面上的所有价格元素（带上下文）
async function extractAllPricesWithContext(page) {
  const prices = [];

  // 方法 1: 从 JSON-LD 和页面数据提取
  try {
    const jsonData = await page.evaluate(() => {
      const results = [];
      const scripts = document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"]');
      scripts.forEach(script => {
        try {
          const data = JSON.parse(script.textContent);
          results.push({ source: 'json-ld', data });
        } catch (e) {}
      });
      return results;
    });

    for (const item of jsonData) {
      const { source, data } = item;
      // 提取所有价格字段
      function extractPrices(obj, path = '') {
        if (!obj || typeof obj !== 'object') return;
        if (typeof obj === 'number' && obj > 1 && obj < 100000) {
          prices.push({ price: obj, source: source + path, context: 'JSON' });
        }
        if (Array.isArray(obj)) {
          obj.forEach((item, i) => extractPrices(item, `${path}[${i}]`));
        } else {
          Object.entries(obj).forEach(([key, val]) => {
            if (key === 'price' || key === 'lowPrice' || key === 'highPrice' ||
                key === 'offerPrice' || key === 'sellerPrice' || key === 'ourPrice' ||
                key === 'msrp' || key === 'listPrice' || key === 'mapPrice') {
              if (typeof val === 'number') {
                prices.push({ price: val, source: source + '.' + key, context: key });
              } else if (typeof val === 'string') {
                const p = parsePrice(val);
                if (p) prices.push({ price: p, source: source + '.' + key, context: key });
              }
            }
            extractPrices(val, path + '.' + key);
          });
        }
      }
      extractPrices(data);
    }
  } catch (e) {
    console.log(`  JSON 提取错误: ${e.message}`);
  }

  // 方法 2: 从可见元素提取（带文本内容）
  try {
    const elementPrices = await page.evaluate(() => {
      const results = [];
      const priceEls = document.querySelectorAll(
        '.a-price .a-offscreen, .a-price .a-text-price, #priceblock_ourprice, ' +
        '#priceblock_dealprice, #corePrice_feature_div .a-price .a-offscreen, ' +
        '.apexPriceToPay .a-offscreen, .priceToPay .a-offscreen, ' +
        '[data-testid="product-price"], .pu-pct-you-pay-price, .a-span9, ' +
        '.a-color-price, #priceblock_ourprice, .a-size-medium.a-color-price'
      );

      priceEls.forEach(el => {
        const text = (el.textContent || '').trim();
        const price = parsePrice(text);
        if (price && price > 1 && price < 100000) {
          // 获取父元素的上下文文本（看看是不是 "List Price"）
          let context = '';
          let parent = el.parentElement;
          for (let i = 0; i < 3 && parent; i++) {
            context = parent.textContent || ''.concat(context);
            parent = parent.parentElement;
          }
          results.push({
            price,
            selector: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
            text: text,
            context: context.substring(0, 100),
            xpath: ''
          });
        }
      });

      return results;
    });

    prices.push(...elementPrices.map(e => ({
      price: e.price,
      source: e.selector,
      context: e.context,
      text: e.text
    })));
  } catch (e) {
    console.log(`  元素提取错误: ${e.message}`);
  }

  // 方法 3: 有趣的 — 扫描所有 $ 文本，但记录上下文
  try {
    const allTexts = await page.evaluate(() => {
      const results = [];
      const elements = document.querySelectorAll('*');
      elements.forEach(el => {
        const text = (el.textContent || '').trim();
        if (text.length > 3 && text.length < 200) {
          const matches = text.match(/\$[\d,]+\.?\d*/g);
          if (matches) {
            matches.forEach(m => {
              const cleaned = m.replace(/[$,]/g, '');
              const num = parseFloat(cleaned);
              if (num > 50 && num < 100000) {
                // 获取周围上下文（看看前后是否有 "List Price"、"MSRP" 等关键字）
                let ctx = '';
                let parent = el.parentElement;
                for (let i = 0; i < 4 && parent; i++) {
                  ctx = (parent.textContent || '').trim();
                  if (ctx.length > 5) break;
                  parent = parent.parentElement;
                }
                results.push({
                  price: num,
                  text: m,
                  context: ctx.substring(0, 150),
                  tag: el.tagName
                });
              }
            });
          }
        }
      });
      return results;
    });

    // 去重（相同的 price + context）
    const unique = [];
    const seen = new Set();
    for (const item of allTexts) {
      const key = `${item.price}-${item.context.substring(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }
    prices.push(...unique.map(e => ({
      price: e.price,
      source: `text:${e.tag}`,
      context: e.context,
      text: e.text
    })));
  } catch (e) {
    console.log(`  文本扫描错误: ${e.message}`);
  }

  return prices;
}

// 智能选择正确的价格
function selectBestPrice(prices, dctPrice) {
  if (!prices || prices.length === 0) return null;

  const dct = parsePrice(dctPrice);
  const dctNum = dct ? dct : null;

  //  Strategy 1: 如果有明确的 "ourprice" / "selling price" 上下文，优先
  const sellingPriceCandidates = prices.filter(p => {
    const ctx = (p.context || p.text || '').toLowerCase();
    return ctx.includes('ourprice') || ctx.includes('you pay') ||
           ctx.includes('price') && !ctx.includes('list') && !ctx.includes('msrp') &&
           !ctx.includes('map') && !ctx.includes('compare') && !ctx.includes('was');
  });

  if (sellingPriceCandidates.length > 0) {
    // 如果有 DCT 价格，选最接近的
    if (dctNum) {
      sellingPriceCandidates.sort((a, b) => {
        const da = Math.abs(a.price - dctNum);
        const db = Math.abs(b.price - dctNum);
        return da - db;
      });
    }
    // 否则选最低的（通常是实际销售价）
    const best = sellingPriceCandidates.sort((a, b) => a.price - b.price)[0];
    if (best.price < (dctNum || best.price * 1.5)) {
      return best;
    }
  }

  // Strategy 2: 排除明显是 MSRP/List Price 的价格
  const nonMsrpPrices = prices.filter(p => {
    const ctx = (p.context || p.text || '').toLowerCase();
    return !ctx.includes('list price') && !ctx.includes('msrp') &&
           !ctx.includes('manufacturer') && !ctx.includes('compare at') &&
           !ctx.includes('map') && !ctx.includes('was') && !ctx.includes('see all');
  });

  if (nonMsrpPrices.length > 0) {
    if (dctNum) {
      nonMsrpPrices.sort((a, b) => {
        const da = Math.abs(a.price - dctNum);
        const db = Math.abs(b.price - dctNum);
        return da - db;
      });
    }
    // 优先选择低于 DCT 50% 以上的合理折扣价，或者低于 MSRP 的价格
    const sorted = nonMsrpPrices.sort((a, b) => a.price - b.price);
    // 取最合理的：不超过 DCT 200%，且不是最高的
    const reasonable = sorted.filter(p => p.price <= (dctNum ? dctNum * 2 : 20000));
    if (reasonable.length > 0) {
      return reasonable[0]; // 最低的合理价格
    }
    return sorted[0];
  }

  // Strategy 3: 回退 — 如果有 DCT 价格，选最接近的
  if (dctNum) {
    const sorted = [...prices].sort((a, b) => {
      const da = Math.abs(a.price - dctNum);
      const db = Math.abs(b.price - dctNum);
      return da - db;
    });
    return sorted[0];
  }

  // Strategy 4: 回退 — 取最低的
  return [...prices].sort((a, b) => a.price - b.price)[0];
}

// 抓取单个 Amazon URL
async function fetchAmazonPrice(product, browser) {
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
    platform: 'Amazon',
    check_date: product.check_date,
    remark: product.remark,
    fetched_at: new Date().toISOString(),
    status: 'pending',
    price_text: null,
    price_value: null,
    http_status: null,
    page_title: null,
    error: null,
    price_details: null,  // 调试信息
  };

  try {
    const response = await page.goto(product.url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
      referer: 'https://www.google.com/',
    });
    result.http_status = response ? response.status() : 'unknown';
    result.page_title = await page.title();

    // 等待价格加载
    await page.waitForTimeout(3000);

    // 检查封锁
    const bodyText = await page.evaluate(() => {
      return document.body ? document.body.innerText.substring(0, 300) : '';
    });

    if (bodyText.toLowerCase().includes('robot') ||
        bodyText.toLowerCase().includes('captcha') ||
        bodyText.toLowerCase().includes('suspicious') ||
        bodyText.toLowerCase().includes('enter the characters') ||
        bodyText.toLowerCase().includes('sorry') ||
        bodyText.toLowerCase().includes('action required') ||
        result.page_title === '' || result.page_title === 'Amazon.com') {
      result.status = '🚫 封锁/重定向';
      result.error = result.page_title === 'Amazon.com' || result.page_title === ''
        ? '重定向到 Amazon 首页，未加载到产品页面'
        : 'Amazon 封锁了请求';
      return result;
    }

    // 提取所有价格
    const allPrices = await extractAllPricesWithContext(page);
    result.price_details = {
      total_found: allPrices.length,
      prices: allPrices.slice(0, 10).map(p => ({
        price: p.price,
        source: p.source,
        context: (p.context || '') + (p.text ? ' | text: ' + p.text : '')
      }))
    };

    // 智能选择最佳价格
    const bestPrice = selectBestPrice(allPrices, product.dct_pricing);

    if (bestPrice) {
      result.price_value = bestPrice.price;
      const dct = parsePrice(product.dct_pricing);
      const diffPercent = dct ? ((bestPrice.price - dct) / dct * 100).toFixed(1) : 'N/A';

      result.price_text = `$${bestPrice.price.toFixed(2)}`;
      if (bestPrice.source) {
        result.price_text += ` [源: ${bestPrice.source}]`;
      }
      if (bestPrice.context) {
        const ctxShort = bestPrice.context.substring(0, 80).replace(/\n/g, ' ');
        result.price_text += ` [上下文: ${ctxShort}]`;
      }

      // 判断是否合理
      const diff = dct ? bestPrice.price - dct : 0;
      if (Math.abs(diffPercent) < 50 || bestPrice.price < dct * 1.2) {
        result.status = '✅ 成功 (合理)';
      } else if (bestPrice.price > dct * 1.5) {
        result.status = '⚠️ 成功但价格偏高（可能是 MSRP）';
        result.error = `抓取价格 $${bestPrice.price.toFixed(2)} 比 DCT $${dct.toFixed(2)} 高 ${diffPercent}%，可能抓到了列表价而非销售价`;
      } else {
        result.status = '✅ 成功';
      }
    } else {
      result.status = '⚠️ 无价格';
      result.error = '页面加载成功但未找到任何价格信息';
    }
  } catch (e) {
    result.status = '❌ 错误';
    result.error = e.message.substring(0, 200);
  } finally {
    await context.close();
  }

  return result;
}

// 主函数
async function main() {
  // 分离 Amazon 和 Best Buy
  const amazonProducts = products.filter(p => p.url.includes('amazon.com'));
  const bbProducts = products.filter(p => p.url.includes('bestbuy.com'));

  console.log(`\nAmazon URL: ${amazonProducts.length} 个`);
  console.log(`Best Buy URL: ${bbProducts.length} 个`);

  // Best Buy 结果直接从 v4 结果复制（已知失败）
  const bbResults = bbProducts.map(p => {
    const existing = existingResults.find(r => r.url === p.url);
    return {
      ...existing || {
        product: p.product,
        dct_pricing: p.dct_pricing,
        lowest_market_price: p.lowest_market_price,
        price_difference: p.price_difference,
        url: p.url,
        platform: 'Best Buy',
        check_date: p.check_date,
        remark: p.remark,
        fetched_at: new Date().toISOString(),
        status: '🚫 封锁',
        price_text: null,
        price_value: null,
        http_status: null,
        page_title: null,
        error: 'Best Buy 封锁 headless Chromium HTTP2 请求，需要 BESTBUY_API_KEY 或搜索页面 scrape',
      },
      retry_attempt: 'v5'
    };
  });

  // 重跑 Amazon
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

  const amazonResults = [];
  for (let i = 0; i < amazonProducts.length; i++) {
    const p = amazonProducts[i];
    console.log(`\n[${i + 1}/${amazonProducts.length}] ${p.product}`);
    console.log(`  URL: ${p.url.split('/').pop()}`);
    const result = await fetchAmazonPrice(p, browser);
    amazonResults.push(result);

    console.log(`  状态: ${result.status}`);
    console.log(`  价格: ${result.price_text || 'N/A'}`);
    if (result.price_details) {
      console.log(`  发现 ${result.price_details.total_found} 个价格候选，取样:`);
      result.price_details.prices.slice(0, 5).forEach((pp, idx) => {
        console.log(`    ${idx + 1}. $${pp.price.toFixed(2)} — ${pp.source || pp.context ? pp.source + ' | ' + pp.context : ''}`);
      });
    }
    if (result.error) {
      console.log(`  备注: ${result.error}`);
    }
  }

  await browser.close();

  // 合并结果
  const allResults = [...amazonResults, ...bbResults];

  // 生成更新的 CSV
  const csvHeader = 'Product,DCT_Pricing,Lowest_Market_Price,Price_Difference,URL,Platform,Check_Date,Remark,Fetched_At,Status,Price_Text,Price_Value,HTTP_Status,Page_Title,Error\n';
  const csvRows = allResults.map(r => {
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

  // 写文件（覆盖 v4 文件）
  fs.writeFileSync(CSV_FILE, csvHeader + csvRows);
  fs.writeFileSync(JSON_FILE, JSON.stringify(allResults, null, 2));

  // 摘要
  console.log('\n' + '='.repeat(80));
  console.log('📊 修正后结果摘要');
  console.log('='.repeat(80));

  const amazonSuccess = amazonResults.filter(r => r.status?.startsWith('✅'));
  const amazonWarning = amazonResults.filter(r => r.status?.startsWith('⚠️'));
  const amazonFailed = amazonResults.filter(r => r.status?.startsWith('🚫') || r.status?.startsWith('❌'));
  const bbFailed = bbResults.filter(r => r.status?.startsWith('🚫') || r.status?.startsWith('❌'));

  console.log(`\n🍎 Amazon (${amazonProducts.length} 个):`);
  console.log(`  ✅ 成功 (合理): ${amazonSuccess.length}`);
  console.log(`  ⚠️ 成功但可疑: ${amazonWarning.length}`);
  console.log(`  ❌ 失败: ${amazonFailed.length}`);

  console.log(`\n🏬 Best Buy (${bbProducts.length} 个):`);
  console.log(`  ❌ 全部失败 (封锁): ${bbFailed.length}`);

  console.log(`\n📁 CSV: ${CSV_FILE}`);
  console.log(`📁 JSON: ${JSON_FILE}`);

  // 打印成功抓取的价格明细
  console.log('\n✅ 合理价格结果:');
  console.log('-'.repeat(80));
  amazonSuccess.forEach(r => {
    const dct = parsePrice(r.dct_pricing);
    const diff = dct ? ((r.price_value - dct) / dct * 100).toFixed(1) : 'N/A';
    console.log(`\n  ${r.product}`);
    console.log(`    DCT 定价: ${r.dct_pricing}`);
    console.log(`    实际价格: $${r.price_value.toFixed(2)}`);
    console.log(`    差距: ${diff}%`);
    console.log(`    状态: ${r.status}`);
    console.log(`    来源: ${r.price_text}`);
    if (r.price_details && r.price_details.prices.length > 0) {
      const top = r.price_details.prices[0];
      console.log(`    选择依据: $${top.price.toFixed(2)} (${top.source || top.context})`);
    }
  });

  // 打印可疑结果
  if (amazonWarning.length > 0) {
    console.log('\n⚠️  可疑价格 (可能抓到 MSRP):');
    console.log('-'.repeat(80));
    amazonWarning.forEach(r => {
      const dct = parsePrice(r.dct_pricing);
      const diff = dct ? ((r.price_value - dct) / dct * 100).toFixed(1) : 'N/A';
      console.log(`\n  ${r.product}`);
      console.log(`    DCT: ${r.dct_pricing} | 抓取: $${r.price_value.toFixed(2)} | 差距: ${diff}%`);
      console.log(`    状态: ${r.status}`);
      console.log(`    错误: ${r.error}`);
    });
  }

  console.log('\n✅ v5 执行完成!');
}

main().catch(console.error);
