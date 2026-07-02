const FFT_SIZE = 1024;
const HOP_SIZE = 512;
const PITCH_MIN_HZ = 60;
const PITCH_MAX_HZ = 400;

const L = {
  pad: 10,
  waveH: 80,
  labelH: 16,
  specH: 170,
  pitchH: 70,
  refH: 30
};

export function drawEmptyWaveform(canvas, message) {
  if (!message) message = "Selecciona una palabra grabada para ver el análisis completo de voz.";
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#dfe4f1";
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.fillStyle = "#64708a";
  ctx.font = "18px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2 - 16);
}

export function drawWaveformForWord(canvas, audioBuffer, wordIndex, totalWords, phonetic) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const data = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;
  const segStart = Math.floor((wordIndex / Math.max(totalWords, 1)) * data.length);
  const segEnd = Math.floor(((wordIndex + 1) / Math.max(totalWords, 1)) * data.length);
  const segment = data.slice(segStart, Math.max(segStart + 1, segEnd));

  if (segment.length < 4) {
    drawEmptyWaveform(canvas, "Segmento de audio demasiado corto para analizar.");
    return;
  }

  const stft = computeSTFT(segment, sr);
  const pitch = computePitch(segment, sr);

  const top = L.pad;
  const waveY = top;
  const waveEnd = waveY + L.waveH;
  const specY = waveEnd + L.labelH;
  const specEnd = specY + L.specH;
  const pitchY = specEnd + L.labelH;
  const pitchEnd = pitchY + L.pitchH;
  const refY = pitchEnd + L.labelH;
  const refEnd = refY + L.refH;

  drawBackground(ctx, width, height);

  drawWaveformWithEnvelope(ctx, segment, { x: 0, y: waveY, w: width, h: L.waveH });
  drawSectionLabel(ctx, "Forma de onda e intensidad", width, waveEnd);

  drawSpectrogram(ctx, stft, sr, { x: 0, y: specY, w: width, h: L.specH });
  if (phonetic) {
    drawFormantReference(ctx, phonetic, sr, { x: 0, y: specY, w: width, h: L.specH });
  }
  drawSectionLabel(ctx, "Espectrograma (frecuencia vs tiempo)", width, specEnd);

  drawPitchContour(ctx, pitch, segment, { x: 0, y: pitchY, w: width, h: L.pitchH });
  drawSectionLabel(ctx, "Tono fundamental (F0)", width, pitchEnd);

  if (phonetic) {
    drawSyllableReferenceSimple(ctx, phonetic, { x: 0, y: refY, w: width, h: L.refH });
  }
  drawSectionLabel(ctx, "Silabeo de referencia", width, refEnd);
}

function drawBackground(ctx, w, h) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
}

function drawSectionLabel(ctx, text, width, gapTop) {
  ctx.fillStyle = "#64708a";
  ctx.font = "11px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(text, 8, gapTop + 12);
}

function drawWaveformWithEnvelope(ctx, samples, rect) {
  const { x, y, w, h } = rect;
  const cx = w;
  const cy = y + h / 2;
  const step = Math.max(1, Math.floor(samples.length / cx));

  const envelope = computeEnvelope(samples, step);

  ctx.strokeStyle = "#dfe4f1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, cy);
  ctx.lineTo(x + w, cy);
  ctx.stroke();

  ctx.fillStyle = "rgba(36, 70, 216, 0.08)";
  ctx.beginPath();
  ctx.moveTo(x, cy);
  for (let px = 0; px < cx && px < envelope.length; px++) {
    const env = envelope[px];
    ctx.lineTo(x + px, cy - env * (h / 2));
  }
  for (let px = Math.min(cx, envelope.length) - 1; px >= 0; px--) {
    const env = envelope[px];
    ctx.lineTo(x + px, cy + env * (h / 2));
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#2446d8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let px = 0; px < cx && px < envelope.length; px++) {
    const env = envelope[px];
    if (px === 0) ctx.moveTo(x, cy - env * (h / 2));
    else ctx.lineTo(x + px, cy - env * (h / 2));
  }
  ctx.stroke();

  ctx.strokeStyle = "#2446d8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  let drewWave = false;
  for (let px = 0; px < w; px++) {
    const start = Math.floor((px / w) * samples.length);
    let min = 0, max = 0;
    for (let i = 0; i < step && start + i < samples.length; i++) {
      const v = samples[start + i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const yMin = cy + min * (h / 2);
    const yMax = cy + max * (h / 2);
    if (!drewWave) { ctx.moveTo(x + px, yMin); drewWave = true; }
    ctx.lineTo(x + px, yMin);
    ctx.lineTo(x + px, yMax);
  }
  ctx.stroke();
}

function computeEnvelope(samples, step) {
  const env = [];
  for (let i = 0; i < samples.length; i += step) {
    let sumSq = 0;
    const len = Math.min(step, samples.length - i);
    for (let j = 0; j < len; j++) {
      sumSq += samples[i + j] * samples[i + j];
    }
    env.push(Math.sqrt(sumSq / len));
  }
  return env;
}

function drawSpectrogram(ctx, stft, sampleRate, rect) {
  const { x, y, w, h } = rect;
  const { spectrogram, numFrames, freqBins, fftSize } = stft;
  if (!numFrames || !freqBins) return;

  const minLogFreq = Math.log10(50);
  const maxLogFreq = Math.log10(sampleRate / 2);

  let maxMag = 1e-10;
  for (const frame of spectrogram) {
    for (let i = 0; i < freqBins; i++) {
      if (frame[i] > maxMag) maxMag = frame[i];
    }
  }

  const imageData = ctx.createImageData(w, h);
  const pixels = imageData.data;

  const invLogRange = 1 / (maxLogFreq - minLogFreq);

  for (let px = 0; px < w; px++) {
    const frameIdx = Math.floor((px / w) * numFrames);
    const frame = spectrogram[Math.min(frameIdx, numFrames - 1)];

    for (let py = 0; py < h; py++) {
      const t = 1 - py / h;
      const logFreqHz = minLogFreq + t * (maxLogFreq - minLogFreq);
      const freqHz = Math.pow(10, logFreqHz);
      const bin = Math.round((freqHz / sampleRate) * fftSize);

      let mag = 0;
      if (bin >= 0 && bin < freqBins) {
        mag = frame[bin];
      }

      const normalized = Math.log10(mag + 1) / Math.log10(maxMag + 1);
      const idx = (py * w + px) * 4;
      setSpectrogramColor(pixels, idx, normalized);
    }
  }

  ctx.putImageData(imageData, x, y);

  ctx.fillStyle = "#64708a";
  ctx.font = "10px system-ui";
  ctx.textAlign = "left";
  const freqLabels = [0.5, 1, 2, 3, 4, 5];
  for (const f of freqLabels) {
    if (f * 1000 > sampleRate / 2) continue;
    const t = (Math.log10(f * 1000) - minLogFreq) * invLogRange;
    const py = y + h - Math.round(t * h);
    if (py >= y && py <= y + h) {
      ctx.fillText(`${f}kHz`, x + 3, py + 3);
      ctx.strokeStyle = "rgba(100,112,138,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 28, py);
      ctx.lineTo(x + w, py);
      ctx.stroke();
    }
  }
}

function setSpectrogramColor(pixels, idx, value) {
  const v = Math.min(1, Math.max(0, value));
  let r, g, b;
  if (v < 0.2) {
    const t = v / 0.2;
    r = 0; g = 0; b = Math.round(t * 60);
  } else if (v < 0.4) {
    const t = (v - 0.2) / 0.2;
    r = 0; g = Math.round(t * 120); b = Math.round(60 + t * 100);
  } else if (v < 0.6) {
    const t = (v - 0.4) / 0.2;
    r = Math.round(t * 180); g = 120; b = Math.round(160 - t * 80);
  } else if (v < 0.8) {
    const t = (v - 0.6) / 0.2;
    r = Math.round(180 + t * 75); g = Math.round(120 + t * 80); b = Math.round(80 - t * 80);
  } else {
    const t = (v - 0.8) / 0.2;
    r = 255; g = Math.round(200 - t * 200); b = 0;
  }
  pixels[idx] = r;
  pixels[idx + 1] = g;
  pixels[idx + 2] = b;
  pixels[idx + 3] = 255;
}

function drawFormantReference(ctx, phonetic, sampleRate, rect) {
  const { x, y, w, h } = rect;
  const vowelRefs = extractVowelFormants(phonetic);
  if (!vowelRefs.length) return;

  const minLog = Math.log10(50);
  const maxLog = Math.log10(sampleRate / 2);

  for (const ref of vowelRefs) {
    const bands = [
      { freq: ref.f1, label: "F1", color: "255,80,80" },
      { freq: ref.f2, label: "F2", color: "80,200,80" },
      { freq: ref.f3, label: "F3", color: "80,140,255" }
    ];

    for (const band of bands) {
      if (!band.freq || band.freq >= sampleRate / 2) continue;
      const t = (Math.log10(band.freq) - minLog) / (maxLog - minLog);
      const py = y + h - Math.round(t * h);
      if (py < y || py > y + h) continue;

      ctx.fillStyle = `rgba(${band.color},0.12)`;
      ctx.fillRect(x, py - 4, w, 8);
      ctx.strokeStyle = `rgba(${band.color},0.5)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x + w, py);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.fillStyle = "#172033";
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  ctx.fillText("Líneas = formantes esperados (F1 rojo, F2 verde, F3 azul)", x + w - 8, y + 12);
}

function extractVowelFormants(phonetic) {
  const vowelsFound = [];
  const vowelMap = getVowelFormantMap();
  const chars = phonetic.toLowerCase().split("");
  for (let i = 0; i < chars.length; i++) {
    if (i < chars.length - 1) {
      const pair = chars[i] + chars[i + 1];
      if (vowelMap[pair]) {
        vowelsFound.push(vowelMap[pair]);
        i++;
        continue;
      }
    }
    const single = chars[i];
    if (vowelMap[single]) {
      vowelsFound.push(vowelMap[single]);
    }
  }
  return vowelsFound;
}

function getVowelFormantMap() {
  return {
    "i":  { f1: 300,  f2: 2300, f3: 2900 },
    "ɪ":  { f1: 400,  f2: 1900, f3: 2600 },
    "e":  { f1: 500,  f2: 1800, f3: 2500 },
    "ɛ":  { f1: 550,  f2: 1750, f3: 2500 },
    "æ":  { f1: 700,  f2: 1700, f3: 2400 },
    "a":  { f1: 750,  f2: 1100, f3: 2400 },
    "ʌ":  { f1: 650,  f2: 1200, f3: 2400 },
    "ə":  { f1: 500,  f2: 1500, f3: 2500 },
    "ɔ":  { f1: 550,  f2: 900,  f3: 2400 },
    "o":  { f1: 450,  f2: 800,  f3: 2400 },
    "ʊ":  { f1: 350,  f2: 900,  f3: 2300 },
    "u":  { f1: 300,  f2: 800,  f3: 2200 },
    "ei": { f1: 450,  f2: 2000, f3: 2600 },
    "ai": { f1: 700,  f2: 1200, f3: 2400 },
    "ɔi": { f1: 500,  f2: 1000, f3: 2400 },
    "au": { f1: 700,  f2: 1000, f3: 2400 },
    "ou": { f1: 450,  f2: 850,  f3: 2400 }
  };
}

function drawPitchContour(ctx, pitch, samples, rect) {
  const { x, y, w, h } = rect;
  const cy = y + h / 2;
  const pitchRange = PITCH_MAX_HZ - PITCH_MIN_HZ;

  ctx.strokeStyle = "#dfe4f1";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const py = y + (h / 4) * (i + 1);
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }

  const valid = pitch.filter(p => p.freq > 0 && p.confidence > 0.15);
  if (!valid.length) {
    ctx.fillStyle = "#64708a";
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Tono no detectable en este segmento", x + w / 2, y + h / 2 + 4);
    return;
  }

  ctx.strokeStyle = "#2446d8";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.lineJoin = "round";
  for (let i = 0; i < valid.length; i++) {
    const px2 = x + (valid[i].frame / Math.max(pitch.length, 1)) * w;
    const ratio = (valid[i].freq - PITCH_MIN_HZ) / pitchRange;
    const py2 = y + h - ratio * h;
    if (i === 0) ctx.moveTo(px2, py2);
    else ctx.lineTo(px2, py2);
  }
  ctx.stroke();

  ctx.fillStyle = "#2446d8";
  for (const p of valid) {
    const px2 = x + (p.frame / Math.max(pitch.length, 1)) * w;
    const ratio = (p.freq - PITCH_MIN_HZ) / pitchRange;
    const py2 = y + h - ratio * h;
    ctx.beginPath();
    ctx.arc(px2, py2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#64708a";
  ctx.font = "9px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`${PITCH_MAX_HZ}Hz`, x + 3, y + 10);
  ctx.fillText(`${PITCH_MIN_HZ}Hz`, x + 3, y + h - 3);
}

function drawSyllableReferenceSimple(ctx, phonetic, rect) {
  const { x, y, w, h } = rect;
  const syllables = phonetic.split(/[\s-]+/).filter(Boolean);
  if (!syllables.length) return;

  const sylW = w / syllables.length;

  ctx.fillStyle = "rgba(36, 70, 216, 0.06)";
  syllables.forEach((_, i) => {
    if (i % 2 === 0) ctx.fillRect(x + i * sylW, y, sylW, h);
  });

  syllables.forEach((syl, i) => {
    const hasStress = /[A-ZÁÉÍÓÚ]/.test(syl);
    const sx = x + i * sylW;
    ctx.fillStyle = hasStress ? "#2446d8" : "#64708a";
    ctx.font = hasStress ? "bold 12px system-ui" : "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(syl, sx + sylW / 2, y + h / 2 + 4);
    if (hasStress) {
      ctx.fillStyle = "#2446d8";
      ctx.beginPath();
      ctx.moveTo(sx + sylW / 2 - 6, y + 2);
      ctx.lineTo(sx + sylW / 2, y - 2);
      ctx.lineTo(sx + sylW / 2 + 6, y + 2);
      ctx.fill();
    }
  });

  ctx.fillStyle = "#64708a";
  ctx.font = "9px system-ui";
  ctx.textAlign = "right";
  ctx.fillText("sílaba tónica", x + w, y + h - 2);
}

function computeSTFT(samples, sampleRate) {
  const numFrames = Math.max(1, Math.floor((samples.length - FFT_SIZE) / HOP_SIZE) + 1);
  const freqBins = FFT_SIZE / 2;
  const spectrogram = [];

  for (let f = 0; f < numFrames; f++) {
    const start = f * HOP_SIZE;
    const windowed = applyHannWindow(samples, start, FFT_SIZE);
    const mag = fftMagnitude(windowed);
    spectrogram.push(mag);
  }

  return { spectrogram, numFrames, freqBins, sampleRate, fftSize: FFT_SIZE };
}

function applyHannWindow(samples, start, size) {
  const result = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const idx = start + i;
    const hann = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
    result[i] = (idx < samples.length ? samples[idx] : 0) * hann;
  }
  return result;
}

function fftMagnitude(samples) {
  const N = samples.length;
  const n = 1 << Math.ceil(Math.log2(N));
  const re = new Float64Array(n);
  const im = new Float64Array(n);

  const logN = Math.log2(n);
  for (let i = 0; i < n; i++) {
    const j = bitReverse(i, logN);
    re[j] = i < N ? samples[i] : 0;
    im[j] = 0;
  }

  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const angle = -2 * Math.PI / size;
    const wr0 = Math.cos(angle);
    const wi0 = Math.sin(angle);

    for (let i = 0; i < n; i += size) {
      let wr = 1, wi = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const tre = wr * re[b] - wi * im[b];
        const tim = wr * im[b] + wi * re[b];
        re[b] = re[a] - tre;
        im[b] = im[a] - tim;
        re[a] = re[a] + tre;
        im[a] = im[a] + tim;
        const nwr = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = nwr;
      }
    }
  }

  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }
  return mag;
}

function bitReverse(x, logN) {
  let r = 0;
  for (let i = 0; i < logN; i++) {
    r = (r << 1) | (x & 1);
    x >>= 1;
  }
  return r;
}

function computePitch(samples, sampleRate) {
  const frameSize = 2048;
  const hopSize = 512;
  const numFrames = Math.max(1, Math.floor((samples.length - frameSize) / hopSize) + 1);
  const pitch = [];

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    const windowed = applyHannWindow(samples, start, frameSize);

    const r = autocorrelate(windowed);
    const maxLag = Math.floor(sampleRate / PITCH_MIN_HZ);
    const minLag = Math.floor(sampleRate / PITCH_MAX_HZ);
    const energy0 = r[0] || 1e-10;

    let bestLag = minLag;
    let bestVal = 0;
    for (let lag = minLag; lag < maxLag && lag < r.length; lag++) {
      if (r[lag] > bestVal && lag > minLag && lag < maxLag - 1 &&
          r[lag] > r[lag - 1] && r[lag] > r[lag + 1]) {
        bestVal = r[lag];
        bestLag = lag;
      }
    }

    const confidence = bestVal / energy0;
    if (confidence > 0.15 && bestLag > 0) {
      const freq = sampleRate / bestLag;
      pitch.push({ frame: f, freq, confidence, time: start / sampleRate });
    } else {
      pitch.push({ frame: f, freq: 0, confidence: 0, time: start / sampleRate });
    }
  }

  return pitch;
}

function autocorrelate(samples) {
  const N = samples.length;
  const r = new Float64Array(N);
  for (let lag = 0; lag < N; lag++) {
    let sum = 0;
    for (let i = 0; i < N - lag; i++) {
      sum += samples[i] * samples[i + lag];
    }
    r[lag] = sum;
  }
  return r;
}

export function drawReferenceWaveform(canvas, phonetic) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (!phonetic) {
    ctx.fillStyle = "#64708a";
    ctx.font = "18px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Selecciona una palabra para ver la referencia.", width / 2, height / 2 - 16);
    return;
  }

  const pad = 10;
  const labelH = 16;
  const specY = pad;
  const specH = height - pad - labelH;
  const rect = { x: 0, y: specY, w: width, h: specH };

  drawBackground(ctx, width, height);

  const syllables = phonetic.split(/[\s-]+/).filter(Boolean);
  const formantMap = getVowelFormantMap();

  const vowelFormants = [];
  for (const syl of syllables) {
    const vowel = syl.replace(/[^aáeéiíoóuú]/gi, "").toLowerCase();
    if (vowel && formantMap[vowel]) {
      vowelFormants.push(formantMap[vowel]);
    }
  }

  const sr = 16000;
  const nyquist = sr / 2;
  const freqBins = 512;
  const numFrames = Math.max(20, syllables.length * 10);

  const imageData = ctx.createImageData(freqBins, numFrames);
  for (let f = 0; f < freqBins; f++) {
    const freq = (f / freqBins) * nyquist;
    const isFormant = vowelFormants.some(
      (fmap) => Math.abs(freq - fmap.f1) < 120
    );
    for (let t = 0; t < numFrames; t++) {
      const idx = (t * freqBins + f) * 4;
      if (isFormant) {
        imageData.data[idx] = 200;
        imageData.data[idx + 1] = 220;
        imageData.data[idx + 2] = 255;
        imageData.data[idx + 3] = 60;
      } else {
        imageData.data[idx + 3] = 0;
      }
    }
  }

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = freqBins;
  tempCanvas.height = numFrames;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.putImageData(imageData, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tempCanvas, rect.x, rect.y, rect.w, rect.h);

  for (const fmap of vowelFormants) {
    const fy = rect.y + (1 - fmap.f1 / nyquist) * rect.h;
    ctx.strokeStyle = "#c93342";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(rect.x, fy);
    ctx.lineTo(rect.x + rect.w, fy);
    ctx.stroke();
    ctx.fillStyle = "#c93342";
    ctx.font = "10px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(`F1 ${fmap.f1} Hz`, rect.x + 4, fy - 3);
    ctx.setLineDash([]);
  }

  const sylW = rect.w / Math.max(syllables.length, 1);
  ctx.fillStyle = "rgba(36, 70, 216, 0.06)";
  syllables.forEach((_, i) => {
    if (i % 2 === 1) ctx.fillRect(rect.x + i * sylW, rect.y, sylW, rect.h);
  });

  ctx.fillStyle = "#64708a";
  ctx.font = "10px system-ui";
  ctx.textAlign = "left";
  ctx.fillText("Espectrograma de referencia", 8, height - 2);
}

export function drawPlaybackCursor(canvas, progress) {
  if (!canvas || progress <= 0 || progress >= 1) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const x = Math.round(progress * width);
  ctx.save();
  ctx.strokeStyle = "#ff0040";
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(255,0,64,0.6)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.restore();
}
