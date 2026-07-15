# TTS + Avatar Integration Plan

## Goal

Add an admin-facing workflow that lets admins:

- select an existing course or newly uploaded course bundle
- generate a narration script for HTML lesson/scenario slides using an LLM
- preview slides alongside generated script and audio
- enable or disable `TTS` and `Avatar` separately for a course
- show status such as `script generated`, `audio generated`, and `avatar enabled`

On the learner side, the course player should:

- detect the current HTML slide state from the embedded iframe
- play the matching narration/audio
- optionally render an avatar experience alongside the slide content
- avoid blocking course progress if TTS or avatar is unavailable

## Current Codebase Findings

### Course authoring

The admin course flow already exists in:

- `src/components/admin/course-builder-panel.tsx`
- `src/components/admin/content-library-hub.tsx`
- `src/app/api/courses/media/route.ts`
- `src/app/api/courses/[id]/steps/route.ts`

Courses are built as ordered steps:

- `pdf` -> currently also used for HTML lesson uploads
- `scenarios`
- `video`
- `mindmap`
- `infographic`
- `quiz`

### Learner playback

The learner course flow already exists in:

- `src/components/employee/course-player.tsx`
- `src/components/employee/course-step-content.tsx`
- `src/lib/course-embed.ts`

Important behavior:

- HTML lessons are rendered inside an iframe.
- The React app does not own the real internal slide logic for those HTML lessons.
- The iframe and player communicate through `postMessage`.
- The HTML lessons can treat `Next` as either:
  - reveal next fragment in the same slide
  - move to the next actual slide

This means narration cannot be keyed only by `slide index`. It should be keyed by a finer unit, called a `beat`.

### Asset storage

Course assets are stored through:

- `src/lib/services/course-asset-service.ts`
- `src/app/api/files/course-assets/[filename]/route.ts`

HTML assets are patched for embed mode, but no script extraction or narration metadata exists yet.

## Product Scope

### Admin features

Add a new admin area for `Narration Studio` or `TTS Studio` where admins can:

1. load an existing course
2. inspect HTML lesson and scenario steps
3. extract slide text into script candidates
4. generate narration script with an LLM
5. edit the generated script manually
6. generate preview audio
7. preview slide + script + audio together
8. toggle:
   - `TTS enabled`
   - `Avatar enabled`
9. publish the narration package for learners

### Learner features

When a course is opened:

- if `TTS enabled` is on and narration assets exist, play narration for the current beat
- if `Avatar enabled` is on, render the avatar shell synchronized to the same audio/script
- if narration is missing, continue the course normally with no regression

## Core Design Decision

### Use beats instead of slides

Because some HTML lessons reveal fragments before advancing slides, narration units should be:

- `stepType`
- `slideIndex`
- `fragmentIndex`

or a combined key like:

- `beatKey = pdf:14:2`

This gives the system enough precision to map:

- slide 14, before reveal
- slide 14, fragment 1 visible
- slide 14, fragment 2 visible
- slide 15

without guessing.

## Proposed Architecture

## 1. Narration data model

Add course-level settings to control the feature:

- `tts_enabled BOOLEAN`
- `avatar_enabled BOOLEAN`
- `narration_status TEXT`
- `narration_version INTEGER`

Recommended statuses:

- `not_started`
- `extracting`
- `script_generated`
- `script_reviewed`
- `audio_generated`
- `ready`
- `failed`

Add a table for extracted beat metadata, for example:

- `course_step_beats`

Suggested fields:

- `id`
- `module_id`
- `step_type`
- `asset_url`
- `slide_index`
- `fragment_index`
- `beat_key`
- `slide_title`
- `raw_text`
- `dom_snapshot_json`
- `created_at`
- `updated_at`

Add a table for narration content, for example:

- `course_narration_segments`

Suggested fields:

- `id`
- `module_id`
- `step_type`
- `asset_url`
- `beat_key`
- `script_text`
- `audio_asset_url`
- `duration_ms`
- `voice_name`
- `llm_model`
- `generation_status`
- `review_status`
- `admin_edited BOOLEAN`
- `created_at`
- `updated_at`

Optional later table:

- `course_avatar_profiles`

for avatar config presets such as style, idle behavior, lip sync config, and layout preferences.

## 2. HTML extraction pipeline

Build a server-side extraction service for HTML lesson assets.

### Input

- module id
- course step type: `pdf` or `scenarios`
- HTML asset URL

### Output

A normalized beat manifest containing:

- slide count
- slide title
- visible text per slide
- fragment groups per slide
- beat ordering

### Extraction rules

For the existing deck format in the repo:

- each `.slide` becomes a slide candidate
- elements with `.fragment` become reveal candidates
- slide title can come from:
  - `data-title`
  - heading text
  - fallback generated title

For each beat:

- include text visible at that beat
- exclude chrome text like counters, prev/next button labels, footer navigation if possible
- preserve semantic bullets/headings for script quality

### Important constraint

Do not try to infer narration live inside the learner player. Extraction should happen once during admin workflow or publish-time processing.

## 3. Script generation pipeline

Add an API flow like:

- `POST /api/courses/[id]/narration/extract`
- `POST /api/courses/[id]/narration/generate-script`
- `POST /api/courses/[id]/narration/generate-audio`
- `GET /api/courses/[id]/narration`
- `PATCH /api/courses/[id]/narration/settings`
- `PATCH /api/courses/[id]/narration/segments/[segmentId]`

### LLM generation prompt shape

For each beat provide:

- course title
- step type
- slide title
- raw extracted text
- prior beat summary optionally
- output length target
- tone: professional, concise, learner-friendly

Expected output:

- 1 narration block per beat
- plain spoken language
- no markdown
- no references to “click next” unless explicitly desired
- avoid reading decorative text verbatim

### Admin review behavior

The generated script must remain editable.

Admins should be able to:

- regenerate one beat
- regenerate one whole step
- edit script manually
- mark script as approved

## 4. Audio generation pipeline

Once script exists, generate audio per beat.

Recommended approach:

- one audio file per beat
- cache generated audio by `module_id + beat_key + narration_version`

Store generated audio through the same course asset storage flow used elsewhere so the learner can stream it reliably.

### Status behavior

If script exists but audio does not:

- admin UI shows `TTS script loaded for the course`
- learner UI may still show transcript support, but autoplay should remain off until audio exists

## 5. Avatar integration

Use `met4citizen/talkinghead` as the avatar rendering engine for the learner-facing experience.

Because the avatar should follow the current narration beat, keep the avatar container in the React app, not embedded inside each uploaded HTML lesson.

### Recommended integration pattern

- create a dedicated `CourseNarrationPanel` component
- place it beside or over the course content area
- feed it:
  - current beat key
  - current script
  - current audio asset
  - course settings

### Why this is better

- one integration point for all HTML courses
- no need to modify every uploaded HTML asset
- easier fallback if avatar fails
- easier admin preview using the same runtime component

### Initial avatar scope

Phase 1 should treat the avatar as a synchronized visual companion to the audio, not as a blocker for progression.

If the avatar library supports lip-sync from audio input, use that path first. If not, start with:

- audio playback
- animated idle/talking states
- later add richer mouth sync

## 6. Extend the iframe message contract

The current message contract reports:

- `slideIndex`
- `slideCount`
- `atEnd`
- `atStart`

Extend it so HTML decks can report beat-level state.

Suggested event payload additions:

- `slideTitle`
- `fragmentIndex`
- `fragmentCount`
- `beatKey`

Suggested rule:

- if a deck supports fragment-aware reporting, use it
- otherwise fallback to `slideIndex + fragmentIndex=0`

### Code areas to update

- `src/lib/course-embed.ts`
- `src/components/employee/course-player.tsx`
- the HTML deck templates or patching mechanism used by uploaded HTML lessons

## 7. Admin UI plan

Create a new panel, for example:

- `src/components/admin/course-narration-panel.tsx`

Entry points:

- add a button in the course library to open Narration Studio
- allow loading existing published or draft courses

### Screen layout

Recommended three-pane layout:

1. left pane
   - course steps
   - slide/beat list
   - status chips

2. center pane
   - embedded HTML preview for selected step
   - current beat marker
   - play/replay controls

3. right pane
   - extracted text
   - generated script
   - editable script textarea
   - generate/regenerate/save actions

### Controls

Course-level controls:

- `Enable TTS`
- `Enable Avatar`
- `Generate script`
- `Generate audio`
- `Publish narration`

Beat-level controls:

- `Preview beat`
- `Regenerate beat`
- `Save edits`

### Status labels

- `Extraction pending`
- `Script generated`
- `Script reviewed`
- `Audio generated`
- `Ready for learners`

## 8. Learner UI plan

Add a reusable learner component, for example:

- `src/components/employee/course-narration-panel.tsx`

Responsibilities:

- read current beat from `CoursePlayer`
- load matching narration segment
- autoplay or replay audio
- host talking avatar when enabled
- expose mute / replay / show transcript controls

### Playback rules

Recommended default behavior:

- autoplay on beat change if learner has not muted narration
- stop current audio when learner advances
- do not auto-rewind the course if audio ends
- replay button always available
- learner can mute narration independently of avatar visibility

### Failure behavior

If narration lookup fails:

- log non-blocking error
- keep course progression working
- hide avatar if it depends on missing narration

## 9. Feature toggles and publish logic

Course settings should support these states:

- neither TTS nor avatar enabled
- TTS enabled, avatar disabled
- TTS enabled, avatar enabled

Disallow:

- avatar enabled with no script/audio ready

Recommended publish rule:

- `avatar_enabled = true` only if `tts_enabled = true` and narration status is `ready`

### Admin messaging

Examples:

- `TTS script loaded for this course`
- `Audio previews generated`
- `Avatar ready for learner playback`

## 10. Implementation phases

### Phase 1: Data + extraction

- add DB columns and narration tables
- add extraction service for HTML lessons and scenarios
- persist beat manifests

Deliverable:

- system can parse existing HTML lesson assets into beats

### Phase 2: Script generation + admin review

- add admin Narration Studio UI
- generate script with LLM
- allow admin edits and approvals

Deliverable:

- admins can review and save narration scripts per beat

### Phase 3: Audio generation

- generate per-beat audio
- store audio assets
- preview audio in admin UI

Deliverable:

- `TTS script loaded` and `audio preview` flows work end-to-end

### Phase 4: Learner TTS playback

- add learner-side narration panel
- map iframe slide state to beat state
- autoplay narration by beat

Deliverable:

- learners hear narration synchronized with course progression

### Phase 5: Avatar integration

- integrate talkinghead into learner narration panel
- sync avatar animation with current audio/script
- add course-level avatar toggle

Deliverable:

- avatar experience runs beside the course content without affecting core navigation

### Phase 6: Hardening

- improve extraction for more HTML deck patterns
- support versioning/regeneration
- add monitoring and retry flows
- optimize caching and preload behavior

## 11. Key technical risks

### HTML bundle complexity

Current upload flow assumes mostly single-file HTML assets. Some PPT exports may depend on external CSS, JS, fonts, and images.

Mitigation:

- require self-contained HTML initially
- later add zip bundle ingestion if needed

### Fragment-aware narration mismatch

If a lesson’s internal JS changes slide behavior but does not publish enough state, narration may drift.

Mitigation:

- extend embed event payload
- maintain beat manifests per HTML version

### Long generation times

Script and audio generation may be slow for large courses.

Mitigation:

- process asynchronously
- show job status in admin UI
- allow per-step regeneration

### Avatar runtime cost

Avatar rendering may be GPU/CPU heavy on weaker machines.

Mitigation:

- lazy-load avatar
- let learner mute or hide it
- keep audio-only mode fully supported

## 12. Recommended first milestone

The best first milestone is:

1. add course-level TTS/avatar settings
2. extract beats from existing HTML lessons
3. generate editable scripts in an admin Narration Studio
4. preview selected beat text and generated audio

Do not start with full avatar playback first.

That sequence de-risks the hardest part first:

- reliable script extraction and beat mapping

Once that is stable, TTS generation and talking avatar become much easier to integrate cleanly.
