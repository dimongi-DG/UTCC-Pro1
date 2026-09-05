---
name: clip-story-studio
description: Maintain and extend the Clip Story Studio Electron application. Use when changing its Brief-to-Character-to-Story workflow, Prompt Template Registry, AI vendor routing, image/video/TTS generation, project schema, settings portability, renderer UI, tests, packaging, or when diagnosing runtime and provider errors in this repository.
---

# Clip Story Studio

## Overview

Use this skill to make repository changes without breaking the app's character-first production workflow, offline mock mode, portable project format, or main/renderer security boundary. Treat the source code and passing tests as authoritative; keep `README.md` synchronized with shipped behavior.

## Start With Evidence

1. Work from the repository root containing `package.json`.
2. Read the files related to the requested layer before editing.
3. Check `git status` when Git metadata is available and preserve unrelated user changes.
4. Run `npm.cmd test` before broad changes when practical, then again after editing.
5. Use `apply_patch` for source and documentation edits.

## Architecture Map

- `main.js`: Electron window, secure custom asset protocol, and built-in smoke test.
- `preload.js`: allow-listed APIs exposed through `contextBridge`; never expose raw `ipcRenderer`.
- `src/renderer/app.js`: Vanilla JS views, event handling, workflow state, and progress UI.
- `src/renderer/state.js`: project state and autosave.
- `src/main/ipc.js`: validated IPC boundary and native dialogs.
- `src/main/project-store.js`: atomic portable project persistence.
- `src/main/settings-store.js`: settings validation and encrypted API-key storage.
- `src/services/provider-registry.js`: structured text generation and vendor protocols.
- `src/services/media-provider.js`: OpenAI image and queued video generation.
- `src/services/tts-provider.js`: mock and OpenAI TTS.
- `src/shared/schema.js`: canonical project shape and migration normalization.
- `src/shared/prompt-templates.js`: default, validation, and rendering logic for editable prompts.
- `tests/`: Node test suite for schema, providers, media, export, settings, and security checks.

## Preserve Core Invariants

- Keep the workflow: Dashboard → Brief → Character Bible/reference sheets → Story/shot sketches → reference-based Storyboard → image-to-video → character-aware Voice → Timeline → Export.
- Require a reference image or Character Sheet for every character before AI Story generation.
- Keep character IDs stable. AI Story output may use names, but normalization must map them back to exact IDs.
- Keep character demographics and performance data explicit: `gender`, `lifeStage`, `ageYears`, `personality`, `speakingStyle`, and `voiceProfile`.
- For a Storyboard Shot with assigned characters, attach each primary Character Sheet to `/v1/images/edits` as repeated `image[]`. Do not claim visual reference usage when only prompt text was sent.
- Require `shot.storyboardImageRelativePath` before Video Prompt or video generation. Treat video as image-to-video and attach that file to `/v1/videos` as `input_reference`; never silently fall back to text-only.
- Keep video segments between 1 and 8 seconds and preserve motion handoff across segments.
- Store project asset paths relative to the project root; reject path traversal.
- Keep API keys in the main process and encrypt with Electron `safeStorage`; never return key text to the renderer or include it in settings export.
- Preserve offline mock providers so the planning workflow and tests do not require network access.
- Normalize external AI output before UI access. Never assume `scenes`, `shots`, `dialogue`, or `segments` exist.
- Mark downstream artifacts stale when Brief, character style, prompts, or upstream content changes; do not silently overwrite generated work.

## Edit Prompt Templates

Prompt templates are user-editable settings for `story`, `characters`, `storyboard`, and `video`. Each template has separate `system` and `user` text.

When adding or changing a template:

1. Before changing any default System/User text, add the fingerprint of the OLD text to `LEGACY_TEMPLATE_FINGERPRINTS` (`templateFingerprint(text)`) and bump `PROMPT_TEMPLATE_REVISION`. Saved templates that still match an old default are upgraded automatically on load; customised text is never touched.
2. Define defaults and allowed variables in `src/shared/prompt-templates.js`. Variable names must match `[A-Za-z][A-Za-z0-9]*`.
3. Define `variableGuide` source paths and meanings for every allowed variable so Settings can explain provenance.
4. Supply every declared variable from the matching context builder (`storyPromptContext`, `characterPromptContext`, `storyboardPromptContext`, `videoPromptContext`); `provider-registry.js` and `export-service.js` must not build prompt contexts inline.
5. Keep output schemas explicit in the default User prompt and aligned with the parsers (`ai-normalize.js`, `provider-registry.js`). Do not ask the model for fields the app overrides (`durationSec`, `segmentNumber` order, `sheetStyle`, ids).
6. Validate empty text, maximum length, and unknown `{{variable}}` names before saving.
7. Render only declared variables and raise a `configuration` error when a value is unavailable.
8. Route System/User separately:
   - OpenAI Responses: `instructions` and `input`.
   - OpenAI-compatible Chat: `messages` with `system` and `user` roles.
   - Gemini: `systemInstruction` and user `contents`.
9. Keep templates in portable Settings export/import, but continue excluding API keys.
10. Keep the phrases the tests lock: `image-to-video` and `fictional consenting actors` in the video System prompt, `public-service awareness` in the video User prompt.
11. Add or update tests in `tests/prompt-templates.test.js`, `tests/providers.test.js`, and `tests/settings-transfer.test.js`.

Do not expose arbitrary JavaScript evaluation or file interpolation through template variables.

## Add or Change AI Vendors

1. Update vendor definitions and validation in `src/shared/vendors.js`.
2. Keep endpoint validation HTTPS-only except explicit loopback hosts.
3. Declare capabilities (`text`, `tts`) and prevent invalid routing during settings save.
4. Keep protocol-specific request bodies in `provider-registry.js`; do not branch on vendor display names.
5. Classify authentication, rate-limit, timeout, moderation, malformed-response, and provider-unavailable errors into user-facing errors.
6. Add tests that mock `fetch`; never call paid APIs from the automated test suite.

Use current official API documentation when changing OpenAI request formats, models, or endpoint behavior.

## Change Project Data

When adding persistent fields:

1. Add safe defaults in `src/shared/schema.js`.
2. Normalize legacy or missing values on load.
3. Update validators and export serialization as needed.
4. Keep `SCHEMA_VERSION` and migrations compatible with existing projects.
5. Add a regression test that opens or normalizes older data.

## UI and Progress Rules

- Keep input and textarea text compact and readable.
- Every asynchronous action must set a clear busy label, disable its source button, and surface a progress/status bar when progress exists.
- Preserve video/image previews with `object-fit: contain` so the full frame remains visible. Keep landscape Video Preview at no more than 640×360 CSS pixels and portrait Preview at no more than 300 CSS pixels wide; preview sizing must never alter source/export resolution.
- Show badges for generated, stale, failed, and moderation-blocked artifacts.
- Confirm before replacing prompts, generated segments, or other costly work.
- Use friendly errors with actionable hints; do not expose raw errors such as `Cannot read properties of undefined`.

## Media Reference Contract

- Resolve assigned references from `shot.characters`, not from every character in the project.
- Prefer the `isPrimary` image, otherwise use the first reference; reject missing or non-image files before a paid request.
- Record reference character IDs/count in `shot.imageGenerationMeta` and the Storyboard source path in segment/video generation metadata.
- When a Storyboard image changes or is removed, mark downstream Segment prompts and generated videos stale.
- Use `/v1/images/generations` only for Character Sheets or shots without assigned characters; use `/v1/images/edits` for reference-based Storyboard scenes.
- Pass Story, language, dialogue emotion/delivery, and the speaker's Character Bible profile into TTS instructions and cache keys. Resolve `th-female-warm` to OpenAI `coral`, explicitly request native Thai feminine presentation, and version the instruction cache whenever this contract changes.
- When `voiceAssignments.<speakerId>`, dialogue text, emotion, delivery, or speaking rate changes, mark existing audio stale and hide its player. Regenerate must bypass the application cache, cache-bust the preview, and record both the requested Voice ID and the provider Voice ID; cached responses must preserve the same metadata.
- Apply deterministic Sora safety framing at the final Video API request layer so legacy/custom templates are covered. Keep the story's prevention message while removing operational fraud, real-person likeness, copied-voice, personal-data, banking-data, and credential details.
- Parse provider error bodies before classifying HTTP 400 responses; surface moderation as `content_policy` and retain the job ID when available.
- Resolve bundled `ffmpeg-static` from `app.asar` to `app.asar.unpacked` only after verifying that the unpacked executable exists; packaged smoke tests must execute `ffmpeg -version`.
- Remove all audio tracks from downloaded AI-generated Video Segments with stream-copy (`-map 0:v:0 -c:v copy -an`) before storing them; project audio must come from Voice/TTS, Music, and SFX.
- Enforce a zero-visible-text directive in every generated Image Prompt and Video Prompt, every negative prompt, and again at the final Media API request boundary. Screens, signs, documents, packages, clothing graphics, logos, labels, subtitles, numbers, and typography in every language must be blank, abstract, fully blurred, turned away, or outside the frame.
- Let Steps 3 and 4 export separately labeled System and User prompts rendered from the current editable Prompt Templates with real project variables substituted. Step 3 must provide Character System/User Markdown plus JSON. Step 4 must additionally provide a single full-story master prompt, separate per-Shot prompts, Story System/User Markdown, structured JSON, and copied primary Character Sheet references. The master prompt must carry Brief, Opening, Climax, Ending, the complete ordered narrative, every dialogue/performance beat, and a requirement to finish the final Shot. Preserve character mappings, output filenames, camera details, negative prompts, and the zero-visible-text rule.
- Offer a visible strict rewrite action for blocked Segments. It must replace—not merely prefix—the rejected text with a prevention-only vignette free of operational content. In batch generation, record and skip moderation-blocked Segments while continuing safe Segments; stop the batch for network/authentication/provider failures.
- Never present safety rewriting as a guaranteed moderation bypass. If a fictional prompt remains blocked, advise replacing photorealistic Storyboard inputs with an explicitly stylized fictional image.

## Verify Changes

Run the unit suite:

```powershell
npm.cmd test
```

Run the renderer smoke test:

```powershell
node_modules\.bin\electron.cmd . --smoke-test
```

The smoke test may need permission to write Electron cache data under the user's application-data folder. A successful run prints `SMOKE_OK`.

For a release:

1. Bump `version` in both `package.json` and `package-lock.json`.
2. Run unit and source smoke tests.
3. Build on the target OS with `npm.cmd run build:win` or `npm.cmd run build:mac`.
4. Smoke-test the unpacked app when possible.
5. Report the exact installer path and checksum.
6. Update `README.md` with new settings, workflow behavior, limitations, and test counts without claiming unverified provider support.

## Completion Checklist

- Requested behavior is implemented in the real execution path, not only displayed in UI.
- Existing project files and settings remain loadable.
- API keys remain encrypted and excluded from exports/logs.
- Unit tests pass and the renderer smoke test passes.
- Documentation matches the shipped version.
- Installer is rebuilt if the user requested a deliverable application.
