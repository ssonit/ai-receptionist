# AI Voice Agent — Browser Voice Interaction

Date: 2026-08-01 | Status: Design | Scope: Browser voice (no phone calls)

## Overview

Add two-way voice interaction to eve-booking chat surfaces. Guest users can speak to the AI agent via microphone and hear responses via speakers — like voice messages in a chat app — while continuing to support text input.

This is phase 1 (browser only). Phone call integration is planned for a later phase.

## Architecture

### Data flow

```
User taps mic → SpeechRecognition (push-to-talk)
  ├── real-time interim text displayed in textarea
  └── silence 1.5s → auto-finalize transcript
        ↓
  transcript text
        ↓
  useEveAgent.send(transcript)  [existing, unchanged]
        ↓
  LLM response text
        ↓
  agent message rendered + SpeechSynthesis.speak(text)
        ↓
  user starts speaking → cancel TTS immediately
```

### Provider abstraction

A `VoiceProvider` interface wraps browser Web Speech APIs. This is forward-compatible with AI SDK server-side providers (Whisper, OpenAI TTS) for a future premium tier — swap the provider without touching hooks or UI.

```ts
// lib/voice/provider.ts
interface VoiceProvider {
  createRecognition(lang: string): SpeechRecognition | null;
  speak(text: string, lang: string, voice?: string): SpeechSynthesisUtterance;
  cancelSpeech(): void;
  getVoices(lang?: string): SpeechSynthesisVoice[];
}

const webSpeechProvider: VoiceProvider = { ... };
```

Initial implementation: `WebSpeechProvider` only (zero dependency, zero API cost).

## Components

### `lib/voice/use-voice-input.ts` — STT hook

```ts
function useVoiceInput(options: {
  locale: "en" | "vi";
  onTranscript: (text: string) => void;
}): {
  isSupported: boolean;
  isListening: boolean;
  interimText: string;
  start: () => void;
  stop: () => void;
  error: string | null;
}
```

State machine: `IDLE → LISTENING → SILENCE_TIMER(1.5s) → FINALIZE → IDLE`

Silence detection: primary via `onspeechend` event, with 3s inactivity fallback on `onresult`. 10s hard timeout if no speech detected at all.

Key edge cases:
- Firefox: SpeechRecognition unavailable → `isSupported = false`
- Permission denied: `error = "permission-denied"`
- No speech within 10s: auto-stop, `error = "no-speech"`
- User taps mic again while listening: finalize current transcript immediately

### `lib/voice/use-voice-output.ts` — TTS hook

```ts
function useVoiceOutput(options: {
  locale: "en" | "vi";
  enabled: boolean;
}): {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string) => void;
  cancel: () => void;
  setEnabled: (v: boolean) => void;
}
```

Auto-play behavior:
1. New agent message arrives → strip markdown → split into sentences → speak sequentially
2. Skip if user is currently recording (mic on)
3. Debounce 500ms for streaming responses (only speak the final message)
4. First user tap on mic satisfies browser autoplay policy

### `components/voice-input-button.tsx` — Mic button

Three visual states:
- **IDLE**: mic icon, muted color, tooltip "Voice input"
- **LISTENING**: pulsing red dot, interim text visible in textarea
- **ERROR**: mic + alert icon, tooltip with error message

Position: inside `PromptInput`, between textarea and send button.

### Integration points

| Existing file | Change | Lines |
|---|---|---|
| `components/ai-elements/prompt-input.tsx` | Accept optional `voiceButton` prop | ~3 |
| `app/_components/agent-chat.tsx` | Wire hooks: transcript → append, new message → speak, listening → cancel TTS | ~20 |
| `app/_components/agent-message.tsx` | Optional replay button on assistant messages | ~5 |

## i18n

Strings added to `messages/en.json` and `messages/vi.json`:

```json
"voice": {
  "start": "Voice input",
  "listening": "Listening...",
  "errorNotSupported": "Voice input not supported in this browser",
  "errorPermission": "Microphone access denied",
  "errorNoSpeech": "No speech detected"
}
```

## File plan

```
lib/voice/
├── provider.ts             [new] VoiceProvider interface + WebSpeech impl
├── use-voice-input.ts      [new] STT hook
└── use-voice-output.ts     [new] TTS hook

components/
└── voice-input-button.tsx  [new] Mic button component

app/_components/
└── agent-chat.tsx          [edit] Wire hooks (~20 lines)
└── agent-message.tsx       [edit] Replay button (~5 lines)

components/ai-elements/
└── prompt-input.tsx        [edit] voiceButton prop (~3 lines)

messages/
├── en.json                 [edit] +voice object
└── vi.json                 [edit] +voice object
```

## Non-goals (this phase)

- Phone call / SIP integration
- Server-side STT/TTS (Whisper, OpenAI TTS) — abstraction exists for future
- Audio recording persistence
- Wake word / always-listening mode
- Custom voice selection per tenant

## Testing

Manual testing per `.claude/skills/test-feature/SKILL.md`:
1. Verify mic button appears on `/chat`, `/b/[slug]`, `/embed/[slug]`
2. Push-to-talk works — transcript appears after silence
3. AI response auto-plays via TTS
4. TTS cancels when user starts speaking mid-playback
5. Locale switching updates STT lang and TTS voice
6. Firefox: mic button hidden with no error
7. Mobile Chrome/Safari: full flow works
