# JD Role Classifier — 職業角色自動識別規則

## 用途
根據 JD 文本，自動識別目標職位屬於哪類角色（growth / marketing / sales / operations / fde 等），並輸出該角色的 resume/coverletter 生成策略。

## 分類標籤關鍵字

### Growth
- 標誌詞：`growth`, `acquisition`, `activation`, `funnel`, `retention`, `cohort`, `paid acquisition`, `ROAS`, `CAC`, `experimentation`, `A/B testing`, `self-serve`, `PLG`, `onboarding`, `viral`, `organic growth`, `referral`, `pipeline growth`, `conversion rate optimization`, `full-funnel`, `demand generation`, `user acquisition`, `growth marketing`, `growth strategy`, `growth lead`, `growth manager`
- Title 模式：
  - Head of Growth, VP Growth, Growth Lead, Director of Growth, Growth Marketing Manager, Growth Strategy Lead, Acquisition Manager, Activation Manager, Head of User Acquisition, VP of Growth, Growth Director, Growth Strategist

### Marketing (PMM/GTM)
- 標誌詞：`product marketing`, `positioning`, `messaging`, `GTM strategy`, `go-to-market`, `launch`, `competitive intelligence`, `sales enablement`, `pitch deck`, `battle card`, `narrative`, `market insight`, `buyer persona`, `product launch`, `market mapping`, `competitive landscape`, `analyst relations`, `product positioning`, `marketing strategy`, `product marketer`, `PMM`, `technical product marketing`, `product marketing manager`, `GTM`, `go to market`
- Title 模式：
  - Senior PMM, Director PMM, VP Product Marketing, Head of GTM, GTM Strategy Lead, Product Marketing Manager, Technical Product Marketing, Product Marketing Lead, Senior Product Marketing Manager, PMM, GTM Marketing Manager, Product Marketing Director

### Sales / RevOps
- 標誌詞：`revenue operations`, `RevOps`, `sales operations`, `pipeline`, `lead scoring`, `MQL→SQL`, `sales cycle`, `forecasting`, `CRM`, `account-based`, `enterprise sales`, `sales leadership`, `revenue`, `upsell`, `cross-sell`, `expansion`, `sales strategy`, `sales enablement`, `revenue intelligence`, `sales technology`, `revenue optimization`, `sales productivity`, `sales performance`, `sales analytics`, `pipeline management`, `deal desk`, `sales support`
- Title 模式：
  - VP RevOps, Director RevOps, Head of Sales Ops, Sales Strategy Lead, Revenue Operations Manager, Senior Sales Operations Analyst, Sales Technology Manager, Revenue Operations Director, Sales Operations Manager, Revenue Strategy Manager, GTM Operations, RevOps Lead

### Operations
- 標誌詞：`operations`, `revenue operations`, `data pipeline`, `automation`, `process optimization`, `budget governance`, `reporting`, `dashboard`, `system integration`, `operational efficiency`, `cross-functional operations`, `operational excellence`, `workflow`, `process design`, `operational strategy`, `business operations`, `operational leadership`, `operational management`, `operational infrastructure`, `operational systems`, `operational transformation`
- Title 模式：
  - Head of Operations, Director of Operations, VP Operations, Operations Lead, GTM Operations, Revenue Operations, Operations Manager, Business Operations, Business Operations Manager, Head of Business Operations, Operations Director, GTM Operations Manager, Business Operations Lead

### FDE / Solutions Engineer
- 標誌詞：`forward deployed`, `solutions engineer`, `implementation`, `field engineer`, `deployment`, `customer engineer`, `technical`, `customer-embedded`, `on-site`, `build`, `configure`, `integration`, `technical solutioning`, `systems`, `technical account manager`, `professional services`, `deployment engineer`, `solutions`, `field`, `deployment`, `implementation engineer`, `customer success engineering`, `technical consulting`, `solutions architecture`, `pre-sales engineering`, `post-sales engineering`
- Title 模式：
  - Forward Deployed Engineer, Solutions Engineer, Implementation Engineer, Field Engineer, Customer Engineer, Technical Account Manager, Professional Services Engineer, Deployment Engineer, Solutions Architect, Pre-Sales Engineer, Post-Sales Engineer, Field Solutions Engineer, Customer Success Engineer, Technical Consultant

## 分類算法（優先級排序）

1. **先檢查 FDE 標誌詞**：如果 JD 中出現"forward deployed", "solutions engineer", "implementation engineer", "field engineer", "deployment engineer", "customer engineer"，直接分類為 FDE，不再進一步分類（FDE overlay 專門處理）。

2. **再檢查 Marketing 標誌詞**：如果出現"product marketing", "positioning", "messaging", "GTM strategy", "go-to-market"，分類為 Marketing。

3. **再檢查 Growth 標誌詞**：如果出現"growth", "activation", "funnel", "retention", "cohort", "paid acquisition", "ROAS", "CAC", "experimentation", "A/B testing", "PLG", "self-serve"，分類為 Growth。

4. **再檢查 Sales/RevOps 標誌詞**：如果出現"revenue operations", "RevOps", "sales operations", "pipeline", "lead scoring", "MQL→SQL", "sales cycle", "forecasting", "CRM", "account-based"，分類為 Sales/RevOps。

5. **再檢查 Operations 標誌詞**：如果出現"operations", "data pipeline", "automation", "process optimization", "budget governance", "reporting", "dashboard", "system integration"，分類為 Operations。

6. **如果多個類別同時匹配**：選擇匹配強度最高的（標誌詞出現次數 × 置信權重），並標記為 hybrid，需要進一步人工確認。hybrid 的情況下，通常 primary_role 是匹配度最高的，secondary_role 是第二匹配度高的，可以在 resume 中同時體現兩個方面。

7. **如果都不匹配**：標記為"general"，使用通用策略。

## 匹配強度計算

每個標誌詞匹配有不同的權重：

### 高權重標誌詞（出現即強匹配）
- Growth: `growth`, `acquisition`, `activation`, `PLG`, `self-serve`, `funnel`, `cohort`
- Marketing: `product marketing`, `positioning`, `messaging`, `GTM strategy`, `go-to-market`, `PMM`
- Sales/RevOps: `revenue operations`, `RevOps`, `pipeline`, `lead scoring`, `MQL→SQL`, `sales cycle`, `forecasting`
- Operations: `operations`（作名詞，非"in operations"修飾），`data pipeline`, `automation`, `process optimization`, `budget governance`
- FDE: `forward deployed`, `solutions engineer`, `implementation engineer`, `field engineer`, `deployment engineer`, `customer engineer`

### 中權重標誌詞（出現 2+ 次才算強匹配）
- Growth: `ROAS`, `CAC`, `experimentation`, `A/B testing`, `onboarding`, `retention`, `viral`, `organic growth`, `referral`, `pipeline growth`, `conversion rate optimization`
- Marketing: `competitive intelligence`, `sales enablement`, `pitch deck`, `battle card`, `narrative`, `market insight`, `buyer persona`, `product launch`, `market mapping`, `competitive landscape`
- Sales/RevOps: `enterprise sales`, `sales leadership`, `revenue`, `upsell`, `cross-sell`, `expansion`, `sales strategy`, `sales enablement`, `revenue intelligence`, `sales technology`
- Operations: `reporting`, `dashboard`, `system integration`, `operational efficiency`, `cross-functional operations`, `operational excellence`, `workflow`, `process design`
- FDE: `customer-embedded`, `on-site`, `build`, `configure`, `integration`, `technical solutioning`, `systems`, `technical account manager`, `professional services`

### 低權重標誌詞（需要 3+ 次匹配或與其他高/中權重標誌詞組合）
- 通用詞彙：`strategy`, `leadership`, `management`, `execution`, `delivery`, `results`, `team`, `collaboration`, `partner`, `cross-functional`, `data-driven`, `analytics`, `metrics`, `performance`, `growth`, `revenue`, `market`, `customer`, `product`, `technology`, `innovation`, `transformation`

## 輸出格式

```json
{
  "primary_role": "growth|marketing|sales|operations|fde|general",
  "role_confidence": 0.0-1.0,
  "title_probe": ["Title 1", "Title 2", ...],
  "fde_overlay_needed": true/false,
  "resume_strategy": "growth_strategic|marketing_pmm|sales_revops|operations_revops|fde_technical|general",
  "coverletter_strategy": "growth_hook|marketing_narrative|sales_results|operations_systems|fde_embed|general",
  "matched_keywords": {
    "growth": ["growth", "activation", ...],
    "marketing": [],
    "sales": [],
    "operations": [],
    "fde": []
  },
  "hybrid_roles": ["secondary_role1", "secondary_role2"],  // 如果有
  "jd_requirement_table_template": [...],
  "title_adaptation_set": {...},
  "executive_summary_anchor_template": "...",
  "keyword_weighting": {...}
}
```

## 角色特定策略文件路徑

- **Growth** → `data/role-strategies/growth-strategy.md`
- **Marketing** → `data/role-strategies/marketing-strategy.md`
- **Sales/RevOps** → `data/role-strategies/sales-strategy.md`
- **Operations** → `data/role-strategies/operations-strategy.md`
- **FDE** → `data/fde-technical-positioning.md`（已有）+ `data/role-strategies/fde-strategy.md`
- **General** → `data/role-strategies/general-strategy.md`
