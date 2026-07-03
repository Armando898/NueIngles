import { createProvider, getWords, cleanWord } from "./providers.js";
import { RecorderController, decodeAudioBlob, speakWord, loadVoices, chooseVoice } from "./audio.js";
import { drawEmptyWaveform, drawWaveformForWord, drawReferenceWaveform, drawPlaybackCursor, drawTimeline } from "./waveform.js";

const $ = (selector) => document.querySelector(selector);

const elements = {
  sourceText: $("#sourceText"),
  translateBtn: $("#translateBtn"),
  loadExampleBtn: $("#loadExampleBtn"),
  translatedText: $("#translatedText"),
  translationStatus: $("#translationStatus"),
  wordGrid: $("#wordGrid"),
  karaokeLine: $("#karaokeLine"),
  karaokePron: $("#karaokePron"),
  startBtn: $("#startBtn"),
  stopBtn: $("#stopBtn"),
  resetBtn: $("#resetBtn"),
  recordingStatus: $("#recordingStatus"),
  selectedWordPanel: $("#selectedWordPanel"),
  waveformCanvas: $("#waveformCanvas"),
  refWaveformCanvas: $("#refWaveformCanvas"),
  expandWaveformBtn: $("#expandWaveformBtn"),
  refGroup: $("#refGroup"),
  userGroup: $("#userGroup"),
  playExpectedBtn: $("#playExpectedBtn"),
  playRecordingBtn: $("#playRecordingBtn"),
  retryWordBtn: $("#retryWordBtn"),
  results: $("#results"),
  practiceList: $("#practiceList"),
  providerSelect: $("#providerSelect"),
  endpointField: $("#endpointField"),
  apiKeyField: $("#apiKeyField"),
  customEndpoint: $("#customEndpoint"),
  apiToken: $("#apiToken"),
  voiceProfile: $("#voiceProfile"),
  voiceProfileGroup: $("#voiceProfileGroup"),
  similarVoice: $("#similarVoice"),
  voiceSelect: $("#voiceSelect"),
  toggleConfig: $("#toggleConfig"),
  configPanel: $("#configPanel"),
  speedControls: $("#speedControls"),
  rewindBtn: $("#rewindBtn"),
  playBtn: $("#playBtn"),
  forwardBtn: $("#forwardBtn"),
  timeDisplay: $("#timeDisplay")
};

const state = {
  provider: null,
  translation: "",
  words: [],
  pronunciations: [],
  evaluations: [],
  selectedIndex: null,
  transcript: "",
  recorder: null,
  audioBlob: null,
  audioBuffer: null,
  audioUrl: null,
  voices: [],
  currentKaraokeIndex: 0,
  karaokeTimer: null,
  speed: "normal",
  singleWordBlob: null,
  singleWordBuffer: null,
  singleWordUrl: null,
  playbackAudio: null,
  playbackRaf: null,
  waveformCache: null
};

init();

async function init() {
  restoreSettings();
  state.provider = createProvider(getProviderConfig());
  drawEmptyWaveform(elements.waveformCanvas);
  bindEvents();
  state.voices = await loadVoices();
  renderVoiceOptions();
  refreshProvider();
}

function restoreSettings() {
  const savedProvider = localStorage.getItem("provider");
  if (savedProvider) elements.providerSelect.value = savedProvider;
  const savedToken = localStorage.getItem("apiToken");
  if (savedToken) elements.apiToken.value = savedToken;
  const savedEndpoint = localStorage.getItem("customEndpoint");
  if (savedEndpoint) elements.customEndpoint.value = savedEndpoint;
}

function saveSettings() {
  localStorage.setItem("provider", elements.providerSelect.value);
  localStorage.setItem("apiToken", elements.apiToken.value);
  localStorage.setItem("customEndpoint", elements.customEndpoint.value);
}

function bindEvents() {
  elements.translateBtn.addEventListener("click", translateText);
  elements.loadExampleBtn.addEventListener("click", loadExample);
  elements.startBtn.addEventListener("click", startReading);
  elements.stopBtn.addEventListener("click", stopReading);
  elements.resetBtn.addEventListener("click", resetEvaluation);
  elements.playExpectedBtn.addEventListener("click", playExpectedPronunciation);
  elements.playRecordingBtn.addEventListener("click", () => {
    if (state.singleWordUrl) {
      new Audio(state.singleWordUrl).play();
    } else {
      state.recorder?.playRecording();
    }
  });
  elements.retryWordBtn.addEventListener("click", retrySelectedWord);
  elements.providerSelect.addEventListener("change", () => { saveSettings(); refreshProvider(); });
  elements.customEndpoint.addEventListener("change", () => { saveSettings(); refreshProvider(); });
  elements.apiToken.addEventListener("change", () => { saveSettings(); refreshProvider(); });
  elements.apiToken.addEventListener("input", saveSettings);
  elements.voiceProfileGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".voice-btn");
    if (!btn) return;
    elements.voiceProfileGroup.querySelectorAll(".voice-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    elements.voiceProfile.value = btn.dataset.profile;
    renderVoiceOptions(true);
  });
  elements.toggleConfig.addEventListener("click", toggleConfigPanel);
  elements.expandWaveformBtn.addEventListener("click", toggleWaveformExpand);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  window.addEventListener("resize", onResize);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elements.userGroup.classList.contains("fullscreen")) toggleWaveformExpand();
  });
  elements.speedControls.addEventListener("click", (e) => {
    const btn = e.target.closest(".speed-btn");
    if (!btn) return;
    elements.speedControls.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.speed = btn.dataset.speed;
    if (state.karaokeTimer) {
      stopKaraokeTimer();
      startKaraokeTimer();
    }
  });

  elements.rewindBtn.addEventListener("click", () => skipPlayback(-5));
  elements.forwardBtn.addEventListener("click", () => skipPlayback(5));
  elements.playBtn.addEventListener("click", togglePlayback);
  elements.waveformCanvas.addEventListener("click", seekFromClick);
}

function getProviderConfig() {
  return {
    provider: elements.providerSelect.value,
    endpoint: elements.customEndpoint.value.trim(),
    token: elements.apiToken.value.trim(),
    voiceProfile: elements.voiceProfile.value,
    similarVoice: elements.similarVoice.checked
  };
}

const CLOUD_PROVIDERS = ["gemini", "groq", "deepseek", "moonshot", "openai"];

function refreshProvider() {
  const provider = elements.providerSelect.value;
  elements.endpointField.style.display = provider === "generic" ? "block" : "none";
  elements.apiKeyField.style.display = provider === "generic" || CLOUD_PROVIDERS.includes(provider) ? "block" : "none";
  if (CLOUD_PROVIDERS.includes(provider)) {
    elements.apiToken.placeholder = "Tu API key de " + provider.charAt(0).toUpperCase() + provider.slice(1);
  } else {
    elements.apiToken.placeholder = "Solo para API personalizada";
  }
  state.provider = createProvider(getProviderConfig());
}

function toggleConfigPanel() {
  const hidden = elements.configPanel.style.display === "none";
  elements.configPanel.style.display = hidden ? "grid" : "none";
  elements.toggleConfig.textContent = hidden ? "Ocultar" : "Mostrar";
}

function loadExample() {
  elements.sourceText.value = "Quiero aprender inglés porque necesito hablar con más confianza en mi trabajo y cuando viajo.";
}

async function translateText() {
  const text = elements.sourceText.value.trim();
  if (!text) {
    setStatus("Escribe primero un texto en español.", true);
    return;
  }

  refreshProvider();
  setStatus("Traduciendo con el proveedor configurado...");
  elements.translateBtn.disabled = true;

  try {
    const translation = await state.provider.translateSpanishToEnglish(text);
    state.translation = translation;
    state.words = getWords(translation);
    state.pronunciations = await state.provider.getPronunciations(state.words);
    state.evaluations = state.words.map((word, index) => ({ index, word, status: "pending", score: 0, heard: "" }));
    state.selectedIndex = null;
    state.currentKaraokeIndex = 0;
    state.transcript = "";
    renderTranslation();
    renderWordGrid();
    renderKaraokeLine();
    updateResults();
    elements.startBtn.disabled = state.words.length === 0;
    elements.resetBtn.disabled = state.words.length === 0;
    setStatus("Traducción lista. Puedes iniciar la lectura guiada.");
  } catch (error) {
    console.error(error);
    setStatus(`No se pudo traducir: ${error.message}`, true);
  } finally {
    elements.translateBtn.disabled = false;
  }
}

function setStatus(message, isError = false) {
  elements.translationStatus.textContent = message;
  elements.translationStatus.style.color = isError ? "#c93342" : "#64708a";
}

function renderTranslation() {
  elements.translatedText.textContent = state.translation || "La traducción aparecerá aquí.";
  elements.translatedText.classList.toggle("empty", !state.translation);
}

function renderWordGrid() {
  elements.wordGrid.innerHTML = "";

  state.words.forEach((word, index) => {
    const pronunciation = state.pronunciations[index]?.phonetic || "";
    const evaluation = state.evaluations[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `word-card ${evaluation?.status || "pending"}`;
    if (state.selectedIndex === index) button.classList.add("active");
    button.innerHTML = `<span class="word">${escapeHtml(word)}</span><span class="phonetic">${escapeHtml(pronunciation)}</span>`;
    button.addEventListener("click", () => selectWord(index));
    elements.wordGrid.appendChild(button);
  });
}

function renderKaraokeLine() {
  if (!state.words.length) {
    elements.karaokeLine.textContent = "Traduce un texto para empezar la lectura guiada.";
    elements.karaokePron.textContent = "";
    return;
  }

  elements.karaokeLine.innerHTML = state.words.map((word, index) => {
    const evaluation = state.evaluations[index]?.status || "pending";
    const current = index === state.currentKaraokeIndex ? "current" : "";
    return `<span class="karaoke-word ${evaluation} ${current}">${escapeHtml(word)}</span>`;
  }).join(" ");

  const idx = state.currentKaraokeIndex;
  if (idx >= 0 && idx < state.words.length) {
    const pron = state.pronunciations[idx]?.phonetic || "";
    const word = state.words[idx];
    elements.karaokePron.innerHTML = pron ? `<span class="word">${escapeHtml(word)}</span> → <span class="phonetic">${escapeHtml(pron)}</span>` : "";
  } else {
    elements.karaokePron.textContent = "";
  }
}

async function startReading() {
  if (!state.words.length) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    elements.recordingStatus.textContent = "Este navegador no permite grabación de micrófono.";
    return;
  }

  state.currentKaraokeIndex = 0;
  state.transcript = "";
  state.audioBlob = null;
  state.audioBuffer = null;
  state.singleWordBlob = null;
  state.singleWordBuffer = null;
  state.singleWordUrl = null;
  elements.startBtn.disabled = true;
  elements.stopBtn.disabled = false;
  elements.playRecordingBtn.disabled = true;

  state.recorder = new RecorderController({
    onTranscript: handleLiveTranscript,
    onStatus: (status) => { elements.recordingStatus.textContent = status; },
    onAudioReady: handleAudioReady
  });
  state.recorder.setProvider(state.provider);

  try {
    await state.recorder.start();
    startKaraokeTimer();
  } catch (error) {
    console.error(error);
    elements.recordingStatus.textContent = `No se pudo acceder al micrófono: ${error.message}`;
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
  }
}

function stopReading() {
  stopKaraokeTimer();
  elements.stopBtn.disabled = true;
  elements.startBtn.disabled = false;
  state.recorder?.stop();
}

function handleLiveTranscript(transcript) {
  state.transcript = transcript;
}

async function handleAudioReady({ blob, url, transcript }) {
  state.audioBlob = blob;
  state.audioUrl = url;
  state.transcript = transcript || state.transcript;
  elements.playRecordingBtn.disabled = false;

  try {
    state.audioBuffer = await decodeAudioBlob(blob);
  } catch (error) {
    console.warn("No se pudo decodificar el audio para dibujar forma de onda", error);
  }

  const transcriptWords = getWords(state.transcript);
  state.evaluations = await state.provider.analyzePronunciation(state.words, transcriptWords);
  renderWordGrid();
  renderKaraokeLine();
  updateResults();
  if (state.selectedIndex !== null) selectWord(state.selectedIndex);
}

function startKaraokeTimer() {
  stopKaraokeTimer();
  const base = Math.max(650, Math.min(1300, 5000 / Math.max(state.words.length, 1)));
  const speedFactor = { slow: 1.8, normal: 1.0, fast: 0.55 }[state.speed] || 1.0;
  const interval = base * speedFactor;
  state.karaokeTimer = setInterval(() => {
    state.currentKaraokeIndex = Math.min(state.currentKaraokeIndex + 1, state.words.length - 1);
    renderKaraokeLine();
  }, interval);
}

function stopKaraokeTimer() {
  if (state.karaokeTimer) clearInterval(state.karaokeTimer);
  state.karaokeTimer = null;
}

function selectWord(index) {
  state.selectedIndex = index;
  state.currentKaraokeIndex = index;
  renderKaraokeLine();
  const word = state.words[index];
  const pronunciation = state.pronunciations[index]?.phonetic || "";
  const evaluation = state.evaluations[index] || { status: "pending", score: 0, heard: "" };

  elements.selectedWordPanel.classList.remove("empty");
  const scoreText = evaluation.score ? `${Math.round(evaluation.score * 100)}%` : "Sin evaluar";
  const hints = evaluation.phonemeHints?.length ? evaluation.phonemeHints : ["Sin errores fonéticos detectados en este MVP"];
  elements.selectedWordPanel.innerHTML = `
    <strong>${escapeHtml(word)}</strong>
    <div>Pronunciación esperada: <b>${escapeHtml(pronunciation)}</b></div>
    <div>Detectado por el sistema: <b>${escapeHtml(evaluation.heard || "No detectado")}</b></div>
    <div class="chips">
      <span class="chip ${evaluation.status === "correct" ? "ok" : evaluation.status === "incorrect" ? "error" : ""}">${escapeHtml(evaluation.status || "pending")}</span>
      <span class="chip">Coincidencia: ${escapeHtml(scoreText)}</span>
      ${hints.map((hint) => `<span class="chip ${evaluation.status === "incorrect" ? "error" : ""}">${escapeHtml(hint)}</span>`).join("")}
    </div>
  `;

  elements.playExpectedBtn.disabled = false;
  elements.retryWordBtn.disabled = false;

  if (getPlaybackUrl()) enableTransport();
  else disableTransport();

  drawReferenceWaveform(elements.refWaveformCanvas, pronunciation);

  const buffer = state.singleWordBuffer || state.audioBuffer;
  resizeCanvasForDisplay();
  const hasAudio = !!getPlaybackUrl();
  if (hasAudio) {
    drawTimeline(elements.waveformCanvas, state.words, index, state.audioDuration);
    const buffer = state.singleWordBuffer || state.audioBuffer;
    if (buffer) {
      const isSingle = !!state.singleWordBuffer;
      drawWaveformForWord(elements.waveformCanvas, buffer, isSingle ? 0 : index, isSingle ? 1 : state.words.length, pronunciation);
      cacheWaveform();
    } else {
      state.waveformCache = null;
    }
    elements.expandWaveformBtn.disabled = false;
  } else {
    drawEmptyWaveform(elements.waveformCanvas, "Graba tu lectura para ver la forma de onda de esta palabra.");
    state.waveformCache = null;
    elements.expandWaveformBtn.disabled = true;
  }

  renderWordGrid();
}

function toggleWaveformExpand(e) {
  if (e) e.stopPropagation();
  const group = elements.userGroup;
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (isFs) {
    exitFullscreen();
    return;
  }
  if (state.playbackAudio) stopPlayback();
  group.classList.add("fullscreen");
  elements.expandWaveformBtn.textContent = "Cerrar";
  document.body.style.overflow = "hidden";
  if (group.requestFullscreen) {
    group.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  } else if (group.webkitRequestFullscreen) {
    group.webkitRequestFullscreen();
  }
  setTimeout(() => resizeCanvasForDisplay(), 150);
}

function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}

function onFullscreenChange() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (!isFs) {
    elements.userGroup.classList.remove("fullscreen");
    elements.expandWaveformBtn.textContent = "Ampliar";
    document.body.style.overflow = "";
    setTimeout(() => resizeCanvasForDisplay(), 150);
  }
}

function onResize() {
  if (state.selectedIndex !== null) {
    resizeCanvasForDisplay();
  }
}

function resizeCanvasForDisplay() {
  const canvas = elements.waveformCanvas;
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
    canvas.width = w;
    canvas.height = h;
    const buffer = state.singleWordBuffer || state.audioBuffer;
    if (buffer && state.selectedIndex !== null) {
      const isSingle = !!state.singleWordBuffer;
      const pron = state.pronunciations[state.selectedIndex]?.phonetic || "";
      drawWaveformForWord(canvas, buffer, isSingle ? 0 : state.selectedIndex, isSingle ? 1 : state.words.length, pron);
      cacheWaveform();
    } else if (state.waveformCache) {
      restoreWaveform();
    }
  }
}

function playExpectedPronunciation() {
  if (state.selectedIndex === null) return;
  const selectedVoice = getSelectedVoice();
  const similarVoice = elements.similarVoice.checked;
  const profile = elements.voiceProfile.value;
  const pitch = profile === "male" ? 0.88 : profile === "female" ? 1.08 : 1;
  const rate = similarVoice ? 0.84 : 0.9;
  speakWord(cleanWord(state.words[state.selectedIndex]) || state.words[state.selectedIndex], { voice: selectedVoice, pitch, rate, provider: state.provider });
}

async function retrySelectedWord() {
  if (state.selectedIndex === null) return;
  const index = state.selectedIndex;
  const word = state.words[index];

  state.evaluations[index] = { index, word, status: "pending", score: 0, heard: "" };
  renderWordGrid();
  updateResults();

  elements.karaokeLine.innerHTML = `<span class="karaoke-word current">${escapeHtml(word)}</span>`;
  renderKaraokeLine();

  playExpectedPronunciation();

  if (!navigator.mediaDevices?.getUserMedia) {
    elements.recordingStatus.textContent = "Este navegador no permite grabación.";
    return;
  }

  elements.recordingStatus.textContent = "Repite la palabra en voz alta...";

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const audioChunks = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let transcript = "";

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript = event.results[i][0].transcript.trim();
          }
        }
      };

      await new Promise((resolve) => {
        const done = () => {
          if (recorder.state !== "inactive") recorder.stop();
          if (stream) stream.getTracks().forEach((t) => t.stop());
          resolve();
        };
        recognition.onend = done;
        recognition.start();
        recorder.start();
        setTimeout(done, 5000);
      });

      const singleBlob = new Blob(audioChunks, { type: recorder.mimeType || "audio/webm" });
      state.singleWordUrl = URL.createObjectURL(singleBlob);
      state.singleWordBlob = singleBlob;
      elements.playRecordingBtn.disabled = false;
      try {
        state.singleWordBuffer = await decodeAudioBlob(singleBlob);
      } catch (_) { /* waveform no disponible */ }

      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;

      const transcriptWords = getWords(transcript);
      const results = await state.provider.analyzePronunciation([word], transcriptWords);
      state.evaluations[index] = results[0];

      renderWordGrid();
      renderKaraokeLine();
      updateResults();
      if (state.selectedIndex === index) selectWord(index);

      elements.recordingStatus.textContent = results[0].status === "correct"
        ? `"${word}" pronunciado correctamente. Puedes continuar con la lectura.`
        : `Se detectó: "${transcript || "(sin detectar)"}". Intenta de nuevo.`;
    } else {
      elements.recordingStatus.textContent = "Reconocimiento de voz no disponible en este navegador.";
    }
  } catch (err) {
    console.error(err);
    elements.recordingStatus.textContent = "No se pudo grabar: " + err.message;
  } finally {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }
}

function resetEvaluation() {
  stopKaraokeTimer();
  state.evaluations = state.words.map((word, index) => ({ index, word, status: "pending", score: 0, heard: "" }));
  state.currentKaraokeIndex = 0;
  state.transcript = "";
  state.audioBlob = null;
  state.audioBuffer = null;
  state.audioUrl = null;
  state.singleWordBlob = null;
  state.singleWordBuffer = null;
  state.singleWordUrl = null;
  state.selectedIndex = null;
  state.waveformCache = null;
  stopPlayback();
  elements.selectedWordPanel.textContent = "No hay ninguna palabra seleccionada.";
  elements.selectedWordPanel.classList.add("empty");
  elements.playExpectedBtn.disabled = true;
  elements.playRecordingBtn.disabled = true;
  disableTransport();
  elements.retryWordBtn.disabled = true;
  elements.recordingStatus.textContent = "Sin grabar";
  renderWordGrid();
  renderKaraokeLine();
  drawEmptyWaveform(elements.waveformCanvas);
  drawEmptyWaveform(elements.refWaveformCanvas);
  elements.expandWaveformBtn.disabled = true;
  if (elements.userGroup.classList.contains("fullscreen")) toggleWaveformExpand();
  updateResults();
}

function updateResults() {
  const total = state.evaluations.filter((item) => item.status !== "pending").length;
  const correct = state.evaluations.filter((item) => item.status === "correct").length;
  const incorrect = state.evaluations.filter((item) => item.status === "incorrect").length;
  const percentage = total ? Math.round((correct / total) * 100) : 0;
  const values = [total, correct, incorrect, `${percentage}%`];

  elements.results.querySelectorAll("strong").forEach((node, index) => {
    node.textContent = values[index];
  });

  const practiceWords = state.evaluations
    .filter((item) => item.status === "incorrect")
    .map((item) => item.word);

  elements.practiceList.innerHTML = practiceWords.length
    ? `<b>Palabras para practicar:</b> ${practiceWords.map(escapeHtml).join(", ")}`
    : "Cuando termines una lectura, aquí aparecerán las palabras que requieren práctica adicional.";
}

function renderVoiceOptions(forcePreferred = false) {
  elements.voiceSelect.innerHTML = "";
  if (!state.voices.length) {
    const option = document.createElement("option");
    option.textContent = "Voces no disponibles en este navegador";
    option.value = "";
    elements.voiceSelect.appendChild(option);
    return;
  }

  const englishVoices = state.voices.filter((voice) => /^en[-_]/i.test(voice.lang));
  const voicesToRender = englishVoices.length ? englishVoices : state.voices;
  voicesToRender.forEach((voice, index) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    elements.voiceSelect.appendChild(option);
    if (index === 0) option.selected = true;
  });

  const preferred = chooseVoice(voicesToRender, elements.voiceProfile.value);
  if (preferred && (forcePreferred || !elements.voiceSelect.value)) {
    elements.voiceSelect.value = preferred.name;
  }
}

function getSelectedVoice() {
  const selectedName = elements.voiceSelect.value;
  return state.voices.find((voice) => voice.name === selectedName) || chooseVoice(state.voices, elements.voiceProfile.value);
}

function getPlaybackUrl() {
  return state.singleWordUrl || state.audioUrl;
}

function cacheWaveform() {
  const canvas = elements.waveformCanvas;
  if (!canvas) return;
  state.waveformCache = document.createElement("canvas");
  state.waveformCache.width = canvas.width;
  state.waveformCache.height = canvas.height;
  state.waveformCache.getContext("2d").drawImage(canvas, 0, 0);
}

function restoreWaveform() {
  if (!state.waveformCache) return;
  const ctx = elements.waveformCanvas.getContext("2d");
  ctx.clearRect(0, 0, elements.waveformCanvas.width, elements.waveformCanvas.height);
  ctx.drawImage(state.waveformCache, 0, 0);
}

function formatTime(s) {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function enableTransport() {
  elements.rewindBtn.disabled = false;
  elements.playBtn.disabled = false;
  elements.forwardBtn.disabled = false;
  elements.playBtn.textContent = "\u25B6";
  elements.timeDisplay.textContent = "0:00 / --:--";
}

function disableTransport() {
  elements.rewindBtn.disabled = true;
  elements.playBtn.disabled = true;
  elements.forwardBtn.disabled = true;
  elements.playBtn.textContent = "\u25B6";
  elements.timeDisplay.textContent = "--:-- / --:--";
}

function stopPlayback() {
  if (state.playbackAudio) {
    state.playbackAudio.pause();
    state.playbackAudio = null;
  }
  if (state.playbackRaf) {
    cancelAnimationFrame(state.playbackRaf);
    state.playbackRaf = null;
  }
  elements.playBtn.textContent = "\u25B6";
  if (state.waveformCache) restoreWaveform();
}

function startPlayback() {
  stopPlayback();
  const url = getPlaybackUrl();
  if (!url) return;
  state.playbackAudio = new Audio(url);
  state.playbackAudio.addEventListener("loadedmetadata", () => {
    state.audioDuration = state.playbackAudio.duration;
  });
  state.playbackAudio.addEventListener("ended", stopPlayback);
  state.playbackAudio.play().catch(() => {});
  elements.playBtn.textContent = "\u23F8";
  (function tick() {
    if (!state.playbackAudio || state.playbackAudio.paused) return;
    const ct = state.playbackAudio.currentTime;
    const dur = state.playbackAudio.duration;
    if (dur) {
      elements.timeDisplay.textContent = `${formatTime(ct)} / ${formatTime(dur)}`;
      if (state.waveformCache) {
        restoreWaveform();
      } else {
        drawTimeline(elements.waveformCanvas, state.words, state.selectedIndex, state.audioDuration);
      }
      drawPlaybackCursor(elements.waveformCanvas, ct / dur);
    }
    state.playbackRaf = requestAnimationFrame(tick);
  })();
}

function togglePlayback() {
  if (state.playbackAudio && !state.playbackAudio.paused) {
    state.playbackAudio.pause();
    elements.playBtn.textContent = "\u25B6";
    if (state.playbackRaf) {
      cancelAnimationFrame(state.playbackRaf);
      state.playbackRaf = null;
    }
    return;
  }
  if (state.playbackAudio && state.playbackAudio.paused) {
    state.playbackAudio.play().catch(() => {});
    elements.playBtn.textContent = "\u23F8";
    (function tick() {
      if (!state.playbackAudio || state.playbackAudio.paused) return;
      const ct = state.playbackAudio.currentTime;
      const dur = state.playbackAudio.duration;
      if (dur) {
        elements.timeDisplay.textContent = `${formatTime(ct)} / ${formatTime(dur)}`;
        if (state.waveformCache) {
          restoreWaveform();
        } else {
          drawTimeline(elements.waveformCanvas, state.words, state.selectedIndex, state.audioDuration);
        }
        drawPlaybackCursor(elements.waveformCanvas, ct / dur);
      }
      state.playbackRaf = requestAnimationFrame(tick);
    })();
    return;
  }
  startPlayback();
}

function skipPlayback(sec) {
  if (!state.playbackAudio) { startPlayback(); return; }
  const dur = state.playbackAudio.duration || 0;
  state.playbackAudio.currentTime = Math.max(0, Math.min(dur, state.playbackAudio.currentTime + sec));
}

function seekFromClick(e) {
  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  if (state.playbackAudio && state.playbackAudio.duration) {
    state.playbackAudio.currentTime = ratio * state.playbackAudio.duration;
  } else if (getPlaybackUrl()) {
    startPlayback();
    const wait = () => {
      if (state.playbackAudio && state.playbackAudio.duration) {
        state.playbackAudio.currentTime = ratio * state.playbackAudio.duration;
      } else { requestAnimationFrame(wait); }
    };
    requestAnimationFrame(wait);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
