/**
 * TCL 价格监控 v6 — 修正版
 * 关键修复：
 * 1. 不在 page.evaluate() 中调用 Node.js 函数
 * 2. 优先读取 Amazon 的特定价格元素（.a-offscreen, #priceblock_ourprice 等）
 * 3. 这些元素通常包含实际销售价，而非 MSRP/列表价
 * 4.  intelligently 筛选：结合 DCT 定价，排除明显不合理的交叉销售价格
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

const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));

console.log('='.repeat(80));
console.log(`TCL 价格监控 v6 — 修正 Amazon 价格提取`);
console.log(`时间: ${new Date().toLocaleString('zh-CN')}`);
console.log('='.repeat(80));
console.log(`\n共 ${products.length} 个 URL（${products.filter(p => p.url.includes('amazon.com')).length} Amazon + ${products.filter(p => p.url.includes('bestbuy.com')).length} Best Buy）\n`);

// 价格解析（纯字符串处理）
function parsePrice(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/[$,\s]/g, '');
  const match = cleaned.match(/^(\d+\.?\d*)$/);
  return match ? parseFloat(match[1]) : null;
}

// 提取 Amazon 价格元素的文本内容（纯浏览器端操作，不依赖 Node.js 函数）
async function getAmazonPriceElements(page) {
  const elements = await page.evaluate(() => {
    const results = [];
    const selectors = [
      // 主要销售价元素
      '#priceblock_ourprice',
      '#priceblock_dealprice', 
      '#corePrice_feature_div .a-price .a-offscreen',
      '.a-price .a-offscreen',
      '.a-price .a-text-price',
      '.apexPriceToPay .a-offscreen',
      '.priceToPay .a-offscreen',
      '#bvmlx-price .a-price .a-offscreen',
      '#buyBoxReaderId .a-price .a-offscreen',
      '[data-testid="product-price"]',
      '.pu-pct-you-pay-price',
      '.a-span9 .a-color-price',
      '.a-size-medium.a-color-price',
      '.a-size-large.a-color-price',
      // 次要/列出价格（用于对比）
      '#priceblock_listprice',
      '.a-size-medium.a-text-normal.a-color-price',
    ];

    for (const selector of selectors) {
      try {
        const els = document.querySelectorAll(selector);
        els.forEach(el => {
          const text = (el.textContent || '').trim();
          if (text) {
            results.push({
              selector: selector,
              text: text,
              tag: el.tagName,
              className: el.className || '',
              id: el.id || '',
              rect: el.getBoundingClientRect ? {
                x: el.getBoundingClientRect().x,
                y: el.getBoundingClientRect().y,
                width: el.getBoundingClientRect().width,
                height: el.getBoundingClientRect().height,
              } : null,
            });
          }
        });
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }

    return results;
  });

  return elements;
}

// 提取页面中所有包含 $ 的文本元素（用于兜底）
async function getTextScanPrices(page) {
  const prices = await page.evaluate(() => {
    const results = [];
    const allElements = document.querySelectorAll('span, div, p, td, li');
    
    allElements.forEach(el => {
      const text = (el.textContent || '').trim();
      if (text.length > 2 && text.length < 300) {
        // 查找所有 $ 数字
        const matches = text.match(/\$[\d,]+\.?\d*/g);
        if (matches) {
          matches.forEach(m => {
            const cleaned = m.replace(/[$,]/g, '');
            const num = parseFloat(cleaned);
            if (num && num > 10 && num < 100000) {
              // 获取周围上下文（父元素的文本，用于判断是不是销售价）
              let context = '';
              let parent = el.parentElement;
              for (let i = 0; i < 4 && parent; i++) {
                const pText = (parent.textContent || '').trim();
                if (pText.length > context.length) context = pText;
                parent = parent.parentElement;
              }
              // 上下文关键词标记
              const ctxLower = context.toLowerCase();
              let type = 'unknown';
              if (ctxLower.includes('ourprice') || ctxLower.includes('you pay')) type = 'ourprice';
              else if (ctxLower.includes('list price') || ctxLower.includes('msrp') || ctxLower.includes('manufacturer')) type = 'list_price';
              else if (ctxLower.includes('compare') && ctxLower.includes('price')) type = 'compare_price';
              else if (ctxLower.includes('used') || ctxLower.includes('new')) type = 'condition_price';
              else if (ctxLower.includes('from') && ctxLower.includes('price')) type = 'from_price';
              else if (ctxLower.includes('price') && !ctxLower.includes('list') && !ctxLower.includes('msrp')) type = 'price_mention';
              
              results.push({
                price: num,
                text: m,
                type: type,
                context: context.substring(0, 200).replace(/\n/g, ' '),
                selector: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
              });
            }
          });
        }
      }
    });

    return results;
  });

  return prices;
}

// 智能选择最佳价格
function selectBestPrice(textPrices, dctPrice) {
  const dct = parsePrice(dctPrice);
  const dctNum = dct || null;

  if (!textPrices || textPrices.length === 0) return null;

  // 1. 优先选择类型为 'ourprice' 的价格（Amazon 的实际销售价）
  const ourpriceCandidates = textPrices.filter(p => p.type === 'ourprice');
  if (ourpriceCandidates.length > 0) {
    // 如果有 DCT，选最接近的
    if (dctNum) {
      ourpriceCandidates.sort((a, b) => Math.abs(a.price - dctNum) - Math.abs(b.price - dctNum));
    } else {
      ourpriceCandidates.sort((a, b) => a.price - b.price);
    }
    return ourpriceCandidates[0];
  }

  // 2. 排除列表价/MSRP，选择剩下的价格中最合理的
  const nonListPrices = textPrices.filter(p => {
    return p.type !== 'list_price' && p.type !== 'compare_price' && p.type !== 'condition_price';
  });

  if (nonListPrices.length > 0) {
    if (dctNum) {
      // 选最接近 DCT 的价格
      nonListPrices.sort((a, b) => Math.abs(a.price - dctNum) - Math.abs(b.price - dctNum));
      const best = nonListPrices[0];
      // 但排除明显高于 DCT 50% 以上的（可能是交叉销售或其他产品的价格）
      if (best.price <= dctNum * 1.5) {
        return best;
      }
      // 如果最接近的也太高了，找一个合理范围内的
      const reasonable = nonListPrices.filter(p => p.price <= dctNum * 1.5 && p.price >= dctNum * 0.3);
      if (reasonable.length > 0) {
        reasonable.sort((a, b) => a.price - b.price);
        return reasonable[0];
      }
      return best;
    } else {
      // 没有 DCT，取最低的非列表价
      nonListPrices.sort((a, b) => a.price - b.price);
      return nonListPrices[0];
    }
  }

  // 3. 回退：所有价格中，选最接近 DCT 的
  if (dctNum) {
    const sorted = [...textPrices].sort((a, b) => Math.abs(a.price - dctNum) - Math.abs(b.price - dctNum));
    return sorted[0];
  }

  // 4. 回退：取最低的
  const sorted = [...textPrices].sort((a, b) => a.price - b.price);
  return sorted[0];
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
    price_debug: null,
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
    await page.waitForTimeout(2000);

    // 检查封锁
    const bodyText = await page.evaluate(() => {
      return document.body ? document.body.innerText.substring(0, 200) : '';
    });
    const title = result.page_title || '';

    if (bodyText.toLowerCase().includes('robot') ||
        bodyText.toLowerCase().includes('captcha') ||
        bodyText.toLowerCase().includes('suspicious') ||
        bodyText.toLowerCase().includes('enter the characters') ||
        bodyText.toLowerCase().includes('sorry') ||
        bodyText.toLowerCase().includes('action required') ||
        title === '' || title === 'Amazon.com') {
      result.status = title === '' || title === 'Amazon.com' ? '🚫 重定向到首页' : '🚫 封锁';
      result.error = title === 'Amazon.com' || title === ''
        ? '重定向到 Amazon 首页，未加载到产品页面'
        : 'Amazon 封锁了请求';
      return result;
    }

    // 方法 1：获取 Amazon 特定价格元素
    const priceElements = await getAmazonPriceElements(page);
    
    // 方法 2：文本扫描获取所有价格
    const textPrices = await getTextScanPrices(page);

    // 合并分析
    const allPrices = [
      ...priceElements.map(e => ({
        price: parsePrice(e.text),
        source: e.selector,
        type: e.id.includes('ourprice') ? 'ourprice' : 
              e.id.includes('listprice') ? 'list_price' : 'price_element',
        text: e.text,
        context: '',
      })).filter(e => e.price !== null),
      ...textPrices,
    ];

    result.price_debug = {
      price_elements_count: priceElements.length,
      text_prices_count: textPrices.length,
      total_candidates: allPrices.length,
      price_elements: priceElements.slice(0, 5).map(e => ({
        selector: e.selector,
        text: e.text,
        parsed: parsePrice(e.text),
      })),
      text_prices_sample: textPrices.slice(0, 10).map(p => ({
        price: p.price,
        type: p.type,
        text: p.text,
        context: p.context.substring(0, 80),
      })),
    };

    // 选择最佳价格
    const bestPrice = selectBestPrice(textPrices, product.dct_pricing);

    if (bestPrice) {
      result.price_value = bestPrice.price;
      const dct = parsePrice(product.dct_pricing);
      const diffPercent = dct ? ((bestPrice.price - dct) / dct * 100).toFixed(1) : 'N/A';

      let priceDesc = `$${bestPrice.price.toFixed(2)}`;
      if (bestPrice.source) priceDesc += ` [${bestPrice.source}]`;
      if (bestPrice.type) priceDesc += ` [类型: ${bestPrice.type}]`;
      if (bestPrice.context) {
        const ctxShort = bestPrice.context.substring(0, 100).replace(/\n/g, ' ');
        priceDesc += ` [上下文: ${ctxShort}]`;
      }
      result.price_text = priceDesc;

      // 判断合理性
      if (dct) {
        const diff = bestPrice.price - dct;
        const absDiffPercent = Math.abs(diffPercent);
        if (absDiffPercent < 30) {
          result.status = '✅ 成功 (合理)';
        } else if (bestPrice.price < dct) {
          result.status = '✅ 成功 (低于 DCT)';
        } else if (absDiffPercent < 100) {
          result.status = '✅ 成功 (高于 DCT 但合理)';
        } else {
          result.status = '⚠️ 成功但价格偏高';
          result.error = `抓取 $${bestPrice.price.toFixed(2)} 比 DCT $${dct.toFixed(2)} 高 ${diffPercent}% — 可能不是销售价`;
        }
      } else {
        result.status = '✅ 成功';
      }
    } else {
      result.status = '⚠️ 无价格';
      result.error = '未找到任何价格信息';
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
  const amazonProducts = products.filter(p => p.url.includes('amazon.com'));
  const bbProducts = products.filter(p => p.url.includes('bestbuy.com'));

  console.log(`🔍 Amazon URL: ${amazonProducts.length} 个`);
  console.log(`🏬 Best Buy URL: ${bbProducts.length} 个`);

  // Best Buy 始终失败，直接生成结果
  const bbResults = bbProducts.map(p => ({
    product: p.product,
    dct_pricing: p.dct_pricing,
    lowest_market_price: p.lowest_market_price,
    price_difference: p.price_difference,
    url: p.url,
    platform: 'Best Buy',
    check_date: p.check_date,
    remark: p.remark + (p.remark ? ' | ' : '') + 'Best Buy HTTP2_INTERNAL_ERROR: 需要 BESTBUY_API_KEY 或搜索页面 scrape',
    fetched_at: new Date().toISOString(),
    status: '🚫 封锁',
    price_text: null,
    price_value: null,
    http_status: null,
    page_title: null,
    error: 'Best Buy 封锁 headless Chromium HTTP2 请求。解决方案：1) 注册 BESTBUY_API_KEY (https://developer.bestbuy.com/) 使用官方 Products API；2) 使用搜索页面 scrape 而非产品页面',
  }));

  // 重跑 Amazon
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--disable-gpu'],
  });

  const amazonResults = [];
  for (let i = 0; i < amazonProducts.length; i++) {
    const p = amazonProducts[i];
    const num = String(i + 1).padStart(2, ' ');
    console.log(`\n[${num}/${ amazonProducts.length}] ${p.product}`);
    const result = await fetchAmazonPrice(p, browser);
    amazonResults.push(result);

    console.log(`  🔍 状态: ${result.status}`);
    console.log(`  💰 价格: ${result.price_text || 'N/A'}`);
    if (result.price_debug) {
      const pd = result.price_debug;
      console.log(`  📊 候选: ${pd.total_candidates} 个 (特定元素 ${pd.price_elements_count} + 文本扫描 ${pd.text_prices_count})`);
      if (pd.price_elements.length > 0) {
        console.log(`  📍 特定元素:`);
        pd.price_elements.forEach((pe, idx) => {
          console.log(`     ${idx + 1}. [${pe.selector}] → "${pe.text}" (解析: ${pe.parsed !== null ? '$' + pe.parsed.toFixed(2) : '失败'})`);
        });
      }
      if (pd.text_prices_sample.length > 0) {
        console.log(`  📍 文本扫描样本:`);
        pd.text_prices_sample.forEach((tp, idx) => {
          console.log(`     ${idx + 1}. $${tp.price.toFixed(2)} [${tp.type}] — ${tp.text} — ${tp.context}`);
        });
      }
    }
    if (result.error && result.status.includes('⚠️')) {
      console.log(`  ⚠️  备注: ${result.error}`);
    }
  }

  await browser.close();

  // 合并
  const allResults = [...amazonResults, ...bbResults];

  // 生成 CSV
  const csvHeader = 'Product,DCT_Pricing,Lowest_Market_Price,Price_Difference,URL,Platform,Check_Date,Remark,Fetched_At,Status,Price_Text,Price_Value,HTTP_Status,Page_Title,Error\n';
  const csvRows = allResults.map(r => [
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
  ].join(','));

  fs.writeFileSync(CSV_FILE, csvHeader + csvRows);
  fs.writeFileSync(JSON_FILE, JSON.stringify(allResults, null, 2));

  // 摘要
  console.log('\n' + '='.repeat(80));
  console.log('📊 v6 修正后结果摘要');
  console.log('='.repeat(80));

  const amznSuccess = amazonResults.filter(r => r.status?.startsWith('✅'));
  const amznWarning = amazonResults.filter(r => r.status?.startsWith('⚠️'));
  const amznFailed = amazonResults.filter(r => r.status?.startsWith('🚫') || r.status?.startsWith('❌'));
  const amznNoPrice = amazonResults.filter(r => r.status === '⚠️ 无价格');

  console.log(`\n🍎 Amazon (${amazonProducts.length} 个):`);
  console.log(`  ✅ 成功 (合理): ${amznSuccess.length}`);
  console.log(`  ✅ 成功 (其他): ${amznSuccess.length + amznWarning.length - amznSuccess.length}`);
  console.log(`  ⚠️  可疑/偏高: ${amznWarning.length}`);
  console.log(`  ⚠️  无价格: ${amznNoPrice.length}`);
  console.log(`  ❌ 失败: ${amznFailed.length}`);

  console.log(`\n🏬 Best Buy (${bbProducts.length} 个):`);
  console.log(`  ❌ 全部封锁: ${bbResults.length}`);

  console.log(`\n📁 CSV: ${CSV_FILE}`);
  console.log(`📁 JSON: ${JSON_FILE}`);

  // 成功结果明细
  if (amznSuccess.length > 0) {
    console.log('\n✅ 合理价格结果:');
    console.log('-'.repeat(80));
    amznSuccess.forEach(r => {
      const dct = parsePrice(r.dct_pricing);
      const diff = dct ? ((r.price_value - dct) / dct * 100).toFixed(1) : 'N/A';
      console.log(`\n  ${r.product}`);
      console.log(`    DCT 定价: ${r.dct_pricing} | 实际价格: $${r.price_value.toFixed(2)} | 差距: ${diff}%`);
      console.log(`    状态: ${r.status}`);
      console.log(`    来源: ${r.price_text}`);
    });
  }

  // 可疑结果
  if (amznWarning.length > 0) {
    console.log('\n⚠️  可疑价格 (可能不是销售价):');
    console.log('-'.repeat(80));
    amznWarning.forEach(r => {
      const dct = parsePrice(r.dct_pricing);
      const diff = dct ? ((r.price_value - dct) / dct * 100).toFixed(1) : 'N/A';
      console.log(`\n  ${r.product}`);
      console.log(`    DCT: ${r.dct_pricing} | 抓取: $${r.price_value.toFixed(2)} | 差距: ${diff}%`);
      console.log(`    状态: ${r.status}`);
      console.log(`    来源: ${r.price_text}`);
      if (r.error) console.log(`    备注: ${r.error}`);
    });
  }

  console.log('\n✅ v6 执行完成!');
}

main().catch(console.error);
