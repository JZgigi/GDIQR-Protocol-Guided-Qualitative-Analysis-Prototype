# GDI-QR v1.0 验收清单

本文件用于记录 July v1.0 research release 的手动验收流程。后续每完成一个 feature branch，都继续更新这个文件。当前开发阶段先以 smoke check 为主：只要能正常 typecheck、启动、页面不崩，就可以先合并到 `release/1.0`；完整端到端测试等所有 P0 工单完成后统一做。

## 当前测试策略

每个 feature branch 合并前至少检查：

1. `npm run typecheck` 通过。
2. `npm run dev` 可以正常启动。
3. 当前工单对应页面可以打开，核心按钮不会导致页面崩溃。
4. 如果本工单涉及 SQL migration，需要先在 Supabase SQL Editor 运行成功。

完整的 create project → upload transcript/audio → confirm transcript → Step 1–5 → export 流程，等所有 P0 工单合并后再统一验收。

## 环境前提

1. 从 `release/1.0` 或当前 feature branch 开始。
2. `.env.local` 已配置 Supabase cloud-assisted mode 所需变量。
3. Supabase SQL migration 已按顺序运行。
4. 使用 `npm run dev` 启动 app。
5. 只使用 open、public、anonymised、de-identified 或 synthetic data 测试，不上传 identifiable sensitive data。

## 截止目前 SQL migration 顺序

1. `supabase/phase2_schema.sql`
2. `supabase/phase3_segment_workflow.sql`
3. 如果之前没有创建 audio/transcription tables 和 storage bucket，再运行：`supabase/audio_upload_transcription.sql`
4. `supabase/v1_0_foundation_schema.sql`
5. `supabase/v1_0_transcript_audio_review_schema.sql`

## Ticket 0：v1.0 data-model foundation

Branch：`feature/v1-data-model-foundation`

Smoke check：

1. 所有必需 SQL migration 可以运行且无报错。
2. `npm run typecheck` 通过。
3. `npm run dev` 后 workspace 可以打开。
4. `getWorkspace()` 在以下数据为空或存在时都不会崩溃：
   - `preAnalysisNotes`
   - `editLogs`
   - `integrationRelationships`
   - `integrityReviewItems`
   - `exportRecords`
5. 原有 meaning unit、category、reviewer、export UI 仍然能正常渲染。

预期结果：

- 原有 prototype 行为不被破坏。
- v1.0 后续持久化所需的数据表、类型和 repository foundation 已准备好。

## Ticket 1：Create Project + data suitability gate

Branch：`feature/v1-create-project`

Smoke check：

1. 打开 app，确认页面顶部出现 **Project setup and data suitability** 区域。
2. 不勾选 data suitability confirmation，尝试保存 project setup。
   - 预期：app 阻止保存并显示提示。
3. 在 cloud-assisted mode 里选择 **Identifiable sensitive data**。
   - 预期：确认框被禁用或保存被阻止。
4. 创建一个新项目，填写：
   - Project title
   - Research question
   - Study description
   - Dataset type：open 或 anonymised
   - Data source
   - Researcher notes
   - 勾选 data suitability confirmation
5. 创建成功后，确认 URL 变为 `?projectId=<new project id>`。
6. 刷新页面。
   - 预期：project 仍然出现在 existing project 下拉列表中。
7. 尝试在未确认 data suitability 的项目里上传或分析。
   - 预期：upload 和 analysis 会被阻止。
8. 导出 JSON/TXT，确认包含：
   - dataset type
   - data source
   - data suitability confirmation
   - researcher notes

预期结果：

- Project metadata 可以持久化。
- Data suitability gate 可以阻止不合规数据上传或分析。

## Ticket 2：Transcript upload、editable preview、confirm transcript

Branch：`feature/v1-transcript-audio-review`

Smoke check：

1. 创建或打开一个已经确认 data suitability 的 open/anonymised project。
2. 进入 Step 1 → **Import or paste transcript**。
3. 上传 `.txt` 或 `.docx`，或直接粘贴 transcript text。
4. 点击 **Prepare transcript**。
5. 确认页面出现 editable transcript preview。
6. 确认 transcript review record 显示 review draft 已保存。
7. 在没有点击 **Confirm reviewed transcript for analysis** 前，进入 Step 2 尝试生成 meaning units。
   - 预期：生成被阻止。
8. 编辑 transcript。
9. 点击 **Save reviewed transcript**。
10. 点击 **Confirm reviewed transcript for analysis**。
11. 确认 Step 2 现在可以生成 meaning units。
12. 导出 JSON，确认包含 `transcriptRecords` 和 transcript review status。

预期结果：

- Original/uploaded transcript 和 edited transcript version 可以区分。
- Researcher confirm transcript 之前不能开始 analysis。

## Ticket 3：Audio upload、transcription review、confirm transcript

Branch：`feature/v1-transcript-audio-review`

Smoke check：

1. 打开一个已经确认 data suitability 的 open/anonymised project。
2. 进入 Step 1 → **Optional: transcribe interview audio**。
3. 上传 `.mp3`、`.wav` 或 `.m4a` audio。
4. 等 transcription 完成。
5. 确认 generated transcript 出现在 editable transcript review 区域。
6. 确认 transcript 生成后仍然是 unconfirmed 状态。
7. 必要时编辑 generated transcript。
8. 点击 **Save reviewed transcript**。
9. 点击 **Confirm reviewed transcript for analysis**。
10. 确认只有 confirm 之后 Step 2 才能生成 meaning units。
11. 导出 JSON，确认包含：
    - `audioFiles`
    - `transcriptionJobs`
    - `transcriptRecords`

预期 audit/edit-log events：

- `audio_uploaded`
- `transcript_generated`
- `transcript_edited`
- `transcript_confirmed`

## Ticket 4：Durable save/load project foundation

Branch：`feature/v1-save-load-step1`

Smoke check：

1. 从 project switcher 打开一个已有项目。
2. 确认加载出的 project state 包含：
   - project metadata
   - transcript records
   - segments
   - meaning units
   - categories
   - reviewer comments
   - audit events
   - Step 1 pre-analysis notes
3. 修改一个 Step 1 字段并保存。
4. 刷新浏览器。
5. 重新打开同一个 project。
6. 确认刚刚保存的 Step 1 内容仍然存在。
7. 根据项目状态，确认 app 会推荐合理的当前步骤：
   - transcript 未确认 → Step 1
   - transcript 已确认但没有 accepted MUs → Step 2
   - 有 accepted MUs 但没有 categories → Step 3
   - 有 categories 但没有 narrative → Step 4
   - 有 narrative → Step 5

预期结果：

- 浏览器刷新不会丢失已保存的 Step 1 工作。
- Project list 可以用于回到已有项目继续分析。

## Ticket 5：Step 1 pre-analysis persistence

Branch：`feature/v1-save-load-step1`

Smoke check：

1. 打开一个已经确认 data suitability 的 project。
2. 填写或修改以下 Step 1 字段：
   - Research question
   - Study description / domains of investigation
   - Researcher position / reflexive note
   - Contextual notes
   - Initial sensitising concepts
   - Data familiarisation notes
3. 点击 **Save Step 1 pre-analysis notes**。
4. 确认页面显示保存成功。
5. 刷新浏览器。
6. 确认所有 Step 1 字段都能正确恢复。
7. 后续完整测试时，检查 Supabase `pre_analysis_notes` 是否有对应记录。
8. 后续完整测试时，检查 Supabase `edit_logs` 或 exported audit record 是否有 `pre_analysis_updated`。
9. 导出 JSON/TXT，确认 Step 1 notes 已包含在 research record 中。

预期结果：

- Step 1 所有字段可以持久化并进入 audit/export。
- Step 1 成为 research record 的一部分，而不是临时 UI state。

## Ticket 6：Meaning Unit workflow

Branch：`feature/v1-meaning-unit-workflow`

Smoke check：

1. 打开一个已经完成 transcript confirmation 的 project。
2. 进入 Step 2。
3. 点击 **Assistant support: draft meaning units** 或 **Use rule-based draft MUs**。
4. 确认生成的 MUs 以 Draft / Needs review 状态出现。
5. 编辑一个 MU 的 excerpt，离开输入框后确认不会报错。
6. 编辑一个 MU 的 researcher summary，离开输入框后确认不会报错。
7. 点击 accept，确认该 MU 变成 accepted / can proceed to categorising 的 evidence。
8. 给另一个 MU 填写 exclusion reason，然后点击 exclude。
   - 预期：没有 reason 时不能 exclude；有 reason 后可以 exclude。
9. 点击 **Add manual meaning unit**，手动添加一个 MU。
10. 对一个 MU 点击 **Split**，确认可以拆成两个 reviewable MUs。
11. 对相邻 MUs 点击 **Merge previous** 或 **Merge next**，确认可以合并。
12. 删除一个 MU，确认页面不崩溃，category/reviewer outputs 会被清空或提示需要重跑。
13. 刷新页面后，确认 Supabase mode 下 MU edits / manual MU / split / merge / delete 仍然存在。
14. 进入 Step 3，确认只有 accepted 且 non-excluded MUs 会进入 categorising。

预期 audit/edit-log events：

- `meaning_units_generated`
- `meaning_unit_edited`
- `meaning_unit_accepted`
- `meaning_unit_excluded`
- `meaning_unit_created`
- `meaning_unit_split`
- `meaning_unit_merged`
- `meaning_unit_deleted`

预期结果：

- Step 2 不再只是 AI output 展示页，而是 researcher-led MU review workflow。
- Researcher 可以人工修正、添加、拆分、合并、接受或排除 MUs。
- Excluded MUs 不进入 Step 3。
- 每个重要 researcher decision 都有 audit/edit log。

## 完整 v1.0 端到端验收占位

所有 P0 工单合并后再统一跑：

1. Create project。
2. Confirm data suitability。
3. Upload transcript 或 audio。
4. Review and confirm transcript。
5. Complete Step 1 notes。
6. Generate and review meaning units。
7. Edit / accept / exclude / add / split / merge meaning units。
8. Create and edit categories。
9. Build integration relationships and narrative。
10. Complete methodological integrity review。
11. Export complete analysis record。
12. 关闭浏览器并重新打开 project，确认所有工作都没有丢失。

## Ticket 7：Categorising workflow

Branch：`feature/v1-categorising-workflow`

Smoke check：

1. 打开一个已有 accepted MUs 的 project。
2. 进入 Step 3：Categorising。
3. 点击 **Create empty category**，创建一个 researcher-created category。
4. 将一个或多个 accepted MUs 分配到该 category。
5. 修改 category name、definition 和 researcher memo。
6. 点击 **Confirm as provisional category**。
7. 从 category 中移除一个 MU，确认它回到 unassigned MUs。
8. 将 unassigned MU 移动到另一个 category。
9. 创建第二个 category 后，测试 merge category。
10. 对包含多个 MUs 的 category 测试 split category。
11. 删除 category，确认其 MUs 回到 unassigned 状态。
12. Reject grouping，确认该 category 不再作为有效 category 使用。
13. 刷新页面后，确认 Supabase mode 下 category changes 仍然存在。
14. 检查 Step 4 只使用非 rejected、且包含 accepted MUs 的 reviewed categories。

预期 audit/edit-log events：

- `category_created`
- `category_renamed`
- `category_updated`
- `category_deleted`
- `meaning_unit_moved`

预期结果：

- Step 3 支持 researcher-led category editing，而不是只展示 AI-generated category suggestions。
- Researcher 可以创建、重命名、删除、合并、拆分 categories。
- Researcher 可以把 MUs 加入、移出或移动到不同 category。
- Category memo / definition / confirmation decision 可以保存。
- Category edits 刷新后仍然存在，并进入 audit/edit log。

## Ticket 8：Integrating workflow

Branch：`feature/v1-integrating-workflow`

Smoke check：

1. 打开一个已经有 accepted MUs 和 reviewed/confirmed categories 的 project。
2. 进入 Step 4：Integrating。
3. 勾选 **I confirm all meaning units in this transcript have been processed...**。
4. 点击 **Optional assistant support: suggest relationship structure**。
5. 确认页面生成：
   - provisional relationship structure
   - category map rows
   - editable summary narrative
6. 修改一个 relationship 的 source category、target category 或 relationship type。
7. 修改 relationship rationale，并选择/取消选择 linked MU evidence。
8. 点击 **Save integration draft**。
9. 修改 summary narrative 和 researcher note。
10. 点击 **I reviewed evidence and confirm this provisional draft**。
11. 刷新页面后，确认 Step 4 的 narrative、researcher note、relationships 仍然存在。
12. 导出 JSON/TXT，确认包含：
    - integration relationships
    - relationship evidence MU numbers
    - integration researcher note
    - integrated narrative
    - reviewed status / saved timestamp

预期 audit/edit-log events：

- `relationship_created`
- `relationship_updated`
- `relationship_deleted`

预期结果：

- Step 4 不只是临时 UI state，而是可以保存和重新加载的 integration workspace。
- Researcher 可以编辑 category relationships、rationale、evidence grounding 和 summary narrative。
- Integration narrative 不会自动被视为 final finding，仍然需要 researcher review/confirmation。
- Refresh 后 Step 4 关系结构和 narrative 不丢失。

## Ticket 9–10：Methodological integrity review + audit trail

Branch：`feature/v1-integrity-audit-trail`

Smoke check：

1. 打开一个已经完成 Step 2–4 的 project。
2. 进入 Step 5：Methodological Integrity。
3. 确认页面显示根据当前 project state 自动生成的 checklist，包括：
   - transcript 是否已 review / confirm
   - AI-generated MUs 是否都已 review
   - 是否存在 uncategorised accepted MUs
   - 是否存在没有 MU 支撑的 categories
   - excluded MUs 是否都有 reason
   - category names 是否过宽或过度解释
   - 是否存在 unresolved reviewer issues / over-interpretation flags
   - interpretation 是否和 participant wording 区分清楚
   - integration narrative 是否已经 review
   - audit trail 是否存在
4. 点击 **Refresh from project state**，确认 checklist 会根据当前项目状态重新计算。
5. 修改一个 checklist item 的 status。
6. 在 researcher response 和 researcher note 里填写说明。
7. 点击 **Save methodological integrity review**。
8. 刷新页面后确认 Step 5 checklist 的 researcher notes / resolved status 仍然存在。
9. 在 Step 5 页面确认 audit trail 可见，并且 AI / Researcher / Reviewer actions 可以区分。
10. 导出 JSON/TXT，确认包含：
    - methodological integrity checklist
    - reviewer issues
    - researcher responses / notes
    - audit trail
11. 点击 JSON / CSV / TXT export 后，确认 Supabase audit/edit log 中记录 `export_generated`。

预期 audit/edit-log events：

- `reviewer_issue_generated`
- `reviewer_issue_resolved`
- `integrity_review_updated`
- `export_generated`

预期结果：

- Step 5 不再只是 decorative reviewer page，而是可编辑、可保存、可导出的 methodological integrity review。
- Checklist 会根据当前 project state 自动生成初始判断。
- Researcher 可以添加 response/note，并把 issue 标记为 resolved / dismissed。
- Audit trail 在项目内可见，并在 export 中保留。
- Researcher edits、AI suggestions、Reviewer checks 在 audit trail 中可以区分。

## Ticket 11：Export analysis record

Branch：`feature/v1-export-analysis-record`

Smoke check：

1. 打开一个已经完成 Step 1–5 的 project。
2. 进入 Export 页面。
3. 点击 **Download JSON**。
4. 确认 JSON 文件可以下载，并包含：
   - project metadata
   - data suitability confirmation
   - Step 1 pre-analysis notes
   - transcript records
   - confirmed transcript
   - meaning units
   - categories
   - Step 4 integration relationships / narrative
   - Step 5 methodological integrity review
   - audit trail
   - export records
5. 点击 **Download CSV**，确认 meaning-unit table 可以下载。
6. 点击 **Download TXT**，确认可读 analysis record 可以下载。
7. 点击 **Download DOCX**，确认 Word document 可以下载并能被 Word / LibreOffice 打开。
8. 点击 **Open printable report**，确认会打开 printable report，并可通过 browser print dialog 另存为 PDF。
9. 每次导出后刷新页面，确认 export history / audit trail 中记录了 export action。
10. 检查 Supabase `edit_logs` / `audit_events`，应出现 `export_generated`。

预期 audit/edit-log events：

- `export_generated`

预期结果：

- Researcher 可以导出完整 analysis record，而不只是临时页面内容。
- JSON 可作为 project backup / audit backup。
- DOCX / printable PDF report 适合 supervision、research documentation 和 comparison study archive。
- Meaning-unit CSV 可用于 spreadsheet review。
- Export 文件清楚提示 assistant-supported outputs 仍需 researcher review against transcript evidence。
- Export action 会进入 audit trail。

## P1 Ticket 12–14：Speaker/segment handling + guidance chat + loading/error states

Branch：`feature/v1-p1-segments-guidance-loading`

Smoke check：

1. 打开一个已经完成 data suitability confirmation 和 transcript confirmation 的 project。
2. 进入 Step 2：Understanding & Translating。
3. 在 **Basic speaker / segment handling** 中点击 **Split transcript by speaker labels**。
4. 如果 transcript 使用了 `Interviewer:` / `Participant:` / `Q:` / `P:` 等 speaker labels，确认系统会生成 speaker-level segments。
5. 选择一个 segment，修改 **Segment type** 为：
   - Participant
   - Interviewer / prompt only
   - Unclear / mixed
6. 修改 segment label 和 segment text，点击 **Save segment edit**。
7. 将 participant 或 unclear segment 标记为 **Ready for MU analysis**。
8. 尝试把 interviewer-only segment 标记为 ready，确认 UI 会阻止或提示它主要作为 context 保留。
9. 点击 **Assistant support: draft meaning units** 或 **Use rule-based draft MUs**。
10. 确认 meaning-unit generation 会默认忽略标记为 interviewer-only 的 segments。
11. 测试 **Split at cursor**、**Merge previous**、**Merge next** 和 **Delete segment**，确认页面不崩，并且后续 MU/category outputs 会被清空或要求重新生成。
12. 刷新页面后，确认 Supabase mode 下 segment label、segment type 和 segment text 仍然存在。
13. 打开 **Methodological guidance chat**。
14. 在不同步骤分别提问，例如：
    - “Is this meaning unit too interpretive?”
    - “How should I name this category?”
    - “What should I check before moving to Step 3?”
15. 确认 guidance response 会根据当前 step 给出 reflective prompts，而不是直接声称完成 final coding / final interpretation。
16. 点击 **Save useful guidance as memo**。
17. 确认 saved memo count 增加，并且 Supabase audit/edit log 中出现 `guidance_memo_saved`。
18. 测试 AI generation、speaker segmentation、export 等按钮：
    - loading 时按钮应显示进行中状态
    - 重复点击应被 disabled 或不会重复触发
    - 如果发生错误，应显示 recoverable error panel
    - 有 retry option 时可以点击 Retry
19. 导出 JSON/TXT，确认包含 saved methodological guidance memos。

预期 audit/edit-log events：

- `segment_updated`
- `segment_speaker_role_updated`
- `guidance_memo_saved`
- existing generation/export events，例如 `meaning_units_generated`、`export_generated`

预期结果：

- Transcript 可以按 speaker label 形成基本 segments。
- Researcher 可以手动修正 segment text、label 和 speaker role。
- Interviewer-only segments 会保留为 context，但默认不会进入 meaning-unit generation。
- Guidance chat 是 methodological guide，不是 automatic coder。
- 有用 guidance 可以保存为 memo，并进入 audit trail。
- 关键操作有更清楚的 loading / error / retry 状态，并减少 repeated clicking 导致的重复 generation。
