---
name: voice
description: Send voice messages to Telegram chats using Edge TTS (Microsoft text-to-speech). Converts text to natural-sounding speech and sends as a Telegram voice message with waveform display. No API key needed — uses free Edge TTS service. Requires TELEGRAM_BOT_TOKEN env var.
user-invocable: true
---

# Voice Messages via Edge TTS

Send voice messages to Telegram chats. Converts text to speech using Microsoft Edge TTS (free, no API key) and sends via Telegram's `sendVoice` API.

## Quick Start

```bash
node /root/clawd/skills/voice/scripts/voice-send.js '<text>' '<chat_id>' [voice] [rate]
```

### Arguments

| Arg | Required | Default | Description |
|-----|----------|---------|-------------|
| `text` | Yes | — | Text to speak |
| `chat_id` | Yes | — | Telegram chat ID (get from conversation context or `getUpdates`) |
| `voice` | No | `en-US-AvaMultilingualNeural` | Edge TTS voice name |
| `rate` | No | `+0%` | Speech rate (e.g. `+20%`, `-10%`) |

### Examples

```bash
# Basic voice message
node /root/clawd/skills/voice/scripts/voice-send.js 'Hello, how are you?' '123456789'

# German voice
node /root/clawd/skills/voice/scripts/voice-send.js 'Hallo, wie geht es dir?' '123456789' 'de-DE-SeraphinaMultilingualNeural'

# Faster speech
node /root/clawd/skills/voice/scripts/voice-send.js 'This is a fast message' '123456789' 'en-US-AvaMultilingualNeural' '+20%'
```

## Getting the Chat ID

The chat ID is available from the conversation context when a user messages the bot. If you need to find it manually:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  d.result?.slice(-5).forEach(u => {
    const c = u.message?.chat || u.edited_message?.chat;
    if (c) console.log(c.id, c.first_name || c.title || 'unknown');
  });
"
```

## Popular Voices

| Voice | Language | Style |
|-------|----------|-------|
| `en-US-AvaMultilingualNeural` | English (US) | Warm, natural (default) |
| `en-US-AndrewMultilingualNeural` | English (US) | Male, clear |
| `en-GB-SoniaNeural` | English (UK) | British female |
| `de-DE-SeraphinaMultilingualNeural` | German | Natural female |
| `fr-FR-DeniseNeural` | French | Natural female |
| `es-ES-ElviraNeural` | Spanish | Natural female |
| `ja-JP-NanamiNeural` | Japanese | Natural female |
| `zh-CN-XiaoxiaoNeural` | Chinese | Natural female |

## Requirements

- `TELEGRAM_BOT_TOKEN` env var (already configured in the container)
- `@andresaya/edge-tts` npm package (installed globally in the container)

## Output Format

Audio is synthesized as OGG/OPUS (`ogg-24khz-16bit-mono-opus`) — the native Telegram voice format. This ensures:
- Waveform visualization in the chat
- Playback speed controls (1x, 1.5x, 2x)
- Compact file size

## Troubleshooting

- **"TELEGRAM_BOT_TOKEN not set"**: Ensure the env var is available in the container
- **Synthesis fails**: Check voice name is valid (Edge TTS is case-sensitive)
- **Telegram API error**: Verify chat_id is correct and bot has permission to send messages
