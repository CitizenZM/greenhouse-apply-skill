# Job Apply Workflow - Progressive Record Ledger
# 職位申請工作流 - 進度記錄賬本
# 最後更新: 2026-08-23 18:05 PDT

## 工作流狀態總覽

### 1. Celonis 직무 신청 (Celonis Senior PMM - CIO & Tech Partnerships)

| 欄位 | 值 |
|------|-----|
| 職位 ID | 7853433003 |
| 公司 | Celonis |
| 職位標題 | Senior Product Marketing Manager - CIO & Technology Partnerships |
| ATS 類型 | Greenhouse |
| 職位頁面 URL | https://job-boards.greenhouse.io/celonis/jobs/7853433003 |
| 申請狀態 | ❌ 未成功提交 (reCAPTCHA 阻擋) |
| 最後一次嘗試 | 2026-08-23 17:30 PDT |
| 嘗試次數 | 3 次 (Playwright headless, Playwright headed, browser_exec) |
| 阻擋原因 | Google reCAPTCHA Enterprise - navigator.webdriver 檢測 |
| 頁面狀態 | 頁面可訪問 (HTTP 200)，表單存在，Apply 按鈕可點擊但無響應 |
| 帳戶狀態 | Chrome 已登入 .greenhouse.io session cookies 存在 |
| 答案文件 | /tmp/celonis_answers.json |
| 履歷文件 | /Users/xiaozuo/Downloads/resumeandcoverletter/Barron_Zuo_Celonis_Senior_Product_Marketing_Manag_Resume_2026-08-23.docx |
| 工作流任務 ID | 2026-08-23-celonis-7853433003 |
| 任務狀態 (tasks.db) | completed (已標記完成，但實際未成功) |

### 2. 履歷生成進度 (Resume Generation)

| 角色 | 狀態 | 文件路徑 | 備註 |
|------|------|---------|------|
| Celonis PMM (v5) | ✅ 完成 | Barron_Zuo_Celonis_Senior_Product_Marketing_Manag_Resume_2026-08-23.docx | 已包含 JD 覆蓋, BigQuery/SQL 關鍵詞 |
| Brij Partnerships Director | ✅ 完成 | Barron_Zuo_Brij_Director_of_Partnerships_Resume.docx | - |
| Jasper Growth Marketing | ✅ 完成 | Barron_Zuo_Jasper_Senior_Director_Growth_Marketing_Resume.docx | - |
| 關於其他角色 (Growth, Marketing, Sales, Operations, FDE) | ⏳ 待處理 | - | 需要基於 v5 模板生成 v6 |

### 3. 策略文件準備

| 策略文件 | 狀態 | 路徑 |
|----------|------|------|
| jd-role-classifier.md | ✅ 完成 | data/jd-role-classifier.md |
| growth-strategy.md | ✅ 完成 | data/role-strategies/growth-strategy.md |
| marketing-strategy.md | ✅ 完成 | data/role-strategies/marketing-strategy.md |
| sales-strategy.md | ✅ 完成 | data/role-strategies/sales-strategy.md |
| operations-strategy.md | ✅ 完成 | data/role-strategies/operations-strategy.md |
| fde-strategy.md | ✅ 完成 | data/role-strategies/fde-strategy.md |
| general-strategy.md | ✅ 完成 | data/role-strategies/general-strategy.md |
| resume-prompt.md (v5) | ✅ 完成 | templates/resume-prompt.md |
| cover-letter-prompt.md (v3) | ✅ 完成 | templates/cover-letter-prompt.md |

### 4. 職位列表分析 (ATS 分布)

來源: fde_queue.json (203 個職位)

| ATS 類型 | 數量 | 自動化難度 | 備註 |
|----------|------|------------|------|
| Ashby | 105 | 🔴 高 (reCAPTCHA) | 頁面容易進入，表單有 reCAPTCHA |
| Greenhouse | 57 | 🔴 極高 (reCAPTCHA Enterprise + navigator.webdriver) | 目前 Celonis 已確認受阻 |
| Lever | 20 | 🟡 中等 (hCaptcha) | 比 Greenhouse 弱，hCaptcha 求解服務更容易 |
| 其他/未知 | 21 | ❓ 未知 | 需要個別確認 |

### 5. ATS 可行性研究結果

#### Greenhouse (Celonis 已確認)
- 已知限制: navigator.webdriver 檢測，Playwright 提交無效
- 建議路線: Playwright 填表 + 人工點擊 reCAPTCHA + 自動提交

#### Lever (Collate FDE 已確認 HTTP 200)
- 驗證類型: hCaptcha (非 Google reCAPTCHA)
- 頁面結構: 標準 HTML 表單，適用按鈕指向外鏈
- LinkedIn 授權: 有「Apply with LinkedIn Profile」選填選項
- 文件上傳: input[type=file]，PDF/DOC，最大 100MB
- 自動化可行性: 中等偏下，需要 hCaptcha 求解服務或人工

#### Ashby (Abridge/Anyscale/Artificial Analysis 已確認)
- 驗證類型: Google reCAPTCHA Enterprise (與 Greenhouse 相同)
- 頁面結構: 職位頁面右上角 Apply 按鈕，連結到 /application 頁面
- 表單元素: 71 個輸入元素 (文本、單選、復選、文本域、文件上傳)
- 自動化可行性: 高 (頁面易進) → 低 (表單有 reCAPTCHA)
- 建議路線: 同 Greenhouse - 半自動 (填表 + 人工點擊 reCAPTCHA)

### 6. 檔案和腳本清單

#### 核心腳本
- playwright-apply-greenhouse.js - Greenhouse 申請自動化 (已知 reCAPTCHA 限制)
- playwright-inspect-lever.js - Lever 頁面檢測
- extract-job-list.js - 職位列表提取
- extract-jd.js - 職位描述提取
- search-jobs.js - 職位搜索
- source-jobs.py - 職位來源腳本
- next-job-page.js - 下一頁職位處理
- login.js - 登入處理
- submit-application.js - 申請提交
- craft-resume.py - 履歷生成

#### 數據文件
- fde_queue.json - 203 個職位列表 (ATS 分布如上)
- job-sources.json - 職位來源配置 (917 家公司，多層 tier)
- resume-master.json - 履歷主數據
- barron-experience-bank.md - 經歷數據 (5 家公司)

#### 輸出文件
- Barron_Zuo_Celonis_Senior_Product_Marketing_Manag_Resume_2026-08-23.docx
- Barron_Zuo_Brij_Director_of_Partnerships_Resume.docx
- Barron_Zuo_Jasper_Senior_Director_Growth_Marketing_Resume.docx
- Barron_Zuo_Brij_Director_of_Partnerships_Cover_Letter.docx
- Barron_Zuo_Jasper_Senior_Director_Growth_Marketing_Cover_Letter.docx

### 7. 任務歷史 (tasks.db)

| 任務 ID | 標題 | 狀態 | 類型 | 引擎 | 模型 | 创建时间 | 更新时间 |
|---------|------|------|------|------|------|----------|----------|
| 2026-08-23-celonis-7853433003 | Celonis Senior PMM | completed | browser | claude | sonnet | 2026-08-23 16:05 | 2026-08-23 17:30 |
| test-router-001 | 路由測試 | completed | general | claude | sonnet | 2026-08-23 16:05 | 2026-08-23 16:05 |
| 2026-08-23-155637-e157fb | 測試路由 | failed | 研究型任務 | claude | sonnet | 2026-08-23 15:56 | 2026-08-23 15:56 |

### 8. 已知限制和障害

1. **Google reCAPTCHA Enterprise** (Greenhouse, Ashby)
   - 檢測 navigator.webdriver，自動化提交無效
   - Playwright headless 和 headed 都受影響
   - 解決方案: Playwright 填表 + 人工點擊 reCAPTCHA + 自動提交剩餘部分

2. **hCaptcha** (Lever)
   - 比 Google reCAPTCHA 弱，但依然有障礙
   - 解決方案: hCaptcha 求解服務 (如 2Captcha) 或人工點擊

3. **Chrome DevTools 干擾**
   - 當 Chrome 打開 DevTools 時，無頭模式可能被檢測
   - 在進行 자동화時應確保 DevTools 已關閉

4. **URL 錯誤問題**
   - 曾錯把 7853433003 寫成 785343003 (少一位數字)
   - 已糾正，確認正確 URL 是 7853433003

### 9. 下一步建議

#### 優先級 1: Lever 職位 (hCaptcha 相對容易)
1. 測試 Acceldata 或 Colate 的 Lever 職位
2. 嘗試 hCaptcha 求解服務 (或等待人工點擊)
3. 建立可重用的 Lever 申請流程

#### 優先級 2: Ashby 職位 (與 Greenhouse 類似)
1. 選擇 1-2 個 Ashby 職位進行測試
2. 確認 reCAPTCHA 行為是否與 Greenhouse 一致
3. 建立半自動流程 (填表 + 等待人工點擊)

#### 優先級 3: 更多 Greenhouse 職位
1. 繼續處理其他 Greenhouse 職位 (57 個)
2. 使用相同半自動流程

#### 優先級 4: 履歷 v6 生成
1. 基於現有策略文件，生成 Growth/Marketing/Sales/Operations/FDE 五個角色的履歷
2. 每個角色需要 align 到具體的職位需求

### 10. 重要決定點

待使用者確認:
- [ ] 是否使用 hCaptcha 求解服務 (2Captcha 等) 或完全依賴人工點擊
- [ ] 是否優先處理 Lever (hCaptcha) 還是繼續 Greenhouse/Ashby (reCAPTCHA)
- [ ] 履歷 v6 生成的具體角色順序和優先級
- [ ] 是否需要同時處理多個 ATS 類型，還是專注於一個

---

## 緊急入口

如果需要快速恢復工作，參考以下命令:

```bash
# 查看職位列表
cat ~/Projects/greenhouse-apply-skill/data/fde_queue.json | python3 -c "import json,sys; data=json.load(sys.stdin); print(f'Total: {len(data)} jobs')"

# 查詢 tasks.db 狀態
sqlite3 ~/.hermes/data/tasks.db "SELECT task_id, title, status FROM tasks ORDER BY updated_at DESC"

# 查看 Celonis 職位頁面
open -a 'Google Chrome' 'https://job-boards.greenhouse.io/celonis/jobs/7853433003'

# 運行 Greenhouse 申請腳本 (需要人工 reCAPTCHA)
cd ~/Projects/greenhouse-apply-skill
node scripts/playwright-apply-greenhouse.js \
  https://job-boards.greenhouse.io/celonis/jobs/7853433003 \
  /tmp/celonis_answers.json \
  ~/Downloads/resumeandcoverletter/Barron_Zuo_Celonis_Senior_Product_Marketing_Manag_Resume_2026-08-23.docx \
  '' --headed
```

---

## 記錄歷史

- **2026-08-23 18:05 PDT**: 工作流暂停，建立此 ledger 記錄。保存所有進度狀態以便後續恢復。
