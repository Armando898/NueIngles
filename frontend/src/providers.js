const fallbackTranslations = new Map([
  ["hola", "hello"],
  ["me", "me"],
  ["llamo", "my name is"],
  ["quiero", "I want"],
  ["aprender", "to learn"],
  ["inglés", "English"],
  ["ingles", "English"],
  ["porque", "because"],
  ["necesito", "I need"],
  ["hablar", "to speak"],
  ["con", "with"],
  ["más", "more"],
  ["confianza", "confidence"],
  ["en", "in"],
  ["mi", "my"],
  ["trabajo", "job"],
  ["viajes", "trips"],
  ["viajar", "to travel"],
  ["estudiantes", "students"],
  ["practicar", "to practice"],
  ["pronunciación", "pronunciation"],
  ["pronunciacion", "pronunciation"]
]);

const simplifiedPronunciations = new Map([
  ["a", "ə / ei"],
  ["about", "ə-BAUT"],
  ["and", "and / ənd"],
  ["because", "bi-KÓZ"],
  ["confidence", "KON-fi-dens"],
  ["english", "ÍNG-glish"],
  ["hello", "he-LÓU"],
  ["i", "ai"],
  ["in", "in"],
  ["is", "is"],
  ["job", "yob"],
  ["learn", "lern"],
  ["me", "mí"],
  ["more", "mor"],
  ["my", "mai"],
  ["name", "neim"],
  ["need", "níid"],
  ["practice", "PRÁK-tis"],
  ["pronunciation", "prə-nan-si-ÉI-shən"],
  ["speak", "spíik"],
  ["students", "STIU-dents"],
  ["the", "də / dhi"],
  ["to", "tu / tə"],
  ["travel", "TRÁ-vəl"],
  ["trips", "trips"],
  ["want", "uont"],
  ["with", "uiz"],
  ["work", "uerk"]
]);

export function getWords(text) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

export function cleanWord(word) {
  return word.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/gi, "");
}

export class AIProvider {
  constructor(config = {}) {
    this.config = config;
  }

  async translateSpanishToEnglish(text) {
    throw new Error("translateSpanishToEnglish no implementado");
  }

  async getPronunciations(words) {
    return words.map((word) => ({
      word,
      phonetic: getSimplifiedPronunciation(word)
    }));
  }

  async analyzePronunciation(expectedWords, transcriptWords) {
    return analyzeByWordSimilarity(expectedWords, transcriptWords);
  }

  async recognizeSpeech(audioBlob, lang = "en-US") {
    throw new Error("recognizeSpeech no implementado. El proveedor debe sobrescribir este método o usar el reconocimiento por navegador.");
  }

  async synthesizeSpeech(text, { voice, rate = 0.86, pitch = 1 } = {}) {
    throw new Error("synthesizeSpeech no implementado. El proveedor debe sobrescribir este método o usar la síntesis por navegador.");
  }
}

export class MockProvider extends AIProvider {
  async translateSpanishToEnglish(text) {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const exact = getDemoExactTranslation(trimmed);
    if (exact) return exact;

    return trimmed
      .split(/(\s+|[,.!?;:]+)/)
      .map((token) => {
        if (/^\s+$/.test(token) || /^[,.!?;:]+$/.test(token)) return token;
        const normalized = token.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return fallbackTranslations.get(normalized) || token;
      })
      .join("")
      .replace(/\bi\b/g, "I")
      .replace(/\benglish\b/gi, "English")
      .replace(/\s+([,.!?;:])/g, "$1");
  }
}

export class BackendProvider extends AIProvider {
  async translateSpanishToEnglish(text) {
    const body = { text };
    if (this.config.provider !== "backend") {
      body.provider = this.config.provider;
      if (this.config.token) body.apiKey = this.config.token;
    }
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Backend respondió ${response.status}`);
    const data = await response.json();
    return data.translation;
  }
}

export class GenericProvider extends AIProvider {
  async translateSpanishToEnglish(text) {
    if (!this.config.endpoint) {
      throw new Error("Debes configurar un endpoint personalizado para usar esta opción.");
    }

    const headers = { "Content-Type": "application/json" };
    if (this.config.token) headers.Authorization = `Bearer ${this.config.token}`;

    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        task: "translate_es_en",
        input: text,
        expectedOutput: { translation: "string" }
      })
    });
    if (!response.ok) throw new Error(`API personalizada respondió ${response.status}`);
    const data = await response.json();
    return data.translation || data.output || data.text || "";
  }
}

export function createProvider(config) {
  if (config.provider === "mock") return new MockProvider(config);
  if (config.provider === "generic") return new GenericProvider(config);
  return new BackendProvider(config);
}

function getDemoExactTranslation(text) {
  const normalized = text.toLowerCase().trim();
  if (normalized.includes("quiero aprender inglés") || normalized.includes("quiero aprender ingles")) {
    return "I want to learn English because I need to speak with more confidence in my job and when I travel.";
  }
  if (normalized.includes("hola")) {
    return "Hello, my name is Ana. I want to practice English pronunciation.";
  }
  return "";
}

export function getSimplifiedPronunciation(word) {
  const cleaned = cleanWord(word);
  if (!cleaned) return "";
  if (simplifiedPronunciations.has(cleaned)) return simplifiedPronunciations.get(cleaned);

  return cleaned
    .replace(/tion$/i, "shən")
    .replace(/th/gi, "z/th")
    .replace(/oo/gi, "u")
    .replace(/ee/gi, "íi")
    .replace(/sh/gi, "sh")
    .replace(/ch/gi, "ch")
    .replace(/j/gi, "y")
    .replace(/w/gi, "u")
    .replace(/r$/i, "r")
    .replace(/e$/i, "");
}

export function analyzeByWordSimilarity(expectedWords, transcriptWords) {
  const cleanedTranscript = transcriptWords.map(cleanWord).filter(Boolean);
  let transcriptIndex = 0;

  return expectedWords.map((rawWord, index) => {
    const expected = cleanWord(rawWord);
    const heard = cleanedTranscript[transcriptIndex] || "";
    const score = similarity(expected, heard);
    const correct = expected && score >= 0.76;

    if (correct || score >= 0.45) transcriptIndex += 1;

    return {
      index,
      word: rawWord,
      expected,
      heard,
      score: Number(score.toFixed(2)),
      status: correct ? "correct" : "incorrect",
      phonemeHints: correct ? [] : getErrorHints(expected, heard)
    };
  });
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function getErrorHints(expected, heard) {
  if (!heard) return ["No detectado por el reconocimiento de voz"];
  const hints = [];
  if (expected.includes("th") && !heard.includes("th")) hints.push("Revisar /θ/ o /ð/");
  if (expected.includes("r") && !heard.includes("r")) hints.push("Revisar sonido /r/ inglesa");
  if (expected.includes("v") && heard.includes("b")) hints.push("Diferenciar /v/ y /b/");
  if (Math.abs(expected.length - heard.length) >= 3) hints.push("Duración o sílabas distintas");
  if (!hints.length) hints.push("Diferencia detectada en sonidos o acento");
  return hints;
}
