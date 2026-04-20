const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");
const textInput = document.getElementById("textInput");
const charCount = document.getElementById("charCount");

const voiceSelect = document.getElementById("voiceSelect");
const rate = document.getElementById("rate");
const pitch = document.getElementById("pitch");
const volume = document.getElementById("volume");
const rateValue = document.getElementById("rateValue");
const pitchValue = document.getElementById("pitchValue");
const volumeValue = document.getElementById("volumeValue");

const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const stopBtn = document.getElementById("stopBtn");
const startLineInput = document.getElementById("startLine");
const endLineInput = document.getElementById("endLine");
const repeatCountInput = document.getElementById("repeatCount");
const lineDelayInput = document.getElementById("lineDelay");
const lineRangeInfo = document.getElementById("lineRangeInfo");
const statusEl = document.getElementById("status");
const activeLineEl = document.getElementById("activeLine");
const lineDisplay = document.getElementById("lineDisplay");
const textEditor = document.getElementById("textEditor");
const editBtn = document.getElementById("editBtn");
const doneEditBtn = document.getElementById("doneEditBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const useSampleBtn = document.getElementById("useSampleBtn");

const synth = window.speechSynthesis;
let selectedVoice = null;
let availableEnglishVoices = [];
let queue = [];
let currentLineItem = null;
let activeLineNumber = null;
let isPlaying = false;
let isPaused = false;
let delayTimer = null;

function getTotalSourceLines(rawText) {
  if (rawText.length === 0) {
    return 1;
  }
  return rawText.split(/\r?\n/).length;
}

function normalizeLineRange(totalLines, resetToFullRange = false) {
  const currentStart = Number(startLineInput.value) || 1;
  const currentEnd = Number(endLineInput.value) || totalLines;

  let start = resetToFullRange ? 1 : currentStart;
  let end = resetToFullRange ? totalLines : currentEnd;

  start = Math.max(1, Math.min(start, totalLines));
  end = Math.max(1, Math.min(end, totalLines));

  if (start > end) {
    end = start;
  }

  startLineInput.max = String(totalLines);
  endLineInput.max = String(totalLines);
  startLineInput.value = String(start);
  endLineInput.value = String(end);
  lineRangeInfo.textContent = `Playable range: 1 to ${totalLines}`;
}

function normalizeRepeatCount() {
  const raw = Number(repeatCountInput.value) || 1;
  const clamped = Math.max(1, Math.min(Math.floor(raw), 100));
  repeatCountInput.value = String(clamped);
  return clamped;
}

function normalizeLineDelay() {
  const raw = Number(lineDelayInput.value);
  const clamped = Math.max(0, Math.min(isNaN(raw) ? 5 : raw, 120));
  const rounded = Math.round(clamped * 10) / 10;
  lineDelayInput.value = String(rounded);
  return rounded;
}

function renderLineDisplay(highlightLineNumber = null) {
  const rawLines = textInput.value.split(/\r?\n/);
  if (!textInput.value.trim()) {
    lineDisplay.innerHTML = '<span class="line-display-empty">No text loaded yet.</span>';
    return;
  }

  const fragment = document.createDocumentFragment();
  rawLines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const isComment = trimmed.startsWith("#");

    const row = document.createElement("div");
    row.className = "line-row";
    row.dataset.line = String(lineNumber);
    if (isComment) {
      row.classList.add("comment");
    }
    if (lineNumber === highlightLineNumber) {
      row.classList.add("active");
    }

    const numEl = document.createElement("span");
    numEl.className = "line-num";
    numEl.textContent = String(lineNumber);

    const textEl = document.createElement("span");
    textEl.className = "line-text";
    textEl.textContent = line || "\u00a0";

    row.appendChild(numEl);
    row.appendChild(textEl);
    fragment.appendChild(row);
  });

  lineDisplay.innerHTML = "";
  lineDisplay.appendChild(fragment);
}

function scrollToActiveLine(lineNumber) {
  const row = lineDisplay.querySelector(`[data-line="${lineNumber}"]`);
  if (row) {
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function setStatus(message) {
  statusEl.textContent = `Status: ${message}`;
}

function updateCharCount() {
  const total = textInput.value.length;
  const maxLines = getTotalSourceLines(textInput.value);
  const lines = parseReadableLines(textInput.value, 1, maxLines, 1).length;
  charCount.textContent = `${total.toLocaleString()} characters | ${lines.toLocaleString()} playable lines`;
  renderLineDisplay(activeLineNumber);
}

function setActiveLine(lineNumber) {
  activeLineNumber = lineNumber;
  activeLineEl.textContent = lineNumber === null ? "Active line: None" : `Active line: ${lineNumber}`;
  renderLineDisplay(lineNumber);
  if (lineNumber !== null) {
    scrollToActiveLine(lineNumber);
  }
}

function isEnglishVoice(voice) {
  return /^en(-|$)/i.test(voice.lang);
}

function isPreferredEricVoice(voice) {
  return voice.name === "Microsoft Eric Online (Natural) - English (United States)" && /^en-us$/i.test(voice.lang);
}

function fillVoiceOptions() {
  const voices = synth.getVoices();
  if (!voices.length) {
    return;
  }

  availableEnglishVoices = voices.filter(isEnglishVoice);

  voiceSelect.innerHTML = "";
  if (!availableEnglishVoices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No English voices found";
    voiceSelect.appendChild(option);
    voiceSelect.disabled = true;
    selectedVoice = null;
    setStatus("No English voices found on this device/browser");
    return;
  }

  voiceSelect.disabled = false;
  availableEnglishVoices.forEach((voice, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${voice.name} (${voice.lang})${voice.default ? " [default]" : ""}`;
    voiceSelect.appendChild(option);
  });

  const preferredIndex = availableEnglishVoices.findIndex(isPreferredEricVoice);
  const defaultIndex = availableEnglishVoices.findIndex((v) => v.default);
  const chosenIndex = preferredIndex >= 0 ? preferredIndex : (defaultIndex >= 0 ? defaultIndex : 0);
  voiceSelect.value = String(chosenIndex);
  selectedVoice = availableEnglishVoices[chosenIndex];
}

function parseReadableLines(rawText, startLine, endLine, repeatCount = 1) {
  const sourceLines = rawText.split(/\r?\n/);
  const spokenLines = [];

  sourceLines.forEach((line, index) => {
    const trimmed = line.trim();
    const lineNumber = index + 1;

    if (lineNumber < startLine || lineNumber > endLine) {
      return;
    }

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const segments = trimmed.split("/").map((s) => s.trim()).filter((s) => s.length > 0);

    for (let repeatIndex = 1; repeatIndex <= repeatCount; repeatIndex += 1) {
      segments.forEach((segment, segIdx) => {
        spokenLines.push({
          type: "speech",
          lineNumber,
          text: segment,
          repeatIndex,
          repeatCount,
        });
        // Insert a short silent pause between slash-separated segments (not after the last one).
        if (segIdx < segments.length - 1) {
          spokenLines.push({
            type: "slash-pause",
            lineNumber,
            durationMs: 500,
          });
        }
      });
    }
  });

  return spokenLines;
}

function clearDelayTimer() {
  if (delayTimer !== null) {
    clearTimeout(delayTimer);
    delayTimer = null;
  }
}

function stopPlayback() {
  clearDelayTimer();
  synth.cancel();
  queue = [];
  currentLineItem = null;
  setActiveLine(null);
  isPlaying = false;
  isPaused = false;
  setStatus("Stopped");
}

function speakNextLine() {
  if (isPaused) {
    if (activeLineNumber === null) {
      setStatus("Paused");
    } else {
      setStatus(`Paused on line ${activeLineNumber}`);
    }
    return;
  }

  if (!queue.length) {
    currentLineItem = null;
    isPlaying = false;
    setActiveLine(null);
    setStatus("Finished");
    return;
  }

  const nextLine = queue.shift();
  currentLineItem = nextLine;

  // Handle silent slash-pause segments.
  if (nextLine.type === "slash-pause") {
    delayTimer = setTimeout(() => {
      delayTimer = null;
      currentLineItem = null;
      if (!isPaused && isPlaying) {
        speakNextLine();
      }
    }, nextLine.durationMs);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(nextLine.text);

  const idx = Number(voiceSelect.value);
  selectedVoice = availableEnglishVoices[idx] || selectedVoice;

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.rate = Number(rate.value);
  utterance.pitch = Number(pitch.value);
  utterance.volume = Number(volume.value);

  utterance.onstart = () => {
    setActiveLine(nextLine.lineNumber);
    if (nextLine.repeatCount > 1) {
      setStatus(`Playing line ${nextLine.lineNumber} (repeat ${nextLine.repeatIndex}/${nextLine.repeatCount})`);
    } else {
      setStatus(`Playing line ${nextLine.lineNumber}`);
    }
  };

  utterance.onend = () => {
    if (isPaused) {
      // Some voices/browsers can end the utterance while paused. Keep currentLineItem for resume fallback.
      return;
    }
    currentLineItem = null;
    // Apply between-line delay only when moving to the next source line (not between slash segments).
    const isLastSegmentOfLine = queue.length === 0 || queue[0].lineNumber !== nextLine.lineNumber;
    const delaySecs = normalizeLineDelay();
    if (delaySecs > 0 && queue.length && isLastSegmentOfLine) {
      setStatus(`Waiting ${delaySecs}s before next line...`);
      delayTimer = setTimeout(() => {
        delayTimer = null;
        if (!isPaused && isPlaying) {
          speakNextLine();
        }
      }, delaySecs * 1000);
    } else {
      speakNextLine();
    }
  };

  utterance.onerror = (event) => {
    currentLineItem = null;
    isPlaying = false;
    setStatus(`Error on line ${nextLine.lineNumber}: ${event.error || "speech synthesis failed"}`);
  };

  synth.speak(utterance);
}

function startPlayback() {
  const sourceText = textInput.value;
  if (!sourceText.trim()) {
    setStatus("Please load or enter text first");
    return;
  }

  const totalLines = getTotalSourceLines(sourceText);
  normalizeLineRange(totalLines, false);
  const repeatCount = normalizeRepeatCount();
  const start = Number(startLineInput.value);
  const end = Number(endLineInput.value);

  if (isPlaying) {
    stopPlayback();
  }

  queue = parseReadableLines(sourceText, start, end, repeatCount);
  if (!queue.length) {
    setStatus("No readable lines found in selected range. Lines with # are ignored.");
    return;
  }

  isPlaying = true;
  isPaused = false;
  setActiveLine(null);
  speakNextLine();
}

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  if (!file.name.toLowerCase().endsWith(".txt")) {
    setStatus("Please choose a .txt file");
    fileInput.value = "";
    return;
  }

  const text = await file.text();
  textInput.value = text;
  fileName.textContent = `Selected: ${file.name}`;
  normalizeLineRange(getTotalSourceLines(text), true);
  updateCharCount();
  setStatus("Text loaded");
});

textInput.addEventListener("input", () => {
  normalizeLineRange(getTotalSourceLines(textInput.value), false);
  updateCharCount();
});

startLineInput.addEventListener("change", () => {
  normalizeLineRange(getTotalSourceLines(textInput.value), false);
});

endLineInput.addEventListener("change", () => {
  normalizeLineRange(getTotalSourceLines(textInput.value), false);
});

function enterEditMode() {
  if (isPlaying) {
    stopPlayback();
  }
  textEditor.value = textInput.value;
  lineDisplay.style.display = "none";
  textEditor.style.display = "block";
  editBtn.style.display = "none";
  doneEditBtn.style.display = "inline-block";
  cancelEditBtn.style.display = "inline-block";
  textEditor.focus();
}

function exitEditMode(save) {
  if (save) {
    textInput.value = textEditor.value;
    const total = getTotalSourceLines(textInput.value);
    normalizeLineRange(total, false);
    updateCharCount();
    setStatus("Text updated");
  }
  textEditor.style.display = "none";
  lineDisplay.style.display = "block";
  editBtn.style.display = "inline-block";
  doneEditBtn.style.display = "none";
  cancelEditBtn.style.display = "none";
}

editBtn.addEventListener("click", enterEditMode);
doneEditBtn.addEventListener("click", () => exitEditMode(true));
cancelEditBtn.addEventListener("click", () => exitEditMode(false));

lineDelayInput.addEventListener("change", () => {
  normalizeLineDelay();
});

voiceSelect.addEventListener("change", () => {
  selectedVoice = availableEnglishVoices[Number(voiceSelect.value)] || null;
});

rate.addEventListener("input", () => {
  rateValue.textContent = Number(rate.value).toFixed(1);
});

pitch.addEventListener("input", () => {
  pitchValue.textContent = Number(pitch.value).toFixed(1);
});

volume.addEventListener("input", () => {
  volumeValue.textContent = Number(volume.value).toFixed(1);
});

playBtn.addEventListener("click", startPlayback);

pauseBtn.addEventListener("click", () => {
  if (!isPlaying) {
    return;
  }
  isPaused = true;
  clearDelayTimer();

  if (synth.speaking && !synth.paused && currentLineItem) {
    queue.unshift(currentLineItem);
    currentLineItem = null;
  }

  if (synth.speaking && !synth.paused) {
    // Cancel + queued replay is more reliable than native pause/resume for some online voices.
    synth.cancel();
  }

  if (activeLineNumber === null) {
    setStatus("Paused");
  } else {
    setStatus(`Paused on line ${activeLineNumber}`);
  }
});

resumeBtn.addEventListener("click", () => {
  if (!isPlaying) {
    return;
  }

  isPaused = false;

  if (synth.paused) {
    synth.resume();
  }

  if (!synth.speaking) {
    speakNextLine();
  }

  if (activeLineNumber === null) {
    setStatus("Resumed");
  } else {
    setStatus(`Resumed on line ${activeLineNumber}`);
  }
});

stopBtn.addEventListener("click", stopPlayback);

useSampleBtn.addEventListener("click", () => {
  textInput.value = "# Sample dictionary format\nWelcome to your local text to speech reader.\nEach spoken line is read in order.\n# This line is ignored because it starts with a hash symbol.\nOnly non-empty lines without hash at the start are spoken.";
  fileName.textContent = "Using sample text";
  normalizeLineRange(getTotalSourceLines(textInput.value), true);
  updateCharCount();
  setStatus("Sample text loaded");
});

async function loadDefaultDictionary() {
  const candidates = [
    "dictionary.txt",
    "./dictionary.txt",
    new URL("dictionary.txt", window.location.href).href,
  ];

  for (const source of candidates) {
    try {
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }

      const text = await response.text();
      textInput.value = text;
      fileName.textContent = "Loaded default: dictionary.txt";
      normalizeLineRange(getTotalSourceLines(text), true);
      updateCharCount();
      setStatus("Default dictionary loaded");
      return;
    } catch (error) {
      // Continue trying candidate paths.
    }
  }

  if (window.location.protocol === "file:") {
    setStatus("Auto-load blocked by browser file security. Click Choose Text File and pick dictionary.txt once.");
    return;
  }

  setStatus("Could not auto-load dictionary.txt. Choose a text file manually.");
}

if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
  setStatus("This browser does not support text to speech");
  playBtn.disabled = true;
  pauseBtn.disabled = true;
  resumeBtn.disabled = true;
  stopBtn.disabled = true;
} else {
  fillVoiceOptions();
  if (typeof synth.onvoiceschanged !== "undefined") {
    synth.onvoiceschanged = fillVoiceOptions;
  }
}

updateCharCount();
setStatus("Idle");
setActiveLine(null);
normalizeLineRange(getTotalSourceLines(textInput.value), true);
normalizeRepeatCount();
normalizeLineDelay();
renderLineDisplay(null);
window.addEventListener("load", loadDefaultDictionary);

// Register service worker for PWA / offline support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // SW registration failed silently — app still works normally.
    });
  });
}
