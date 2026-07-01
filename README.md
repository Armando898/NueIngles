# English Pronunciation Coach

Prototipo de aplicación web para enseñar inglés a hablantes nativos de español. Permite traducir texto, mostrar pronunciación palabra por palabra, practicar lectura tipo karaoke, grabar la voz del estudiante y revisar palabras seleccionadas con forma de onda.

## Qué incluye

- Frontend en HTML, CSS y JavaScript sin framework.
- Backend Node.js sin dependencias externas.
- Arquitectura modular para conectar distintos proveedores de IA.
- Modo demo local sin claves API.
- Adaptador backend para proveedores compatibles con `/chat/completions`.
- Adaptador genérico REST.
- Grabación de micrófono en navegador.
- Lectura guiada tipo karaoke.
- Evaluación aproximada palabra por palabra.
- Visualización de forma de onda para la palabra seleccionada.
- Ejemplos de pronunciación con voz sintética del navegador.

## Cómo ejecutarlo

### Opción 1: abrir solo el frontend

Abre este archivo en el navegador:

```txt
frontend/index.html
```

Funciona en modo demo local. Algunas funciones de micrófono pueden requerir servir la página desde `localhost` en vez de abrir el archivo directamente.

### Opción 2: ejecutar con backend local

Requisitos: Node.js 18 o superior.

```bash
cd backend
npm start
```

Después abre:

```txt
http://localhost:5173
```

## Configurar proveedor de IA

El sistema está pensado para no depender de una IA específica. Puedes configurar el proveedor desde variables de entorno.

Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

La versión actual lee variables de entorno del sistema. Puedes establecerlas antes de iniciar el servidor.

### Modo demo

```bash
AI_PROVIDER=mock npm start
```

### Proveedor compatible con OpenAI Chat Completions

```bash
AI_PROVIDER=openai-compatible \
OPENAI_COMPATIBLE_BASE_URL=https://api.example.com/v1 \
OPENAI_COMPATIBLE_API_KEY=tu_api_key \
OPENAI_COMPATIBLE_MODEL=tu_modelo \
npm start
```

### Proveedor REST genérico

El endpoint debe aceptar:

```json
{
  "task": "translate_es_en",
  "input": "texto en español"
}
```

Y devolver alguno de estos campos:

```json
{
  "translation": "English translation"
}
```

También acepta `output` o `text` como campo de respuesta.

```bash
AI_PROVIDER=generic-rest \
GENERIC_AI_TRANSLATE_ENDPOINT=https://api.example.com/translate \
GENERIC_AI_API_KEY=tu_api_key \
npm start
```

## Estructura

```txt
english-pronunciation-ai/
├── frontend/
│   ├── index.html
│   └── src/
│       ├── app.js
│       ├── audio.js
│       ├── providers.js
│       ├── styles.css
│       └── waveform.js
├── backend/
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── docs/
    └── especificacion.md
```

## Decisiones importantes

### Independencia de IA

La aplicación utiliza una capa de proveedores. El frontend puede usar:

- `mock`: demo local.
- `backend`: endpoint local `/api/translate`.
- `generic`: API personalizada desde el frontend.

En producción, lo recomendable es usar `backend`, porque las claves de IA no deben exponerse en el navegador.

### Voz del mismo sexo o perfil vocal

El prototipo intenta seleccionar una voz inglesa disponible en el navegador según el perfil elegido por el estudiante: femenino, masculino o neutro. Esta selección depende de las voces instaladas en el sistema operativo y navegador.

No se clona la voz del estudiante. Para cumplir privacidad y seguridad, cualquier adaptación avanzada de voz debería requerir consentimiento explícito.

### Forma de onda de palabras seleccionadas

La forma de onda se muestra únicamente cuando el estudiante selecciona una palabra. En este MVP el segmento de audio se estima por posición. Una versión avanzada debería usar forced alignment o un proveedor de IA que devuelva timestamps por palabra/fonema.

## Siguientes pasos recomendados

1. Sustituir la evaluación aproximada por un proveedor real de pronunciation assessment.
2. Añadir timestamps por palabra para que la forma de onda sea exacta.
3. Añadir análisis fonema por fonema.
4. Guardar historial de prácticas por usuario.
5. Añadir autenticación.
6. Añadir panel docente para seguimiento de estudiantes.
7. Añadir tests automáticos.
