# General 角色策略（通用）

## 適用角色
任何不匹配 Growth / Marketing / Sales / Operations / FDE 類別的職位，或者多個類別混合但無法明確優先級的職位。

## 使用原則
General 策略不是"無针对性"——它是基于 JD 要求表和經歷銀行的通用匹配邏輯，遵循 v4 prompt 的所有核心規則，但不預設特定的角色角度。

## JD 要求表模板（通用）

```markdown
| JD Requirement / Keyword | Priority | 來源項目 | 引-leading metric |
|---|---|---|---|
| [從 JD 中提取的第一個核心要求] | must-have | [最佳匹配的經歷銀行項目] | [引-leading metric] |
| [從 JD 中提取的第二個核心要求] | must-have | [最佳匹配的經歷銀行項目] | [引-leading metric] |
| [從 JD 中提取的第三個核心要求] | must-have | [最佳匹配的經歷銀行項目] | [引-leading metric] |
```

通用策略要求生成器首先徹底提取 JD 要求，建立完整的 requirement table，然後按照 v4 的 matching logic 逐條映射到經歷銀行項目。

## Title 適配規則（通用）

使用 experience bank 中的"Flexible Title Adaptations"，根據 JD 的語言調整：

- 如果 JD 強調"Revenue"或"RevOps" → 使用 RevOps / Revenue 適配
- 如果 JD 強調"Growth"或"Acquisition" → 使用 Growth Marketing 適配
- 如果 JD 強調"Marketing"或"GTM" → 使用 B2B / VP Marketing 或 PLG 適配
- 如果 JD 強調"Operations"或"Systems" → 使用 RevOps / Revenue 適配
- 如果 JD 強調"Technical"或"Implementation" → 使用 FDE 適配（需要加載 fde-technical-positioning.md）
- 如果 JD 是綜合性的 → 選擇最匹配的核心主題的適配

## Executive Summary anchor 範本（通用）

通用 Executive Summary 的結構：

> 我擁有[年份數]年的[核心領域]經歷，在[公司 1]期間，我[具體成就 1，帶指標]；在[公司 2]期間，我[具體成就 2，帶指標]。我[具體技能或經驗]，這與[目標公司]的[具體需求]直接相關。我希望將這種[核心能力]帶給[公司]的[具體角色/領域]。

例子（綜合角色）：
> 我擁有 15 年的增長、營銷和運營經歷，在阿裏巴巴我重建了 US SMB 增長漏鬥，將 time-to-first-transaction 縮短 35%，24 個月內帶來 $180M ARR；在 Next2Market 我把 50+ 品牌組合從 $50M 帶到 $200M+ ARR，運行了 200+ A/B 實驗，實現了 18% 的轉化提升。我建立了多系統的數據管道和收入運營體系，管理過 $7M+/月的多渠道預算。我想把這種端到端的漏鬥所有權、數據驅動的決策和系統集成經驗帶給 [公司] 的[具體角色]。

## Bullet 重點指導（通用）

通用策略的 bullet 生成遵循 v4 的核心規則：

1. **每條 bullet 必須對應一個具體的 JD 要求**——不能有模糊的"符合公司文化"式的 bullet
2. **每條 bullet 必須包含**（a）trade-off 或 decision rationale，或（b）具體工具/方法選擇，或（c）friction point 與解析
3. **每條 bullet 必須包含可測量的結果**，來自經歷銀行的 Core Metrics
4. **每條 bullet 必須避免** banned verbs（Orchestrated, Catalyzed, Engineered, Spearheaded, Architected）
5. **每條 bullet 必須避免** 在 GSV/WeWork 部分使用 2018 年後的工具/產品名字

## Keyword 優先級（通用）

通用策略不預設 Keyword 列表——生成器需要根據 JD 要求表動態確定 Keyword 優先級。然而，以下是經歷銀行中常見 Keyword 的參考，供生成器在沒有明確 JD 指導時使用：

### 高優先級（經歷銀行中的核心 Keyword，通常與多個角色相關）
- ARR, revenue growth, pipeline, CAC, CAC payback, ROAS, conversion, A/B testing, experimentation, cohort, retention, churn reduction, lifecycle, attribution, Segment, Rockerbox, BigQuery, SQL, Salesforce, Tableau, Alteryx, Braze, Meta Ads, TikTok Ads, Google Ads, Bing Ads, OOH, email marketing, marketing automation, CRM, HubSpot, Shopify, GA4, Amplitude, WeChat, cross-functional, team building, org building, board reporting, C-suite, enterprise, B2B, DTC, marketplace, payments, AI, machine learning, automation, data-driven, 8+ years, 15+ years, 5M+ users, $180M ARR, $200M+ ARR, 4x growth, 18% pipeline, 28% CAC, 22% conversion, 350% GMV, 400+ partners

## Coverletter 策略：general

通用 coverletter 策略遵循 v2 coverletter prompt 的所有規則，但不預設特定的 hook 角度。生成器需要根據 JD 要求表和經歷銀行動態確定：

1. **開頭 Hook**：識別 JD 中最獨特的要求或公司最具體的背景，將其與 Barron 的經歷中最相關的部分掛鉆
2. **Body 1**：映射最相關的經歷（通常是 Alibaba 或 Next2Market）到角色的 #1 JD 要求
3. **Body 2**：映射次優先的 JD 要求，展示廣度（通常是 Next2Market 或 WeWork）
4. **Body 3（Depth & Range）**： mandatory，從 WeWork 或 GSV 取材，展示 2018 年之前的經歷
5. **Body 4**：處理任何獨特的 JD 要求
6. **Closing**：具體熱情 + 2 週通知 + 直接 call to action

## 自檢加項目（通用）

除了 v4 和 v2 的標準自檢之外，通用策略還要求：

1. **JD 要求表是否完整**——是否提取了所有 must-have 要求，是否有任何要求未被映射？
2. **每條 bullet 是否都明確對應了一條 JD 要求**——不能有"爲了填充空間"的 bullet
3. **Keyword 覆蓋是否動態確定**——不是使用預設列表，而是根據 JD 要求表確定哪些 keyword 必須出現
4. **Title 適配是否基於 JD 語言**——而非預設某個角色
5. **Executive Summary 是否命名了具體的目標公司**——而非泛泛的表述
6. **Cover letter 的 Body 3 是否包含了 2018 年之前的經歷**（WeWork 或 GSV）
7. **Cover letter 的 Body 3 是否命名了具體的公司**（Starbucks, Shiseido, TCL 或 GSV）
8. **是否避免了宣稱 GSV/Indiegogo 擁有與 Alibaba/Next2Market 相同的範圍或詞彙**
9. **是否避免了在 GSV/WeWork 部分使用 2018 年後才存在的工具/產品名字**
