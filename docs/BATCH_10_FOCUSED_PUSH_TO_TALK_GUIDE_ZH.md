# Batch 10：聚焦式按住说话 Qualitative Analysis Guide

## 目标

本批将 Mira 从通用陪聊型助手重新收束为五阶段 qualitative analysis voice guide。

## 产品边界

Mira 的主要工作是帮助研究者使用已经准备好或正在准备的 qualitative material，完成：

1. Pre-analysis
2. Understanding & Translating
3. Categorizing
4. Integrating
5. Methodological Integrity

Mira 可以简短回应问候、疲劳、紧张或困惑，但随后应温和地把用户带回当前分析任务。Mira 不承担心理咨询、生活建议、开放式研究选题生成或无限制陪聊。

## 研究问题支持

Mira 可以：

- 检查已有 qualitative research question 是否 open-ended；
- 帮助用户根据已有数据修改措辞；
- 检查 research question、data 和 analytic purpose 是否匹配。

Mira 不应：

- 在用户没有数据或研究背景时从零天马行空生成选题；
- 替研究者决定最终研究问题；
- 把一般 brainstorming 变成产品主要用途。

## 语音交互

- 按住 `Hold to talk` 开始识别；
- 松开按钮后提交；
- 按 `Esc` 取消；
- 默认不显示完整回答文本；
- 用户可主动开启 captions；
- 实时互动不保存为 guidance note；
- 旧 `guidance_memos` 数据仍兼容，但新 UI 不写入。

## 性能

- 对话历史由 8 条缩减为 4 条；
- 单条历史内容截断；
- 默认回答限制为 2–4 个短句；
- Ollama `num_predict` 降低为 320；
- 增加 `keep_alive`，默认 10 分钟；
- 精简知识库和 project context 注入。

## Supabase

本批不新增表、字段、约束或 RPC，不需要执行 SQL migration。
