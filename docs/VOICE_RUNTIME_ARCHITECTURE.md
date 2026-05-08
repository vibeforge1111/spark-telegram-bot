# Spark Telegram Voice Runtime Architecture

Last audited: 2026-05-08

## Verdict

Voice is a Builder/chip capability delivered through the Telegram bot. The Telegram bot must not answer `/voice` from the legacy Spark dashboard/resonance helper.

The canonical live path is:

1. Telegram update reaches `spark-telegram-bot`.
2. `spark-telegram-bot` forwards `/voice`, `/voice speak ...`, and voice/audio messages to Builder with `gateway simulate-telegram-update`.
3. Builder routes voice commands to `spark-voice-comms`.
4. `spark-voice-comms` returns text plus optional `voice_media`.
5. `spark-telegram-bot` sends `voice_media` with `replyWithVoice` when it is Telegram-compatible.

## Live Owners

| Surface | Owner | Path | Notes |
| --- | --- | --- | --- |
| Live Telegram runtime | Spark CLI supervised module | `C:/Users/USER/.spark/modules/spark-telegram-bot/source` | What `spark start/restart spark-telegram-bot` runs. |
| Main Telegram dev checkout | Primary dev repo | `C:/Users/USER/Desktop/spark-telegram-bot` | Good voice bridge present. |
| Active recursive Telegram checkout | Current feature owner | `C:/Users/USER/Desktop/spark-telegram-recursive-sync-commands` | Good voice bridge integrated here; allowed to sync during this feature path. |
| Archived auth deploy checkout | Archived deploy worktree | `C:/Users/USER/Desktop/spark-telegram-bot-auth-deploy` | Sync blocked by default because it still has legacy `/voice`. |
| Archived UX deploy checkout | Archived deploy worktree | `C:/Users/USER/Desktop/spark-telegram-bot-ux-deploy` | Sync blocked by default because it still has legacy `/voice`. |
| Builder runtime | Spark Intelligence Builder | `C:/Users/USER/.spark/modules/spark-intelligence-builder/source` | Owns routing and voice command interpretation. |
| Voice chip | Spark voice comms | `C:/Users/USER/Desktop/spark-voice-comms` | Owns STT/TTS provider adapters. |
| Builder secrets/config | Local Spark state | `C:/Users/USER/.spark/state/spark-intelligence/.env` | Contains voice provider env refs and secrets; never paste keys in Telegram. |

## Required Telegram Bot Invariants

These must stay true in every worktree that can sync to runtime:

- `src/index.ts` routes `/voice` through `replyViaBuilder(ctx, ctx.message?.text || '/voice')`.
- `src/index.ts` has `sendBuilderVoiceMedia(...)`.
- `src/index.ts` registers `bot.on(message('voice'), handleVoiceMessage)` and `bot.on(message('audio'), handleVoiceMessage)`.
- `src/builderBridge.ts` parses Builder `detail.voice_media`.
- `src/builderBridge.ts` merges `C:/Users/USER/.spark/state/spark-intelligence/.env` into the Builder subprocess environment without printing secrets.
- `src/spark.ts` does not expose `getVoice()`.
- `dist` must match `src`; always run `npm run build` before syncing or starting.

Forbidden legacy signatures:

```text
spark.getVoice()
getVoice(): Promise<string>
// /voice - what Spark learned about user
```

## Accepted Runtime Sync Paths

Allowed:

```powershell
cd C:/Users/USER/Desktop/spark-telegram-bot
npm run build
node scripts/sync-runtime.cjs
node scripts/sync-runtime.cjs --check
```

During the recursive path work only:

```powershell
cd C:/Users/USER/Desktop/spark-telegram-recursive-sync-commands
npm run build
node scripts/sync-runtime.cjs
node scripts/sync-runtime.cjs --check
```

Blocked by default:

```text
C:/Users/USER/Desktop/spark-telegram-bot-auth-deploy/scripts/sync-runtime.cjs
C:/Users/USER/Desktop/spark-telegram-bot-ux-deploy/scripts/sync-runtime.cjs
```

Those archived scripts require `SPARK_ALLOW_STALE_TELEGRAM_RUNTIME_SYNC=1` and should only be used for intentional recovery.

## Voice Provider Config

The Builder voice config is local and secret-bearing:

```text
C:/Users/USER/.spark/state/spark-intelligence/.env
```

Active/implemented provider families:

- STT: OpenAI-compatible transcription, local faster-whisper.
- TTS: Kokoro, pyttsx3, ElevenLabs, OpenAI Realtime.

Planned/adapter slots:

- MiniMax TTS.
- Z.ai / GLM voice.

Codex CLI is not a native STT/TTS provider. It can help configure or test, but it is not the audio provider.

## Standard Live Verification

Run after every voice-related sync:

```powershell
rg -n "spark\.getVoice\(\)|getVoice\(\): Promise<string>|// /voice - what Spark learned about user" `
  C:/Users/USER/.spark/modules/spark-telegram-bot/source/src `
  C:/Users/USER/.spark/modules/spark-telegram-bot/source/dist `
  -g "*.ts" -g "*.js"

node scripts/sync-runtime.cjs --check

spark restart spark-telegram-bot --profile testerthebester --allow-dirty-runtime

npm run health:polling -- --profile testerthebester
```

Then test in Telegram:

```text
/voice
/voice speak Say one short warm sentence with GPT Realtime 2.
/voice speak Say one short warm sentence with Kokoro.
```

## Anti-Pattern Boundary

The recurring incident was `boundary-owner-confusion`:

- Telegram bot tried to own voice status through the old Spark dashboard helper.
- Builder actually owns the voice command semantics.
- Multiple Desktop worktrees could write to the same live runtime.
- `dist` could disagree with `src` until rebuild/restart.

The containment rule is simple: only Builder/chip output can answer `/voice`; Telegram only adapts, delivers, and logs.
