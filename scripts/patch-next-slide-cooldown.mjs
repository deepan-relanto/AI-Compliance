/**
 * Patch interactive HTML decks with:
 * - slideComplete in embed postMessage
 * - "Next slide" label + 0.8s cooldown when a slide finishes revealing
 *
 * Usage: node scripts/patch-next-slide-cooldown.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "content-kit", "interactive-html");

const LESSON_FILES = [
  "relanto_ai_fundamentals_interactive.html",
  "relanto_ai_security_privacy_compliance_interactive.html",
  "relanto_responsible_ai_ethics_interactive.html",
  "relanto_prompt_engineering_essentials_interactive.html",
];

const SCENARIO_FILES = [
  "relanto_ai_scenarios_interactive.html",
  "relanto_ai_security_scenarios_interactive.html",
  "relanto_responsible_ai_scenarios_interactive.html",
  "relanto_prompt_engineering_scenarios_interactive.html",
];

const LESSON_CSS = `
    .nav button#nextBtn.wide {
      width: auto;
      min-width: 34px;
      padding: 0 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      line-height: 1;
      white-space: nowrap;
    }
    .nav button#nextBtn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
`;

const LESSON_HELPERS = `
    const NEXT_SLIDE_COOLDOWN_MS = 800;
    let nextLockedUntil = 0;
    let nextCooldownTimer = null;
    const nextBtnEl = document.getElementById("nextBtn");
    const nextBtnDefaultHtml = nextBtnEl ? nextBtnEl.innerHTML : "";

    function isSlideComplete() {
      return !hasHiddenFragments();
    }

    function updateNextButton() {
      if (!nextBtnEl) return;
      const complete = isSlideComplete();
      const remaining = Math.max(0, nextLockedUntil - Date.now());
      if (!complete) {
        nextBtnEl.classList.remove("wide");
        nextBtnEl.disabled = false;
        nextBtnEl.innerHTML = nextBtnDefaultHtml;
        nextBtnEl.title = "Next / reveal";
        nextBtnEl.setAttribute("aria-label", "Next");
        return;
      }
      nextBtnEl.classList.add("wide");
      if (remaining > 0) {
        nextBtnEl.disabled = true;
        nextBtnEl.textContent = "Next slide " + (remaining / 1000).toFixed(1) + "s";
        nextBtnEl.title = "Please wait before advancing";
        nextBtnEl.setAttribute("aria-label", "Next slide locked");
      } else {
        nextBtnEl.disabled = false;
        nextBtnEl.textContent = "Next slide";
        nextBtnEl.title = "Next slide";
        nextBtnEl.setAttribute("aria-label", "Next slide");
      }
    }

    function startNextSlideCooldown() {
      nextLockedUntil = Date.now() + NEXT_SLIDE_COOLDOWN_MS;
      if (nextCooldownTimer) clearInterval(nextCooldownTimer);
      updateNextButton();
      nextCooldownTimer = setInterval(() => {
        if (Date.now() >= nextLockedUntil) {
          clearInterval(nextCooldownTimer);
          nextCooldownTimer = null;
          nextLockedUntil = 0;
        }
        updateNextButton();
      }, 50);
    }
`;

function patchLesson(filePath) {
  let html = fs.readFileSync(filePath, "utf8");
  if (html.includes("NEXT_SLIDE_COOLDOWN_MS")) {
    console.log("skip (already patched):", path.basename(filePath));
    return;
  }

  if (!html.includes(".nav button:hover { background: rgba(255,255,255,.24); }")) {
    throw new Error("CSS anchor missing: " + filePath);
  }
  html = html.replace(
    ".nav button:hover { background: rgba(255,255,255,.24); }",
    `.nav button:hover { background: rgba(255,255,255,.24); }${LESSON_CSS}`,
  );

  if (!html.includes("let index = 0;")) {
    throw new Error("index anchor missing: " + filePath);
  }
  html = html.replace("let index = 0;", `let index = 0;${LESSON_HELPERS}`);

  html = html.replace(
    /function publishEmbedState\(\) \{\s*if \(!embedMode\) return;\s*const atEnd = index >= slides\.length - 1 && !hasHiddenFragments\(\);\s*const atStart = index <= 0 && !slides\[index\]\?\.querySelector\("\.fragment\.visible"\);\s*window\.parent\.postMessage\(\s*\{\s*type: EMBED_EVENT,\s*kind: "lesson",\s*slideIndex: index,\s*slideCount: slides\.length,\s*atEnd,\s*atStart,\s*\},\s*"\*",\s*\);\s*\}/,
    `function publishEmbedState() {
      if (!embedMode) return;
      const atEnd = index >= slides.length - 1 && !hasHiddenFragments();
      const atStart = index <= 0 && !slides[index]?.querySelector(".fragment.visible");
      window.parent.postMessage(
        {
          type: EMBED_EVENT,
          kind: "lesson",
          slideIndex: index,
          slideCount: slides.length,
          atEnd,
          atStart,
          slideComplete: isSlideComplete(),
        },
        "*",
      );
    }`,
  );

  html = html.replace(
    /function showSlide\(next\) \{[\s\S]*?if \(embedMode\) requestAnimationFrame\(fitEmbedDeck\);\s*\}/,
    `function showSlide(next) {
      index = Math.max(0, Math.min(slides.length - 1, next));
      slides.forEach((slide, i) => {
        slide.classList.toggle("active", i === index);
        if (i !== index) resetFragments(slide);
      });
      counter.textContent = \`\${index + 1} / \${slides.length}\`;
      progressBar.style.width = \`\${((index + 1) / slides.length) * 100}%\`;
      if (revealAllMode) {
        slides[index].querySelectorAll(".fragment").forEach(el => el.classList.add("visible"));
      } else {
        revealNext(true);
      }
      if (isSlideComplete()) startNextSlideCooldown();
      else updateNextButton();
      publishEmbedState();
      if (embedMode) requestAnimationFrame(fitEmbedDeck);
    }`,
  );

  html = html.replace(
    /function revealNext\(firstOnly = false\) \{[\s\S]*?publishEmbedState\(\);\s*return true;\s*\}/,
    `function revealNext(firstOnly = false) {
      const active = slides[index];
      const hidden = Array.from(active.querySelectorAll(".fragment:not(.visible)"));
      if (!hidden.length) return false;
      hidden[0].classList.add("visible");
      if (!firstOnly && hidden.length > 1 && hidden[0].dataset.group) {
        hidden.filter(el => el.dataset.group === hidden[0].dataset.group).forEach(el => el.classList.add("visible"));
      }
      if (isSlideComplete()) startNextSlideCooldown();
      else updateNextButton();
      publishEmbedState();
      return true;
    }`,
  );

  html = html.replace(
    /function next\(\) \{\s*if \(!revealNext\(\)\) showSlide\(index \+ 1\);\s*else publishEmbedState\(\);\s*\}/,
    `function next() {
      if (Date.now() < nextLockedUntil) return;
      if (!revealNext()) showSlide(index + 1);
      else publishEmbedState();
    }`,
  );

  html = html.replace(
    /if \(event\.key === "ArrowRight" \|\| event\.key === " " \|\| event\.key === "PageDown"\) \{\s*event\.preventDefault\(\);\s*next\(\);\s*\}/,
    `if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        if (Date.now() < nextLockedUntil) return;
        next();
      }`,
  );

  if (!html.includes("slideComplete: isSlideComplete()")) {
    throw new Error("Failed to patch publishEmbedState: " + filePath);
  }

  fs.writeFileSync(filePath, html);
  console.log("patched lesson:", path.basename(filePath));
}

function patchScenario(filePath) {
  let html = fs.readFileSync(filePath, "utf8");
  if (html.includes("NEXT_SLIDE_COOLDOWN_MS")) {
    console.log("skip (already patched):", path.basename(filePath));
    return;
  }

  // Scenarios use text Next button — add disabled style if missing
  if (!html.includes("#nextBtn:disabled") && html.includes(".nav button")) {
    html = html.replace(
      /(\.nav button[^{]*\{[^}]*\})/,
      `$1
    .nav button#nextBtn:disabled { opacity: 0.55; cursor: not-allowed; }`,
    );
  }

  const helpers = `
    const NEXT_SLIDE_COOLDOWN_MS = 800;
    let nextLockedUntil = 0;
    let nextCooldownTimer = null;
    const nextBtnEl = document.getElementById("nextBtn");

    function canAdvanceScenarioSlide() {
      return !(typeof onPickerSlide === "function" && onPickerSlide() && !selectedId);
    }

    function updateNextButton() {
      if (!nextBtnEl) return;
      const remaining = Math.max(0, nextLockedUntil - Date.now());
      if (!canAdvanceScenarioSlide()) {
        nextBtnEl.disabled = false;
        nextBtnEl.textContent = "Next";
        return;
      }
      if (remaining > 0) {
        nextBtnEl.disabled = true;
        nextBtnEl.textContent = "Next slide " + (remaining / 1000).toFixed(1) + "s";
      } else {
        nextBtnEl.disabled = false;
        nextBtnEl.textContent = "Next slide";
      }
    }

    function startNextSlideCooldown() {
      nextLockedUntil = Date.now() + NEXT_SLIDE_COOLDOWN_MS;
      if (nextCooldownTimer) clearInterval(nextCooldownTimer);
      updateNextButton();
      nextCooldownTimer = setInterval(() => {
        if (Date.now() >= nextLockedUntil) {
          clearInterval(nextCooldownTimer);
          nextCooldownTimer = null;
          nextLockedUntil = 0;
        }
        updateNextButton();
      }, 50);
    }
`;

  if (!html.includes("function onPickerSlide()")) {
    throw new Error("onPickerSlide missing: " + filePath);
  }
  html = html.replace(
    "function onPickerSlide() {",
    `${helpers}
    function onPickerSlide() {`,
  );

  html = html.replace(
    /window\.parent\.postMessage\(\{\s*type: EMBED_EVENT,\s*kind: "scenarios",\s*slideIndex: index,\s*slideCount: slides\.length,\s*atEnd,\s*atStart,\s*\}, "\*"\);/,
    `window.parent.postMessage({
        type: EMBED_EVENT,
        kind: "scenarios",
        slideIndex: index,
        slideCount: slides.length,
        atEnd,
        atStart,
        slideComplete: canAdvanceScenarioSlide(),
      }, "*");`,
  );

  html = html.replace(
    /function showSlide\(next\) \{\s*index = Math\.max\(0, Math\.min\(slides\.length - 1, next\)\);\s*slides\.forEach\(\(slide, i\) => slide\.classList\.toggle\("active", i === index\)\);\s*if \(counter\) counter\.textContent = `\$\{index \+ 1\} \/ \$\{slides\.length\}`;\s*progressBar\.style\.width = `\$\{\(\(index \+ 1\) \/ slides\.length\) \* 100\}%`;\s*publishEmbedState\(\);\s*if \(embedMode\) requestAnimationFrame\(fitEmbedDeck\);\s*\}/,
    `function showSlide(next) {
      index = Math.max(0, Math.min(slides.length - 1, next));
      slides.forEach((slide, i) => slide.classList.toggle("active", i === index));
      if (counter) counter.textContent = \`\${index + 1} / \${slides.length}\`;
      progressBar.style.width = \`\${((index + 1) / slides.length) * 100}%\`;
      if (canAdvanceScenarioSlide()) startNextSlideCooldown();
      else updateNextButton();
      publishEmbedState();
      if (embedMode) requestAnimationFrame(fitEmbedDeck);
    }`,
  );

  html = html.replace(
    /function next\(\) \{\s*if \(onPickerSlide\(\) && !selectedId\) \{[\s\S]*?return;\s*\}\s*showSlide\(index \+ 1\);\s*\}/,
    `function next() {
      if (Date.now() < nextLockedUntil) return;
      if (onPickerSlide() && !selectedId) {
        pickerNote.classList.remove("pulse");
        void pickerNote.offsetWidth;
        pickerNote.classList.add("pulse");
        pickerNote.textContent = "Select a department above to continue.";
        updateNextButton();
        publishEmbedState();
        return;
      }
      showSlide(index + 1);
    }`,
  );

  if (!html.includes("slideComplete: canAdvanceScenarioSlide()")) {
    throw new Error("Failed to patch scenario publishEmbedState: " + filePath);
  }

  fs.writeFileSync(filePath, html);
  console.log("patched scenario:", path.basename(filePath));
}

for (const name of LESSON_FILES) {
  patchLesson(path.join(dir, name));
}
for (const name of SCENARIO_FILES) {
  patchScenario(path.join(dir, name));
}

console.log("Done.");
