export class RecorderController {
  constructor({ onTranscript, onStatus, onAudioReady }) {
    this.onTranscript = onTranscript;
    this.onStatus = onStatus;
    this.onAudioReady = onAudioReady;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.recognition = null;
    this.provider = null;
    this.transcript = "";
    this.audioBlob = null;
    this.audioUrl = null;
    this.startedAt = 0;
    this.durationMs = 0;
  }

  setProvider(provider) {
    this.provider = provider;
  }

  isSpeechRecognitionSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioChunks = [];
    this.transcript = "";
    this.durationMs = 0;
    this.startedAt = performance.now();

    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.audioChunks.push(event.data);
    };
    this.mediaRecorder.onstop = () => this.finishRecording();
    this.mediaRecorder.start();

    this.startSpeechRecognition();
    this.onStatus?.("Grabando");
  }

  stop() {
    this.durationMs = performance.now() - this.startedAt;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (_) { /* noop */ }
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    this.onStatus?.("Procesando grabación");
  }

  startSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.onStatus?.("Grabando sin transcripción automática: navegador no compatible");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = "en-US";
    this.recognition.continuous = true;
    this.recognition.interimResults = true;

    this.recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalTranscript += result[0].transcript + " ";
        else interimTranscript += result[0].transcript + " ";
      }
      this.transcript = `${this.transcript} ${finalTranscript}`.trim();
      this.onTranscript?.(`${this.transcript} ${interimTranscript}`.trim());
    };

    this.recognition.onerror = (event) => {
      this.onStatus?.(`Reconocimiento de voz: ${event.error}`);
    };

    this.recognition.start();
  }

  async finishRecording() {
    this.audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || "audio/webm" });
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = URL.createObjectURL(this.audioBlob);

    let transcript = this.transcript;

    if (this.provider?.recognizeSpeech) {
      try {
        const providerTranscript = await this.provider.recognizeSpeech(this.audioBlob, "en-US");
        if (providerTranscript) transcript = providerTranscript;
      } catch (_) { /* keep browser transcript */ }
    }

    this.onAudioReady?.({
      blob: this.audioBlob,
      url: this.audioUrl,
      transcript,
      durationMs: this.durationMs
    });
    this.onStatus?.("Grabación finalizada");
  }

  playRecording() {
    if (!this.audioUrl) return;
    const audio = new Audio(this.audioUrl);
    audio.play();
  }
}

let _sharedAudioCtx = null;
function getAudioContext() {
  if (!_sharedAudioCtx) _sharedAudioCtx = new AudioContext();
  if (_sharedAudioCtx.state === "suspended") _sharedAudioCtx.resume();
  return _sharedAudioCtx;
}

export async function decodeAudioBlob(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  try {
    const ctx = getAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return audioBuffer;
  } catch (firstErr) {
    try {
      const fallbackCtx = new OfflineAudioContext(1, 1, 44100);
      const audioBuffer = await fallbackCtx.decodeAudioData(arrayBuffer.slice(0));
      return audioBuffer;
    } catch (secondErr) {
      throw new Error("No se pudo decodificar el audio");
    }
  }
}

let _lastUtterance = null;

export function speakWord(word, { voice, rate = 0.86, pitch = 1, provider } = {}) {
  if (!word) return;
  if (provider?.synthesizeSpeech) {
    try {
      provider.synthesizeSpeech(word, { voice, rate, pitch });
      return;
    } catch (_) { /* fall through to browser synthesis */ }
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.getVoices();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = rate;
  utterance.pitch = pitch;
  if (voice) utterance.voice = voice;
  utterance.onerror = () => {};
  _lastUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function loadVoices() {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    if (voices.length) return resolve(voices);
    window.speechSynthesis.onvoiceschanged = () => resolve(window.speechSynthesis.getVoices());
    setTimeout(() => resolve(window.speechSynthesis?.getVoices?.() || []), 700);
  });
}

export function chooseVoice(voices, profile) {
  const englishVoices = voices.filter((voice) => /^en[-_]/i.test(voice.lang));
  const source = englishVoices.length ? englishVoices : voices;
  const nameIncludes = (voice, terms) => terms.some((term) => voice.name.toLowerCase().includes(term));

  if (profile === "female") {
    return source.find((voice) => nameIncludes(voice, ["female", "samantha", "victoria", "zira", "susan", "karen", "moira", "serena"])) || source[0];
  }
  if (profile === "male") {
    return source.find((voice) => nameIncludes(voice, ["male", "daniel", "david", "alex", "mark", "fred", "george", "tom"])) || source[0];
  }
  return source[0];
}
