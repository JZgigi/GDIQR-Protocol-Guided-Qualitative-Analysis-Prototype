# Batch 14：MediaRecorder 生命周期修复

## 根因

Batch 13 的键盘监听 `useEffect` 依赖 `state`。调用 `setState("recording")` 后，React 会先执行旧 effect 的 cleanup；cleanup 中调用了 `resetRecorder()`，因此刚开始的 MediaRecorder 会被立刻停止。界面表现为录音状态闪一下就回到 Ready。

## 修复

- 移除 effect 对 `state` 的依赖；
- Escape 是否可取消，直接读取 `recorderRef.current.state`；
- cleanup 只在组件卸载时执行，不会在 Recording/Transcribing/Thinking 状态切换时停止录音。

## 数据库

不修改 Supabase schema，不需要 SQL migration。
