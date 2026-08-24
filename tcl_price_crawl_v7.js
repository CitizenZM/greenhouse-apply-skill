/**
 * TCL 价格监控 v7 — 专门针对 Amazon 的实际销售价提取
 * 
 * 核心策略：
 * 1. 只读取带有特定语义类名的元素（a-offscreen 中的实际价格 vs 列表价）
 * 2. 识别 "List Price" / "MSRP" / "Compare At" 等标记，排除附近的价格
 * 3. 优先选择带有 "You save" / "Save" 上下文的价格（即实际销售价）
 * 4. 兜底：在所有带 $ 符号的 visible 元素中，排除明显不是销售价的
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
console.log(`TCL 价格监控 v7 — 专门针对 Amazon 实际销售价`);
console.log(`时间: ${new Date().toLocaleString('zh-CN')}`);
console.log('='.repeat(80));
console.log(`\n共 ${products.length} 个 URL：${products.filter(p => p.url.includes('amazon.com')).length} Amazon + ${products.filter(p => p.url.includes('bestbuy.com')).length} Best Buy\n`);

// 价格解析
function parsePrice(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/[$,\s]/g, '');
  const match = cleaned.match(/^(\d+\.?\d*)$/);
  return match ? parseFloat(match[1]) : null;
}

// 从 Amazon 页面提取价格候选（带丰富上下文）
async function extractAmazonPrices(page) {
  return await page.evaluate(() => {
    // 在浏览器上下文中定义 parsePrice
    function parsePrice(str) {
      if (!str) return null;
      const cleaned = String(str).replace(/[$,\s]/g, '');
      const match = cleaned.match(/^(\d+\.?\d*)$/);
      return match ? parseFloat(match[1]) : null;
    }

    const candidates = [];

    // === 第一层：从特定 Amazon 价格元素提取 ===
    const priceEls = document.querySelectorAll(
      '.a-price .a-offscreen, ' +
      '#priceblock_ourprice, ' +
      '#priceblock_dealprice, ' +
      '#corePrice_feature_div .a-price .a-offscreen, ' +
      '.a-price .a-text-price, ' +
      '.apexPriceToPay .a-offscreen, ' +
      '.priceToPay .a-offscreen'
    );

    priceEls.forEach(el => {
      const text = (el.textContent || '').trim();
      const price = parsePrice(text);
      if (!price || price < 10 || price > 100000) return;

      // 获取这个元素周围的上下文（父元素及祖先）
      let context = '';
      let grandparent = el.parentElement?.parentElement;
      for (let i = 0; i < 4 && grandparent; i++) {
        const txt = (grandparent.textContent || '').trim();
        if (txt.length > context.length) context = txt;
        grandparent = grandparent.parentElement;
      }

      // 获取更准确的祖先标签路径
      let tagPath = el.tagName;
      let parent = el.parentElement;
      let pathParts = [tagPath];
      while (parent && pathParts.length < 6) {
        pathParts.unshift(parent.tagName);
        parent = parent.parentElement;
      }
      const tagPathStr = pathParts.join(' > ');

      candidates.push({
        type: 'price_element',
        price,
        text,
        context: context.substring(0, 300).replace(/\n/g, ' '),
        tagPath: tagPathStr,
        elementIndex: candidates.length,
      });
    });

    // === 第二层：扫描所有可见元素中的 $ 价格 ===
    const allEls = document.querySelectorAll('span, div, p, td, li, h1, h2, h3');
    allEls.forEach(el => {
      const text = (el.textContent || '').trim();
      if (text.length < 3 || text.length > 500) return;

      // 查找这个元素内的 $ 价格
      const dollarMatches = text.match(/\$[\d,]+\.?\d*/g);
      if (!dollarMatches) return;

      dollarMatches.forEach(m => {
        const price = parsePrice(m);
        if (!price || price < 10 || price > 100000) return;

        // 获取这个元素的祖先上下文（同样的方法，但只取一层）
        let context = (el.parentElement?.textContent || '').trim().substring(0, 200).replace(/\n/g, ' ');

        // 判断这个价格的类型
        const contextLower = (text + ' ' + context).toLowerCase();
        let priceType = 'unknown';

        if (contextLower.includes('list price') || contextLower.includes('listprice') || 
            contextLower.includes('msrp') || contextLower.includes('manufacturer') ||
            (contextLower.includes('compare') && contextLower.includes('price'))) {
          priceType = 'list_or_compare_price';
        } else if (contextLower.includes('you save') || contextLower.includes('save') || 
                   contextLower.includes('on sale') || contextLower.includes('sale') ||
                   (contextLower.includes('ourprice') && !contextLower.includes('list'))) {
          priceType = 'sale_price';
        } else if (contextLower.includes('used') || contextLower.includes('refurbished') || 
                   contextLower.includes('new') && contextLower.includes('from')) {
          priceType = 'condition_price';
        } else if (contextLower.includes('from') && contextLower.includes('price')) {
          priceType = 'from_price';
        } else if (contextLower.includes('price') && !contextLower.includes('list')) {
          priceType = 'price_mention';
        }

        candidates.push({
          type: 'text_scan',
          price,
          text: m,
          context: context.substring(0, 200).replace(/\n/g, ' '),
          priceType,
          tagPath: el.tagName,
          elementIndex: candidates.length,
        });
      });
    });

    return candidates;
  });
}

// 智能筛选：找出最可能是实际销售价的那个
function selectActualSellingPrice(candidates, dctPrice) {
  const dct = parsePrice(dctPrice);
  const dctNum = dct || null;

  if (!candidates || candidates.length === 0) return null;

  // 分组：销售价候选 vs 列表价候选
  const saleCandidates = candidates.filter(c =>
    c.priceType === 'sale_price' ||
    (c.type === 'price_element' && c.context.toLowerCase().includes('ourprice'))
  );

  const listCandidates = candidates.filter(c =>
    c.priceType === 'list_or_compare_price' ||
    (c.type === 'price_element' && (c.context.toLowerCase().includes('list price') ||
                                    c.context.toLowerCase().includes('msrp')))
  );

  // 策略 1：如果有明确的销售价候选，优先使用（且不超过 DCT 太多）
  if (saleCandidates.length > 0) {
    // 进一步筛选：排除明显偏离 DCT 的（可能是其他商品的销售价）
    let filtered;
    if (dctNum) {
      filtered = saleCandidates.filter(c =>
        c.price >= dctNum * 0.5 && c.price <= dctNum * 2.0
      );
    }
    
    if (filtered && filtered.length > 0) {
      // 排序：选最接近 DCT 的
      if (dctNum) {
        filtered.sort((a, b) => Math.abs(a.price - dctNum) - Math.abs(b.price - dctNum));
      } else {
        filtered.sort((a, b) => a.price - b.price);
      }
      const best = filtered[0];
      return {
        price: best.price,
        source: `sale_price_element`,
        text: best.text,
        context: best.context.substring(0, 150),
        candidateCount: candidates.length,
        selectedFrom: saleCandidates.length,
        filterReason: `选择了 ${filtered.length} 个销售价候选中的最合理者（最接近 DCT）`,
      };
    }

    // 如果过滤后没剩，取所有销售价中最低的
    saleCandidates.sort((a, b) => a.price - b.price);
    const lowestSale = saleCandidates[0];
    if (dctNum && lowestSale.price > dctNum * 2) {
      // 这个销售价太离谱了，可能是别的商品
      return null;
    }
    return {
      price: lowestSale.price,
      source: `sale_price_lowest`,
      text: lowestSale.text,
      context: lowestSale.context.substring(0, 150),
      candidateCount: candidates.length,
      selectedFrom: saleCandidates.length,
      filterReason: `选择了最低的销售价候选（$${lowestSale.price.toFixed(2)}）`,
    };
  }

  // 策略 2：排除列表价，从剩下的里面选
  const nonListCandidates = candidates.filter(c =>
    c.priceType !== 'list_or_compare_price' &&
    !(c.type === 'price_element' && c.context.toLowerCase().includes('list price')) &&
    !(c.type === 'price_element' && c.context.toLowerCase().includes('msrp'))
  );

  if (nonListCandidates.length > 0) {
    let filtered;
    if (dctNum) {
      filtered = nonListCandidates.filter(c =>
        c.price >= dctNum * 0.3 && c.price <= dctNum * 2.5
      );
    }
    
    if (filtered && filtered.length > 0) {
      if (dctNum) {
        filtered.sort((a, b) => Math.abs(a.price - dctNum) - Math.abs(b.price - dctNum));
      } else {
        filtered.sort((a, b) => a.price - b.price);
      }
      const best = filtered[0];
      return {
        price: best.price,
        source: `non_list_price_closest_to_dct`,
        text: best.text,
        context: best.context.substring(0, 150),
        candidateCount: candidates.length,
        selectedFrom: nonListCandidates.length,
        filterReason: `从 ${nonListCandidates.length} 个非列表价中选择最接近 DCT 的价格`,
      };
    }

    // 回退：取最低的非列表价
    nonListCandidates.sort((a, b) => a.price - b.price);
    return {
      price: nonListCandidates[0].price,
      source: `non_list_price_lowest`,
      text: nonListCandidates[0].text,
      context: nonListCandidates[0].context.substring(0, 150),
      candidateCount: candidates.length,
      selectedFrom: nonListCandidates.length,
      filterReason: `选择了最低的非列表价（$${nonListCandidates[0].price.toFixed(2)}）`,
    };
  }

  // 策略 3：全部候选中，排除明显的列表价，选最接近 DCT 的
  if (dctNum) {
    const reasonable = candidates.filter(c =>
      c.price >= dctNum * 0.3 && c.price <= dctNum * 3.0
    );
    if (reasonable.length > 0) {
      reasonable.sort((a, b) => Math.abs(a.price - dctNum) - Math.abs(b.price - dctNum));
      const best = reasonable[0];
      return {
        price: best.price,
        source: `all_candidates_closest_to_dct`,
        text: best.text,
        context: best.context.substring(0, 150),
        candidateCount: candidates.length,
        selectedFrom: candidates.length,
        filterReason: `在所有 ${candidates.length} 个候选中选择最接近 DCT 的价格（排除不合理的）`,
      };
    }
  }

  // 策略 4：取所有候选中最低的
  candidates.sort((a, b) => a.price - b.price);
  return {
    price: candidates[0].price,
    source: `all_candidates_lowest`,
    text: candidates[0].text,
    context: candidates[0].context.substring(0, 150),
    candidateCount: candidates.length,
    selectedFrom: candidates.length,
    filterReason: `选择了所有候选中的最低价格（$${candidates[0].price.toFixed(2)}）`,
  };
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

    await page.waitForTimeout(2500);

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

    // 提取价格候选
    const candidates = await extractAmazonPrices(page);
    result.price_debug = {
      totalCandidates: candidates.length,
      salePriceCandidates: candidates.filter(c => c.priceType === 'sale_price').length,
      listPriceCandidates: candidates.filter(c => c.priceType === 'list_or_compare_price').length,
      priceElements: candidates.filter(c => c.type === 'price_element').length,
      textScan: candidates.filter(c => c.type === 'text_scan').length,
    };

    // 筛选最佳价格
    const selection = selectActualSellingPrice(candidates, product.dct_pricing);

    if (selection) {
      result.price_value = selection.price;
      const dct = parsePrice(product.dct_pricing);
      const diffPercent = dct ? ((selection.price - dct) / dct * 100).toFixed(1) : 'N/A';

      let desc = `$${selection.price.toFixed(2)}`;
      if (selection.source) desc += ` [${selection.source}]`;
      if (selection.context) {
        const ctx = selection.context.substring(0, 100).replace(/\n/g, ' ');
        desc += ` | 上下文: ${ctx}`;
      }
      result.price_text = desc;

      // 判断合理性
      if (dct) {
        const absDiff = Math.abs(diffPercent);
        if (absDiff < 20) {
          result.status = '✅ 成功 (合理)';
        } else if (selection.price < dct) {
          result.status = `✅ 成功 (低于 DCT ${diffPercent}%)`;
        } else if (absDiff < 80) {
          result.status = `✅ 成功 (高于 DCT ${diffPercent}%, 可能的折扣前价格)`;
        } else {
          result.status = `⚠️ 可疑 (高于 DCT ${diffPercent}%)`;
          result.error = `抓取 $${selection.price.toFixed(2)} 比 DCT $${dct.toFixed(2)} 高 ${diffPercent}% — 可能是 MSRP 而非销售价`;
        }
      } else {
        result.status = '✅ 成功';
      }

      result.price_debug.selection = selection;
    } else {
      result.status = '⚠️ 无价格';
      result.error = '未能识别实际销售价';
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

  console.log(`🔍 Amazon: ${amazonProducts.length} 个 URL`);
  console.log(`🏬 Best Buy: ${bbProducts.length} 个 URL`);

  // Best Buy 结果（已知错误）
  const bbResults = bbProducts.map(p => ({
    product: p.product,
    dct_pricing: p.dct_pricing,
    lowest_market_price: p.lowest_market_price,
    price_difference: p.price_difference,
    url: p.url,
    platform: 'Best Buy',
    check_date: p.check_date,
    remark: p.remark + (p.remark ? ' | ' : '') + 'Best Buy HTTP2_INTERNAL_ERROR — 需要 BESTBUY_API_KEY 或搜索页面 scrape (详见 CLAUDE.md)',
    fetched_at: new Date().toISOString(),
    status: '🚫 封锁',
    price_text: null,
    price_value: null,
    http_status: null,
    page_title: null,
    error: 'Best Buy 封锁 headless Chromium 的 HTTP2 连接。解决方案：1) 注册 BESTBUY_API_KEY (https://developer.bestbuy.com/) 并使用官方 Products API；2) 使用搜索页面 scrape 而非直接产品页面访问',
  }));

  // 重跑 Amazon
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const amazonResults = [];
  for (let i = 0; i < amazonProducts.length; i++) {
    const p = amazonProducts[i];
    const num = String(i + 1).padStart(2, ' ');
    console.log(`\n[${num}/${amazonProducts.length}] ${p.product} — ${p.dct_pricing}`);

    const result = await fetchAmazonPrice(p, browser);
    amazonResults.push(result);

    console.log(`  状态: ${result.status}`);
    console.log(`  价格: ${result.price_text || 'N/A'}`);

    if (result.price_debug) {
      const pd = result.price_debug;
      console.log(`  候选总数: ${pd.totalCandidates} (销售价 ${pd.salePriceCandidates} + 列表价 ${pd.listPriceCandidates})`);
      console.log(`  元素: ${pd.priceElements} | 文本扫描: ${pd.textScan}`);
      if (pd.selection) {
        console.log(`  选择依据: ${pd.selection.filterReason}`);
        console.log(`  来源: ${pd.selection.source}`);
      }
    }
    if (result.error) console.log(`  备注: ${result.error}`);
  }

  await browser.close();

  // 合并所有结果
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
  console.log('📊 v7 修正后结果摘要');
  console.log('='.repeat(80));

  const stats = {
    amazon: { total: amazonResults.length, success: 0, suspicious: 0, noPrice: 0, failed: 0 },
    bestbuy: { total: bbResults.length, failed: bbResults.length },
  };

  amazonResults.forEach(r => {
    if (r.status?.startsWith('✅')) stats.amazon.success++;
    else if (r.status?.startsWith('⚠️')) stats.amazon.suspicious++;
    else if (r.status === '⚠️ 无价格') stats.amazon.noPrice++;
    else stats.amazon.failed++;
  });

  console.log(`\n🍎 Amazon (${stats.amazon.total} 个):`);
  console.log(`  ✅ 成功 (合理): ${stats.amazon.success}`);
  console.log(`  ⚠️  可疑: ${stats.amazon.suspicious}`);
  console.log(`  ⚠️  无价格: ${stats.amazon.noPrice}`);
  console.log(`  ❌ 失败: ${stats.amazon.failed}`);

  console.log(`\n🏬 Best Buy (${stats.bestbuy.total} 个):`);
  console.log(`  ❌ 全部封锁: ${stats.bestbuy.failed}`);

  console.log(`\n📁 CSV: ${CSV_FILE}`);
  console.log(`📁 JSON: ${JSON_FILE}`);

  // 展示结果
  console.log('\n' + '-'.repeat(80));
  console.log('✅ 结果明细:');
  console.log('-'.repeat(80));

  amazonResults.forEach(r => {
    const dct = parsePrice(r.dct_pricing);
    const diff = dct ? ((r.price_value - dct) / dct * 100).toFixed(1) : 'N/A';
    console.log(`\n  ${r.product}`);
    console.log(`    DCT: ${r.dct_pricing} | 抓取: $${r.price_value.toFixed(2)} | 差距: ${diff}%`);
    console.log(`    状态: ${r.status}`);
    console.log(`    来源: ${r.price_text}`);
    if (r.price_debug?.selection) {
      console.log(`    选择: ${r.price_debug.selection.filterReason}`);
    }
    if (r.error) console.log(`    ⚠️  ${r.error}`);
  });

  // 可疑结果
  const suspicious = amazonResults.filter(r => r.status?.startsWith('⚠️'));
  if (suspicious.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('⚠️  可疑结果 (可能需要人工核实):');
    console.log('-'.repeat(80));
    suspicious.forEach(r => {
      const dct = parsePrice(r.dct_pricing);
      const diff = dct ? ((r.price_value - dct) / dct * 100).toFixed(1) : 'N/A';
      console.log(`\n  ${r.product}`);
      console.log(`    DCT: ${r.dct_pricing} | 抓取: $${r.price_value.toFixed(2)} | 差距: ${diff}%`);
      console.log(`    状态: ${r.status}`);
      console.log(`    来源: ${r.price_text}`);
      if (r.error) console.log(`    ⚠️  ${r.error}`);
    });
  }

  console.log('\n✅ v7 执行完成!');
}

main().catch(console.error);
