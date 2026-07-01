import { createProvider, getWords, cleanWord } from "./providers.js";
import { RecorderController, decodeAudioBlob, speakWord, loadVoices, chooseVoice } from "./audio.js";
import { drawEmptyWaveform, drawWaveformForWord } from "./waveform.js";

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
  configPanel: $("#configPanel")
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
  karaokeTimer: null
};

init();

async function init() {
  state.provider = createProvider(getProviderConfig());
  drawEmptyWaveform(elements.waveformCanvas);
  bindEvents();
  state.voices = await loadVoices();
  renderVoiceOptions();
  refreshProvider();
}

function bindEvents() {
  elements.translateBtn.addEventListener("click", translateText);
  elements.loadExampleBtn.addEventListener("click", loadExample);
  elements.startBtn.addEventListener("click", startReading);
  elements.stopBtn.addEventListener("click", stopReading);
  elements.resetBtn.addEventListener("click", resetEvaluation);
  elements.playExpectedBtn.addEventListener("click", playExpectedPronunciation);
  elements.playRecordingBtn.addEventListener("click", () => state.recorder?.playRecording());
  elements.retryWordBtn.addEventListener("click", retrySelectedWord);
  elements.providerSelect.addEventListener("change", refreshProvider);
  elements.customEndpoint.addEventListener("change", refreshProvider);
  elements.apiToken.addEventListener("change", refreshProvider);
  elements.voiceProfileGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".voice-btn");
    if (!btn) return;
    elements.voiceProfileGroup.querySelectorAll(".voice-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    elements.voiceProfile.value = btn.dataset.profile;
    renderVoiceOptions(true);
  });
  elements.toggleConfig.addEventListener("click", toggleConfigPanel);
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

function refreshProvider() {
  const provider = elements.providerSelect.value;
  elements.endpointField.style.display = provider === "generic" ? "block" : "none";
  elements.apiKeyField.style.display = provider === "generic" ? "block" : "none";
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
  const interval = Math.max(650, Math.min(1300, 5000 / Math.max(state.words.length, 1)));
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

  if (state.audioBuffer) {
    drawWaveformForWord(elements.waveformCanvas, state.audioBuffer, index, state.words.length, state.pronunciations[index]?.phonetic);
  } else {
    drawEmptyWaveform(elements.waveformCanvas, "Graba tu lectura para ver la forma de onda de esta palabra.");
  }

  renderWordGrid();
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
  state.selectedIndex = null;
  elements.selectedWordPanel.textContent = "No hay ninguna palabra seleccionada.";
  elements.selectedWordPanel.classList.add("empty");
  elements.playExpectedBtn.disabled = true;
  elements.playRecordingBtn.disabled = true;
  elements.retryWordBtn.disabled = true;
  elements.recordingStatus.textContent = "Sin grabar";
  renderWordGrid();
  renderKaraokeLine();
  drawEmptyWaveform(elements.waveformCanvas);
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
