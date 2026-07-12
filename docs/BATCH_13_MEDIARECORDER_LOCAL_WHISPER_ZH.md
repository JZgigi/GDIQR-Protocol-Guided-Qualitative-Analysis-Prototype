# Batch 13：MediaRecorder + 本地 Whisper 语音输入

## 目的

彻底移除不稳定的浏览器 `SpeechRecognition` 主流程。Mira 现在使用浏览器 `MediaRecorder` 录制完整音频，并在本机通过 `faster-whisper` 转写。

## 交互

1. 点击 `Record question` 开始录音；
2. 再点击一次停止；
3. 显示 `Transcribing locally`；
4. transcript 发送给本地 Ollama；
5. Mira 朗读回答。

按 `Esc` 会取消并丢弃本次录音。

## 隐私

- 音频只发送到同一台电脑上的 Next.js route；
- 临时文件位于系统临时目录；
- 无论成功或失败都会在 `finally` 中删除；
- 音频和未保存对话不写入 Supabase、audit 或 export。

## Python 环境

项目 `.venv` 中需要：

```powershell
pip install faster-whisper
```

默认模型为 `small`。可以在 `.env.local` 设置：

```env
VOICE_GUIDE_WHISPER_MODEL=small
VOICE_GUIDE_WHISPER_DEVICE=auto
VOICE_GUIDE_WHISPER_COMPUTE_TYPE=int8
```

若需指定 Python：

```env
VOICE_GUIDE_PYTHON=C:\path\to\.venv\Scripts\python.exe
```

## Supabase

不修改数据库 schema，不需要 SQL migration。
