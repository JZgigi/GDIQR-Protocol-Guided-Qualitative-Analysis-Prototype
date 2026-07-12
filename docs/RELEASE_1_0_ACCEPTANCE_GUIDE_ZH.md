# GDI-QR v1.0 中文验收指南

> 适用范围：`release/1.0`，包含 Batch 0–6。  
> 测试数据仅限公开、合成、匿名化或已去标识材料。不要用真实可识别敏感研究数据进行验收。

## 1. 验收目标

本轮验收确认研究者能完成一条完整的单项目 GDI-QR-informed 工作流，并且系统始终保留研究者最终判断责任：

1. 创建或打开项目。
2. 记录研究问题、domains、研究者立场和 dataset/source note。
3. 导入、准备、审查并确认 transcript。
4. 生成并人工审查 meaning units。
5. 创建、编辑、分配并确认 categories。
6. 建立 category relationships 和 integration narrative。
7. 完成 methodological integrity review。
8. 使用 Voice Guide 获取方法学反思支持，但不让其代替分析决定。
9. 主动保存有用的 Voice Guide note，并确认其进入 audit/export。
10. 导出完整 analysis record，并在 Supabase 模式下确认刷新后数据仍然存在。

## 2. 开始前准备

### 2.1 分支与依赖

```powershell
git switch release/1.0
git pull origin release/1.0
npm install
npm run typecheck
npm run test:batch2
npm run test:batch3
npm run test:batch4
npm run test:batch5
npm run test:batch6
npm run build
```

所有命令都应通过。若 `next-env.d.ts` 仅因 Next.js build 自动变化，可执行：

```powershell
git restore next-env.d.ts
```

### 2.2 选择测试模式

**Local-only 模式**适合快速 UI 和方法流程检查。未保存的 Voice Guide interaction 只存在于当前页面状态。

**Supabase 模式**用于验证持久化、audit trail 和刷新恢复。确保 `.env.local` 已设置：

```text
STORAGE_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GDIQR_DEFAULT_PROJECT_ID=proj_student_wellbeing
```

数据库要求见 `docs/SUPABASE_V1_0_SETUP.md`。

## 3. 建议测试材料

准备一份 8–15 分钟等量的合成访谈文本，至少包含：

- `Interviewer:` / `Participant:`；
- 一个较长 participant answer；
- 一个明显 meaning shift；
- filler，如 “okay”“yes”；
- 一处可能的个人姓名或地点，用于 privacy review；
- 至少两种可形成 category 的 shared meanings；
- 一个 exception 或 tension。

另准备 Q/A 和中文 speaker label 的短文本，以测试 parser：

```text
Q: What changed for you?
A: I noticed stress earlier, but I still found it difficult to pause.
```

```text
访谈者：你第一次练习时有什么感觉？
受访者：刚开始很难集中，但后来我能在走神后重新回到呼吸。
```

## 4. 自动检查

执行：

```powershell
npm run typecheck
npm run test:batch2
npm run test:batch3
npm run test:batch4
npm run test:batch5
npm run test:batch6
npm run build
```

验收标准：全部返回成功，不应出现 TypeScript 或 production build error。

## 5. 项目入口与基础设置

1. 启动：

```powershell
npm run dev
```

2. 打开 `http://localhost:3000`。
3. 确认顶部是 compact Project Bar，而不是长期展开的大表单。
4. 确认可区分：Current project、Open project、Project settings、Create new project。
5. Project settings 和 Create new project 默认应折叠。
6. 设置 research question、domains、researcher notes、dataset sensitivity 和 dataset/source note。
7. 保存后切换 step，再返回，内容不应意外丢失。

通过标准：用户进入页面后首先看到 workflow；项目来源与 material type 不再和 SMARTEN/Interview 混在同一级分类中。

## 6. Step 1：Pre-analysis 与 transcript

1. 导入或粘贴 transcript。
2. 确认 transcript preparation 显示：当前阶段、elapsed time、approximate estimate。
3. 任务运行时按钮应 disabled，重复点击不应启动多个任务。
4. 检查 privacy review item 是否可编辑、确认或记录处理理由。
5. 检查 speaker turns；Advanced speaker handling 默认折叠。
6. 确认 transcript 后进入 Step 2。

通过标准：未确认 transcript 时不能被误当作最终分析材料；fallback 发生时 UI 有明确提示。

## 7. Step 2：Meaning Units

1. 点击生成 draft MUs。
2. 检查 interviewer-only turns 默认不进入 participant MUs。
3. 检查 filler 不单独成为 MU。
4. 检查长 answer 不会机械地每句话切一段。
5. 测试 Edit、Accept、Exclude，并给 exclusion reason。
6. 在 Advanced 中测试 Split、Merge、Delete。
7. 检查每个 accepted MU 有清楚 excerpt 和 summary。

通过标准：MU 应足以表达一个完整 meaning；所有 AI 输出都仍是 draft，需要研究者确认。

## 8. Step 3：Categorising

1. 确认仅 accepted MUs 进入 categorising。
2. 创建 category，填写 name 和 definition。
3. 分配和取消分配 MUs。
4. 检查 category generation 的 loading/progress 和防重复点击。
5. 确认 category 前检查其至少有一条 MU evidence。
6. 测试 Advanced 中的 merge/split/reject/delete（如当前 UI 提供）。

通过标准：category 不是单纯 topic label；definition 和 MU evidence 能相互对应。

## 9. Step 4：Integrating

1. 创建或编辑 category relationship。
2. 选择 supporting MU evidence。
3. 写 integration narrative 和 researcher memo。
4. 检查 narrative 不只是 category list。
5. 检查因果或普遍化表述是否超出当前数据。
6. 保存并确认 integration。

通过标准：relationship 和 narrative 均可追溯到 category/MU evidence，并保留研究者判断。

## 10. Step 5：Methodological Integrity

逐项检查：

- accepted MUs 是否全部 reviewed；
- exclusions 是否有 reason；
- categories 是否有 evidence；
- accepted MUs 是否存在未分配但无说明的情况；
- integration claims 是否 grounded；
- researcher assumptions 和关键 decisions 是否有记录；
- unresolved issue 是否已处理、dismiss with memo 或明确记录为 limitation。

保存 review 后刷新或重新打开项目（Supabase 模式），确认内容仍在。

## 11. Voice Guide 验收

### 11.1 Avatar 与界面

1. 右下角显示浮动 AI Guide avatar。
2. 打开后应是小型 popover，不是常驻 chat panel。
3. 不显示完整 chat history，也没有主 workflow textarea。
4. 检查 idle、listening、thinking、speaking、error、captions-only 状态。

### 11.2 方法学边界

依次测试：

```text
Should I split this MU?
Write the category definition for me.
How should I organise the integration narrative?
Am I ready to move to Step 3?
```

Voice Guide 不得给出最终 yes/no、final definition 或完整最终 narrative。它应返回：

- methodological principle；
- what to inspect；
- reflective questions/checks；
- what to document；
- researcher responsibility reminder。

### 11.3 Voice 与 fallback

1. 允许麦克风，进行一次语音提问。
2. 检查自动朗读和 Replay。
3. 打开 Captions-only，再提问，确认不自动朗读。
4. 拒绝 microphone permission，确认出现紧凑 text fallback，而不是聊天面板。
5. 浏览器不支持 SpeechRecognition 时，应仍可使用 fallback。

隐私说明：应用不保存 raw audio；但浏览器 speech recognition 可能由浏览器厂商处理语音。严格 local-only 或敏感环境中，应禁用该功能并使用批准的替代方式。

### 11.4 Transient 与 Save note

1. 提问后不要点击 Save note，刷新页面。
2. audit trail 和 export 不应出现该 interaction。
3. 再提问并点击 Save note。
4. audit trail 应出现 `voice_guidance_note_saved`。
5. 保存的 note 应含 step、question、answer/summary、boundary reminder 和 timestamp。

## 12. Export 验收

依次检查：

- JSON backup；
- MU CSV；
- readable TXT；
- DOCX；
- printable/PDF-oriented record。

导出过程中应显示进度并防重复点击。导出内容至少应包括：

- project metadata；
- research question/domains/researcher notes；
- transcript status；
- MUs；
- categories；
- integration；
- integrity review；
- audit/edit trail；
- researcher-saved Voice Guide notes。

未保存 Voice Guide interaction 不应出现在任何长期导出中。

## 13. Supabase 持久化验收

在 Supabase 模式：

1. 创建或编辑项目。
2. 保存 transcript、MUs、categories、integration、integrity review 和一个 Voice Guide note。
3. 刷新页面。
4. 重新打开同一项目。
5. 对照所有关键内容是否恢复。
6. 打开 `/api/workspace`，确认 `dataSource` 为 `supabase`。
7. 在 Supabase Table Editor 检查：
   - `guidance_memos` 有保存的 Voice Guide note；
   - `audit_events` 或 `edit_logs` 有 `voice_guidance_note_saved`；
   - 未保存 interaction 没有数据库记录。

## 14. Accessibility 与响应式检查

- 仅用键盘可以打开/关闭 Voice Guide 并触发主要按钮；
- focus indicator 可见；
- Voice Guide 状态可被屏幕阅读器感知；
- `prefers-reduced-motion` 下没有强制动画；
- 较窄窗口中 avatar 不遮挡主要操作区；
- captions-only 模式可独立完成 guidance interaction。

## 15. 缺陷记录模板

```text
标题：
分支/commit：
存储模式：local-only / Supabase
浏览器与版本：
操作步骤：
预期结果：
实际结果：
是否可稳定复现：
截图/console error：
数据风险或隐私影响：
严重程度：Blocker / High / Medium / Low
```

## 16. 最终通过条件

只有同时满足以下条件，才建议将 `release/1.0` 视为本轮 research prototype 验收完成：

- 自动检查全部通过；
- 单项目 Step 1–5 可完整执行；
- 关键 Supabase 内容刷新后仍存在；
- Voice Guide 边界测试全部通过；
- raw voice audio 不被应用保存；
- 未保存 interaction 不进入长期记录；
- saved guidance note 正确进入 audit/export；
- 所有 Blocker/High 缺陷已修复或有明确不发布决定；
- 已记录已知限制、浏览器限制和隐私限制。

## Batch 8：对话式 Voice Agent 验收

1. 确认 Ollama 正在运行，并已安装 `.env.local` 中配置的模型。
2. 问普通闲聊问题，例如“你好，今天怎么样？”：回答应自然，不应强行列出 research question 或 data suitability。
3. 问情绪支持问题，例如“我今天分析得有点累”：回答应温和，并可提供简短支持，不应机械输出 checklist。
4. 问方法学问题，例如“What is a domain of investigation?”：回答应针对问题解释，并以 GDI-QR 知识库为依据。
5. 问当前工作流问题，例如“What should I do next?”：回答应结合当前 step 和项目状态。
6. 问分析决定，例如“Should I split this MU?”：不得替研究者给出最终 yes/no；应引导检查 evidence。
7. 连续追问“Can you explain that more simply?”：应能利用当前临时会话上下文继续回答。
8. 检查 API 返回 provider：正常应为 `ollama-conversational`；Ollama 不可用时应为 `structured-gdiqr-fallback` 并显示原因。
9. 刷新页面后，未保存的闲聊和临时上下文不应进入 audit/export。
10. 只有点击 Save note 的研究者选定内容才应持久化。
