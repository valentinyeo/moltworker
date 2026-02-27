#!/usr/bin/env node
// Voice message sender: Edge TTS → Telegram sendVoice
// Usage: node voice-send.js '<text>' '<chat_id>' [voice] [rate]

const { EdgeTTS } = require("@andresaya/edge-tts");

const text = process.argv[2];
const chatId = process.argv[3];
const voice = process.argv[4] || "en-US-AvaMultilingualNeural";
const rate = process.argv[5] || "+0%";

if (!text || !chatId) {
  console.error("Usage: node voice-send.js '<text>' '<chat_id>' [voice] [rate]");
  process.exit(1);
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error("Error: TELEGRAM_BOT_TOKEN env var not set");
  process.exit(1);
}

async function main() {
  // Synthesize speech to MP3 (OGG/OPUS not supported by this library version)
  // Telegram accepts MP3 via sendVoice and displays it as a voice message
  const tts = new EdgeTTS();
  await tts.synthesize(text, voice, {
    rate,
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
  });
  const audioBuffer = tts.toBuffer();

  if (!audioBuffer || audioBuffer.length === 0) {
    console.error("Error: TTS synthesis returned empty audio");
    process.exit(1);
  }

  console.log(`Synthesized ${audioBuffer.length} bytes of MP3 audio`);

  // Send to Telegram as voice message
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append(
    "voice",
    new Blob([audioBuffer], { type: "audio/ogg" }),
    "voice.ogg"
  );

  const resp = await fetch(
    `https://api.telegram.org/bot${botToken}/sendVoice`,
    { method: "POST", body: form }
  );

  const result = await resp.json();
  if (!result.ok) {
    console.error(`Telegram API error: ${result.description}`);
    process.exit(1);
  }

  console.log(`Voice message sent to chat ${chatId} (message_id: ${result.result.message_id})`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
