import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const FRONTEND_DIR = resolve(__dirname, "../frontend");
const PORT = Number(process.env.PORT || 5173);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/translate") {
      const body = await readJson(req);
      const translation = await translateSpanishToEnglish(body.text || "", body.provider || "", body.apiKey || "");
      return sendJson(res, { translation });
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(req, res);
    }

    sendJson(res, { error: "Método no permitido" }, 405);
  } catch (error) {
    console.error(error);
    sendJson(res, { error: error.message || "Error interno" }, 500);
  }
}).listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

const FREE_PROVIDERS = {
  gemini: {
    key: () => process.env.GEMINI_API_KEY,
    translate: (text, key) => translateWithGemini(text, key)
  },
  groq: {
    key: () => process.env.GROQ_API_KEY,
    translate: (text, key) => translateWithOpenAICompatible(text, key, "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile")
  },
  openai: {
    key: () => process.env.OPENAI_API_KEY,
    translate: (text, key) => translateWithOpenAICompatible(text, key, "https://api.openai.com/v1", "gpt-4o-mini")
  },
  deepseek: {
    key: () => process.env.DEEPSEEK_API_KEY,
    translate: (text, key) => translateWithOpenAICompatible(text, key, "https://api.deepseek.com/v1", "deepseek-chat")
  },
  moonshot: {
    key: () => process.env.MOONSHOT_API_KEY,
    translate: (text, key) => translateWithOpenAICompatible(text, key, "https://api.moonshot.cn/v1", "moonshot-v1-8k")
  }
};

async function translateSpanishToEnglish(text, providerOpt, apiKeyOpt) {
  if (!text.trim()) return "";

  const provider = providerOpt || process.env.AI_PROVIDER || "mock";

  const freeProvider = FREE_PROVIDERS[provider];
  if (freeProvider) {
    const key = apiKeyOpt || freeProvider.key() || "";
    if (!key) {
      const providerNames = Object.keys(FREE_PROVIDERS).map((p) => `"${p}"`).join(", ");
      throw new Error(`Falta API key para "${provider}". Consíguela gratis y configúrala en backend/.env, o selecciona "mock" para modo demo. Proveedores disponibles: ${providerNames}.`);
    }
    return freeProvider.translate(text, key);
  }

  if (provider === "openai-compatible") {
    return translateWithOpenAICompatible(
      text,
      process.env.OPENAI_COMPATIBLE_API_KEY || "",
      process.env.OPENAI_COMPATIBLE_BASE_URL || "",
      process.env.OPENAI_COMPATIBLE_MODEL || ""
    );
  }

  if (provider === "generic-rest") {
    return translateWithGenericRest(text);
  }

  return translateWithMockProvider(text);
}

async function translateWithOpenAICompatible(text, apiKey, baseUrl, model) {
  if (!baseUrl || !apiKey || !model) {
    throw new Error("Faltan credenciales del proveedor OpenAI-compatible.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "Translate from Spanish to natural English. Preserve the structure as much as possible. Return only the translation."
        },
        { role: "user", content: text }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proveedor OpenAI-compatible respondió ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function translateWithGenericRest(text) {
  const endpoint = process.env.GENERIC_AI_TRANSLATE_ENDPOINT;
  const apiKey = process.env.GENERIC_AI_API_KEY;
  if (!endpoint) throw new Error("Falta GENERIC_AI_TRANSLATE_ENDPOINT.");

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ task: "translate_es_en", input: text })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Proveedor REST genérico respondió ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.translation || data.output || data.text || "";
}

const mockTranslations = new Map([
  ["hola", "hello"],
  ["adiós", "goodbye"],
  ["gracias", "thank you"],
  ["por", "by"],
  ["favor", "favor"],
  ["sí", "yes"],
  ["sí", "yes"],
  ["no", "no"],
  ["bueno", "good"],
  ["malo", "bad"],
  ["grande", "big"],
  ["pequeño", "small"],
  ["el", "the"],
  ["la", "the"],
  ["los", "the"],
  ["las", "the"],
  ["un", "a"],
  ["una", "a"],
  ["unos", "some"],
  ["unas", "some"],
  ["este", "this"],
  ["esta", "this"],
  ["estos", "these"],
  ["estas", "these"],
  ["ese", "that"],
  ["esa", "that"],
  ["esos", "those"],
  ["esas", "those"],
  ["yo", "I"],
  ["tú", "you"],
  ["tu", "your"],
  ["él", "he"],
  ["ella", "she"],
  ["nosotros", "we"],
  ["ellos", "they"],
  ["mi", "my"],
  ["mis", "my"],
  ["tu", "your"],
  ["tus", "your"],
  ["su", "his"],
  ["sus", "his"],
  ["nuestro", "our"],
  ["que", "that"],
  ["qué", "what"],
  ["quién", "who"],
  ["cómo", "how"],
  ["cuándo", "when"],
  ["dónde", "where"],
  ["cuál", "which"],
  ["por qué", "why"],
  ["cuánto", "how much"],
  ["a", "to"],
  ["ante", "before"],
  ["bajo", "under"],
  ["con", "with"],
  ["contra", "against"],
  ["de", "of"],
  ["desde", "from"],
  ["durante", "during"],
  ["en", "in"],
  ["entre", "between"],
  ["hacia", "toward"],
  ["hasta", "until"],
  ["para", "for"],
  ["por", "by"],
  ["sin", "without"],
  ["sobre", "about"],
  ["y", "and"],
  ["e", "and"],
  ["o", "or"],
  ["u", "or"],
  ["pero", "but"],
  ["porque", "because"],
  ["aunque", "although"],
  ["mientras", "while"],
  ["cuando", "when"],
  ["como", "like"],
  ["si", "if"],
  ["ni", "nor"],
  ["ser", "to be"],
  ["soy", "I am"],
  ["eres", "you are"],
  ["es", "is"],
  ["somos", "we are"],
  ["son", "they are"],
  ["era", "was"],
  ["fue", "was"],
  ["será", "will be"],
  ["estar", "to be"],
  ["estoy", "I am"],
  ["estás", "you are"],
  ["está", "is"],
  ["estamos", "we are"],
  ["están", "they are"],
  ["estaba", "was"],
  ["estado", "been"],
  ["hay", "there is"],
  ["haber", "to have"],
  ["he", "I have"],
  ["has", "you have"],
  ["ha", "has"],
  ["hemos", "we have"],
  ["han", "they have"],
  ["tener", "to have"],
  ["tengo", "I have"],
  ["tienes", "you have"],
  ["tiene", "has"],
  ["tenemos", "we have"],
  ["tienen", "they have"],
  ["tuve", "I had"],
  ["tuvo", "had"],
  ["tenido", "had"],
  ["hacer", "to do"],
  ["hago", "I do"],
  ["haces", "you do"],
  ["hace", "does"],
  ["hacemos", "we do"],
  ["hacen", "they do"],
  ["hice", "I did"],
  ["hizo", "did"],
  ["hecho", "done"],
  ["poder", "can"],
  ["puedo", "I can"],
  ["puedes", "you can"],
  ["puede", "can"],
  ["podemos", "we can"],
  ["pueden", "they can"],
  ["pudo", "could"],
  ["podido", "been able"],
  ["decir", "to say"],
  ["digo", "I say"],
  ["dices", "you say"],
  ["dice", "says"],
  ["dicen", "they say"],
  ["dijo", "said"],
  ["dicho", "said"],
  ["ir", "to go"],
  ["voy", "I go"],
  ["vas", "you go"],
  ["va", "goes"],
  ["vamos", "we go"],
  ["van", "they go"],
  ["fui", "I went"],
  ["fue", "went"],
  ["ido", "gone"],
  ["ver", "to see"],
  ["veo", "I see"],
  ["ves", "you see"],
  ["ve", "sees"],
  ["vemos", "we see"],
  ["ven", "they see"],
  ["vi", "I saw"],
  ["vio", "saw"],
  ["visto", "seen"],
  ["saber", "to know"],
  ["sé", "I know"],
  ["sabes", "you know"],
  ["sabe", "knows"],
  ["sabemos", "we know"],
  ["saben", "they know"],
  ["supo", "knew"],
  ["sabido", "known"],
  ["querer", "to want"],
  ["quiero", "I want"],
  ["quieres", "you want"],
  ["quiere", "wants"],
  ["queremos", "we want"],
  ["quieren", "they want"],
  ["quiso", "wanted"],
  ["querido", "wanted"],
  ["venir", "to come"],
  ["vengo", "I come"],
  ["vienes", "you come"],
  ["viene", "comes"],
  ["venimos", "we come"],
  ["vienen", "they come"],
  ["vino", "came"],
  ["venido", "come"],
  ["poner", "to put"],
  ["pongo", "I put"],
  ["pones", "you put"],
  ["pone", "puts"],
  ["ponemos", "we put"],
  ["ponen", "they put"],
  ["puso", "put"],
  ["puesto", "put"],
  ["salir", "to leave"],
  ["salgo", "I leave"],
  ["sales", "you leave"],
  ["sale", "leaves"],
  ["salimos", "we leave"],
  ["salen", "they leave"],
  ["salió", "left"],
  ["salido", "left"],
  ["dar", "to give"],
  ["doy", "I give"],
  ["das", "you give"],
  ["da", "gives"],
  ["damos", "we give"],
  ["dan", "they give"],
  ["dio", "gave"],
  ["dado", "given"],
  ["hablar", "to speak"],
  ["hablo", "I speak"],
  ["hablas", "you speak"],
  ["habla", "speaks"],
  ["hablamos", "we speak"],
  ["hablan", "they speak"],
  ["habló", "spoke"],
  ["hablado", "spoken"],
  ["necesitar", "to need"],
  ["necesito", "I need"],
  ["necesitas", "you need"],
  ["necesita", "needs"],
  ["necesitamos", "we need"],
  ["necesitan", "they need"],
  ["trabajar", "to work"],
  ["trabajo", "I work"],
  ["trabajas", "you work"],
  ["trabaja", "works"],
  ["trabajamos", "we work"],
  ["trabajan", "they work"],
  ["estudiar", "to study"],
  ["estudio", "I study"],
  ["estudias", "you study"],
  ["estudia", "studies"],
  ["estudiamos", "we study"],
  ["estudian", "they study"],
  ["aprender", "to learn"],
  ["aprendo", "I learn"],
  ["aprendes", "you learn"],
  ["aprende", "learns"],
  ["aprendemos", "we learn"],
  ["aprenden", "they learn"],
  ["comprender", "to understand"],
  ["comprendo", "I understand"],
  ["comprendes", "you understand"],
  ["comprende", "understands"],
  ["comprendemos", "we understand"],
  ["comprenden", "they understand"],
  ["vivir", "to live"],
  ["vivo", "I live"],
  ["vives", "you live"],
  ["vive", "lives"],
  ["vivimos", "we live"],
  ["viven", "they live"],
  ["comer", "to eat"],
  ["como", "I eat"],
  ["comes", "you eat"],
  ["come", "eats"],
  ["comemos", "we eat"],
  ["comen", "they eat"],
  ["tomar", "to take"],
  ["tomo", "I take"],
  ["tomas", "you take"],
  ["toma", "takes"],
  ["tomamos", "we take"],
  ["toman", "they take"],
  ["llevar", "to carry"],
  ["llevo", "I carry"],
  ["llevas", "you carry"],
  ["lleva", "carries"],
  ["llevamos", "we carry"],
  ["llevan", "they carry"],
  ["usar", "to use"],
  ["uso", "I use"],
  ["usas", "you use"],
  ["usa", "uses"],
  ["usamos", "we use"],
  ["usan", "they use"],
  ["ayudar", "to help"],
  ["ayudo", "I help"],
  ["ayudas", "you help"],
  ["ayuda", "helps"],
  ["ayudamos", "we help"],
  ["ayudan", "they help"],
  ["buscar", "to look for"],
  ["busco", "I look for"],
  ["buscas", "you look for"],
  ["busca", "looks for"],
  ["buscamos", "we look for"],
  ["buscan", "they look for"],
  ["encontrar", "to find"],
  ["encuentro", "I find"],
  ["encuentras", "you find"],
  ["encuentra", "finds"],
  ["encontramos", "we find"],
  ["encuentran", "they find"],
  ["llegar", "to arrive"],
  ["llego", "I arrive"],
  ["llegas", "you arrive"],
  ["llega", "arrives"],
  ["llegamos", "we arrive"],
  ["llegan", "they arrive"],
  ["pasar", "to pass"],
  ["paso", "I pass"],
  ["pasas", "you pass"],
  ["pasa", "passes"],
  ["pasamos", "we pass"],
  ["pasan", "they pass"],
  ["dejar", "to leave"],
  ["dejo", "I leave"],
  ["dejas", "you leave"],
  ["deja", "leaves"],
  ["dejamos", "we leave"],
  ["dejan", "they leave"],
  ["llamar", "to call"],
  ["llamo", "I call"],
  ["llamas", "you call"],
  ["llama", "calls"],
  ["llamamos", "we call"],
  ["llaman", "they call"],
  ["comprar", "to buy"],
  ["compro", "I buy"],
  ["compras", "you buy"],
  ["compra", "buys"],
  ["compramos", "we buy"],
  ["compran", "they buy"],
  ["vender", "to sell"],
  ["vendo", "I sell"],
  ["vendes", "you sell"],
  ["vende", "sells"],
  ["vendemos", "we sell"],
  ["venden", "they sell"],
  ["pensar", "to think"],
  ["pienso", "I think"],
  ["piensas", "you think"],
  ["piensa", "thinks"],
  ["pensamos", "we think"],
  ["piensan", "they think"],
  ["creer", "to believe"],
  ["creo", "I believe"],
  ["crees", "you believe"],
  ["cree", "believes"],
  ["creemos", "we believe"],
  ["creen", "they believe"],
  ["mirar", "to look"],
  ["miro", "I look"],
  ["miras", "you look"],
  ["mira", "looks"],
  ["miramos", "we look"],
  ["miran", "they look"],
  ["escuchar", "to listen"],
  ["escucho", "I listen"],
  ["escuchas", "you listen"],
  ["escucha", "listens"],
  ["escuchamos", "we listen"],
  ["escuchan", "they listen"],
  ["escribir", "to write"],
  ["escribo", "I write"],
  ["escribes", "you write"],
  ["escribe", "writes"],
  ["escribimos", "we write"],
  ["escriben", "they write"],
  ["leer", "to read"],
  ["leo", "I read"],
  ["lees", "you read"],
  ["lee", "reads"],
  ["leemos", "we read"],
  ["leen", "they read"],
  ["correr", "to run"],
  ["corro", "I run"],
  ["corres", "you run"],
  ["corre", "runs"],
  ["corremos", "we run"],
  ["corren", "they run"],
  ["jugar", "to play"],
  ["juego", "I play"],
  ["juegas", "you play"],
  ["juega", "plays"],
  ["jugamos", "we play"],
  ["juegan", "they play"],
  ["ganar", "to win"],
  ["gano", "I win"],
  ["ganas", "you win"],
  ["gana", "wins"],
  ["ganamos", "we win"],
  ["ganan", "they win"],
  ["viajar", "to travel"],
  ["viajo", "I travel"],
  ["viajas", "you travel"],
  ["viaja", "travels"],
  ["viajamos", "we travel"],
  ["viajan", "they travel"],
  ["esperar", "to wait"],
  ["espero", "I wait"],
  ["esperas", "you wait"],
  ["espera", "waits"],
  ["esperamos", "we wait"],
  ["esperan", "they wait"],
  ["recordar", "to remember"],
  ["recuerdo", "I remember"],
  ["recuerdas", "you remember"],
  ["recuerda", "remembers"],
  ["recordamos", "we remember"],
  ["recuerdan", "they remember"],
  ["olvidar", "to forget"],
  ["olvido", "I forget"],
  ["olvidas", "you forget"],
  ["olvida", "forgets"],
  ["olvidamos", "we forget"],
  ["olvidan", "they forget"],
  ["conocer", "to know"],
  ["conozco", "I know"],
  ["conoces", "you know"],
  ["conoce", "knows"],
  ["conocemos", "we know"],
  ["conocen", "they know"],
  ["practicar", "to practice"],
  ["practico", "I practice"],
  ["practicas", "you practice"],
  ["practica", "practices"],
  ["practicamos", "we practice"],
  ["practican", "they practice"],
  ["empezar", "to start"],
  ["empiezo", "I start"],
  ["empiezas", "you start"],
  ["empieza", "starts"],
  ["empezamos", "we start"],
  ["empiezan", "they start"],
  ["terminar", "to finish"],
  ["termino", "I finish"],
  ["terminas", "you finish"],
  ["termina", "finishes"],
  ["terminamos", "we finish"],
  ["terminan", "they finish"],
  ["cambiar", "to change"],
  ["cambio", "I change"],
  ["cambias", "you change"],
  ["cambia", "changes"],
  ["cambiamos", "we change"],
  ["cambian", "they change"],
  ["volver", "to return"],
  ["vuelvo", "I return"],
  ["vuelves", "you return"],
  ["vuelve", "returns"],
  ["volvemos", "we return"],
  ["vuelven", "they return"],
  ["pedir", "to ask for"],
  ["pido", "I ask for"],
  ["pides", "you ask for"],
  ["pide", "asks for"],
  ["pedimos", "we ask for"],
  ["piden", "they ask for"],
  ["preguntar", "to ask"],
  ["pregunto", "I ask"],
  ["preguntas", "you ask"],
  ["pregunta", "asks"],
  ["preguntamos", "we ask"],
  ["preguntan", "they ask"],
  ["responder", "to answer"],
  ["respondo", "I answer"],
  ["respondes", "you answer"],
  ["responde", "answers"],
  ["respondemos", "we answer"],
  ["responden", "they answer"],
  ["abrir", "to open"],
  ["abro", "I open"],
  ["abres", "you open"],
  ["abre", "opens"],
  ["abrimos", "we open"],
  ["abren", "they open"],
  ["cerrar", "to close"],
  ["cierro", "I close"],
  ["cierras", "you close"],
  ["cierra", "closes"],
  ["cerramos", "we close"],
  ["cierran", "they close"],
  ["dormir", "to sleep"],
  ["duermo", "I sleep"],
  ["duermes", "you sleep"],
  ["duerme", "sleeps"],
  ["dormimos", "we sleep"],
  ["duermen", "they sleep"],
  ["sentir", "to feel"],
  ["siento", "I feel"],
  ["sientes", "you feel"],
  ["siente", "feels"],
  ["sentimos", "we feel"],
  ["sienten", "they feel"],
  ["seguir", "to follow"],
  ["sigo", "I follow"],
  ["sigues", "you follow"],
  ["sigue", "follows"],
  ["seguimos", "we follow"],
  ["siguen", "they follow"],
  ["entender", "to understand"],
  ["entiendo", "I understand"],
  ["entiendes", "you understand"],
  ["entiende", "understands"],
  ["entendemos", "we understand"],
  ["entienden", "they understand"],
  ["contar", "to tell"],
  ["cuento", "I tell"],
  ["cuentas", "you tell"],
  ["cuenta", "tells"],
  ["contamos", "we tell"],
  ["cuentan", "they tell"],
  ["también", "also"],
  ["más", "more"],
  ["menos", "less"],
  ["muy", "very"],
  ["tan", "so"],
  ["casi", "almost"],
  ["siempre", "always"],
  ["nunca", "never"],
  ["ya", "already"],
  ["todavía", "still"],
  ["aún", "still"],
  ["ahora", "now"],
  ["aquí", "here"],
  ["allí", "there"],
  ["después", "after"],
  ["antes", "before"],
  ["luego", "then"],
  ["entonces", "then"],
  ["hoy", "today"],
  ["ayer", "yesterday"],
  ["mañana", "tomorrow"],
  ["semana", "week"],
  ["mes", "month"],
  ["año", "year"],
  ["día", "day"],
  ["hora", "hour"],
  ["tiempo", "time"],
  ["cosa", "thing"],
  ["cosas", "things"],
  ["gente", "people"],
  ["persona", "person"],
  ["personas", "people"],
  ["mundo", "world"],
  ["casa", "house"],
  ["familia", "family"],
  ["amigo", "friend"],
  ["amiga", "friend"],
  ["amigos", "friends"],
  ["padre", "father"],
  ["madre", "mother"],
  ["hermano", "brother"],
  ["hermana", "sister"],
  ["hijo", "son"],
  ["hija", "daughter"],
  ["hijos", "children"],
  ["niño", "child"],
  ["niña", "child"],
  ["niños", "children"],
  ["nombre", "name"],
  ["número", "number"],
  ["dinero", "money"],
  ["agua", "water"],
  ["comida", "food"],
  ["coche", "car"],
  ["carro", "car"],
  ["trabajo", "job"],
  ["casa", "house"],
  ["libro", "book"],
  ["palabra", "word"],
  ["clase", "class"],
  ["escuela", "school"],
  ["oficina", "office"],
  ["país", "country"],
  ["pais", "country"],
  ["ciudad", "city"],
  ["calle", "street"],
  ["noche", "night"],
  ["tarde", "afternoon"],
  ["mañana", "morning"],
  ["sol", "sun"],
  ["luna", "moon"],
  ["cielo", "sky"],
  ["mar", "sea"],
  ["río", "river"],
  ["rio", "river"],
  ["montaña", "mountain"],
  ["montana", "mountain"],
  ["árbol", "tree"],
  ["arbol", "tree"],
  ["flor", "flower"],
  ["animal", "animal"],
  ["perro", "dog"],
  ["gato", "cat"],
  ["grande", "big"],
  ["pequeño", "small"],
  ["largo", "long"],
  ["corto", "short"],
  ["nuevo", "new"],
  ["viejo", "old"],
  ["joven", "young"],
  ["bueno", "good"],
  ["malo", "bad"],
  ["bonito", "pretty"],
  ["feo", "ugly"],
  ["fácil", "easy"],
  ["difícil", "difficult"],
  ["difícil", "difficult"],
  ["caro", "expensive"],
  ["barato", "cheap"],
  ["importante", "important"],
  ["feliz", "happy"],
  ["triste", "sad"],
  ["cansado", "tired"],
  ["enfermo", "sick"],
  ["contento", "happy"],
  ["seguro", "sure"],
  ["solo", "only"],
  ["juntos", "together"],
  ["todos", "everyone"],
  ["cada", "each"],
  ["otro", "other"],
  ["mismo", "same"],
  ["mucho", "a lot"],
  ["poco", "little"],
  ["todo", "everything"],
  ["algo", "something"],
  ["nada", "nothing"],
  ["alguien", "someone"],
  ["nadie", "no one"],
  ["algunos", "some"],
  ["varios", "several"],
  ["tanto", "so much"],
  ["cuanto", "as much"],
  ["demasiado", "too much"],
  ["bastante", "enough"],
  ["inglés", "English"],
  ["ingles", "English"],
  ["español", "Spanish"],
  ["pronunciación", "pronunciation"],
  ["pronunciacion", "pronunciation"],
  ["confianza", "confidence"],
  ["estudiante", "student"],
  ["estudiantes", "students"],
  ["profesor", "teacher"],
  ["profesora", "teacher"],
  ["viajes", "trips"],
  ["viaje", "trip"],
]);

function translateWithMockProvider(text) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const normalized = trimmed.toLowerCase();
  if (normalized.includes("quiero aprender inglés") || normalized.includes("quiero aprender ingles")) {
    return "I want to learn English because I need to speak with more confidence in my job and when I travel.";
  }
  if (normalized === "hola" || normalized === "hola, buenos días" || normalized === "hola, buenas tardes") {
    return "Hello, my name is Ana. I want to practice English pronunciation.";
  }
  return trimmed
    .split(/(\s+|[,.!?;:]+)/)
    .map((token) => {
      if (/^\s+$/.test(token) || /^[,.!?;:]+$/.test(token)) return token;
      const key = token.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return mockTranslations.get(key) || token;
    })
    .join("")
    .replace(/\bi\b/g, "I")
    .replace(/\benglish\b/gi, "English")
    .replace(/\s+([,.!?;:])/g, "$1");
}

async function translateWithGemini(text, apiKey) {
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY. Consigue una gratis en https://aistudio.google.com/apikey");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Traduce del español al inglés conservando la estructura. Devuelve solo la traducción:\n\n${text}`
              }
            ]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini respondió ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function serveStatic(req, res) {
  const requestedPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  const safePath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = resolve(join(FRONTEND_DIR, safePath));

  if (!filePath.startsWith(FRONTEND_DIR) || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
    return;
  }

  const mime = MIME_TYPES[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  createReadStream(filePath).pipe(res);
}
