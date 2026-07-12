# Batch 11：语音状态机稳定性与 Ollama 恢复

## 修复范围

- 修复第一次无语音结果后 Hold to talk、Dismiss 和取消操作失灵。
- 使用 pointer capture、`pointerup`、`pointercancel` 和 `lostpointercapture` 管理按住说话。
- 松手后等待浏览器返回最后一段 transcript，再提交问题。
- `Esc` 使用 `abort()` 真正取消，不提交当前内容。
- 每轮识别使用独立 session id，旧回调不能污染下一轮。
- 浏览器提前触发 `onend` 时，只要用户仍按住按钮，就自动启动下一轮识别。
- 新增 `/api/voice-guide/health`，区分 Ollama 离线与模型缺失。
- 新增 “Check Ollama again”，恢复服务后不必刷新页面。
- 区分连接、超时、HTTP、空响应和 JSON 解析失败。
- Qwen3 的 `content`、`reasoning` 或 `thinking` 字段均可作为候选最终输出。
- structured fallback 变短，并显示真实失败原因。

## 手动测试

1. 按住按钮但不说话，松手。出现 No speech 后点击 Dismiss，再次按住应能正常录音。
2. 按住时按 Esc。当前问题应被取消，不发送到 Ollama。
3. 按住讲话超过十秒，松手后应提交完整问题。
4. 把鼠标移出按钮再松开，pointer capture 应保证仍能完成提交。
5. 停止 Ollama，打开 Mira，应看到 Local AI offline 和 Check Ollama again。
6. 恢复 Ollama，点击 Check Ollama again，应显示 Local AI ready。
7. Ollama 正常时，回答 provider 应为 `ollama-conversational`。
8. 模型输出格式异常时，UI 应显示真实 fallback 原因，而不是笼统声称无法连接。

## 数据库

本批不修改 Supabase schema，不需要执行 SQL migration。
