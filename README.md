# Echo 🎧

**Language Learning Audio Player** — Drop any audio file, get real-time word-by-word transcription highlighting for shadowing and sentence mining.

🔗 **[Try it live →](https://echo-cliffordaddison.vercel.app)**

## Features

- 🎯 **Real-time word highlighting** — words light up as they're spoken, like Apple Podcasts
- ⏮️ **Sentence navigation** — prev/next buttons jump sentence by sentence for shadowing practice
- 🔁 **Loop mode** — repeat any sentence until you've nailed the pronunciation
- 🐢 **Speed control** — 0.5× to 2.0× for slow, careful listening
- 🌍 **90+ languages** — French, Spanish, German, Japanese, and many more
- 🔒 **100% private** — everything runs in your browser, no data leaves your device
- 💰 **100% free** — no API keys, no subscriptions, no limits

## How It Works

1. Open Echo in your browser
2. Drag & drop any audio file (MP3, WAV, M4A, FLAC, OGG)
3. Wait for Whisper AI to transcribe (model downloads once, ~75MB, cached after)
4. Play, shadow, mine sentences — learn!

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` `→` | Previous / Next sentence |
| `↑` `↓` | Speed up / Slow down |
| `A` | Toggle auto-advance |

## Tech Stack

- **Transcription**: [Whisper](https://github.com/openai/whisper) via [Transformers.js](https://huggingface.co/docs/transformers.js) (runs in browser)
- **Frontend**: Vanilla HTML/CSS/JS — no frameworks, no build step
- **Hosting**: Static files on Vercel

## Run Locally

Just serve the files with any static server:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .
```

Then open `http://localhost:8000`.

## Deploy to Vercel

1. Push to GitHub
2. Connect repo to [Vercel](https://vercel.com)
3. Deploy — it auto-detects static sites, zero config needed

## License

MIT
