# Especificación funcional resumida implementada en el prototipo

## Objetivo
Aplicación web para hablantes nativos de español que desean practicar inglés mediante traducción, lectura guiada y retroalimentación de pronunciación.

## Principios técnicos
- La aplicación no depende de una inteligencia artificial concreta.
- El frontend puede funcionar en modo demo local.
- El backend permite conectar proveedores de IA mediante adaptadores.
- Los servicios de traducción, reconocimiento de voz, análisis fonético y generación de voz pueden sustituirse por otros proveedores compatibles.

## Funciones incluidas en el MVP
- Entrada de texto en español.
- Traducción al inglés mediante proveedor configurable.
- Visualización de pronunciación simplificada por palabra.
- Lectura guiada tipo karaoke.
- Solicitud de permisos de micrófono.
- Grabación de audio del estudiante.
- Transcripción mediante Web Speech API cuando el navegador lo permite.
- Evaluación palabra por palabra mediante coincidencia aproximada.
- Marcado visual de palabras correctas e incorrectas.
- Selección manual de palabras para revisión individual.
- Visualización de forma de onda para las palabras seleccionadas.
- Reproducción de ejemplo correcto con voz sintética.
- Preferencia de voz por sexo/perfil vocal del estudiante, según voces disponibles en el navegador.
- Resumen final de resultados.

## Limitaciones conscientes del MVP
- La evaluación fonética real debe conectarse a un proveedor especializado o a un modelo propio.
- La forma de onda se calcula de forma aproximada por posición de palabra dentro de la grabación. En producción debería usarse alineación temporal palabra-audio.
- La similitud de voz no clona la voz del estudiante. Solo ajusta voz disponible, pitch y ritmo de forma aproximada.
- El token de API no debe exponerse en frontend en producción. Para uso real debe gestionarse desde el backend.
