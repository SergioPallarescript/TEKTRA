## Plan

Voy a corregir el dictado por voz en los tres puntos afectados: Libro de Órdenes, Libro de Incidencias y Cerebro de Obra.

### 1. Unificar la lógica de reconocimiento de voz
- Crear una lógica compartida para el dictado en móvil/tablet en lugar de mantener tres implementaciones distintas.
- Sustituir el patrón actual por uno estable basado en:
  - texto final confirmado
  - texto provisional/intermedio separado
  - bandera explícita de reinicio controlado
  - parada limpia al pulsar “Parar”
- Mantener siempre `lang = "es-ES"`.

### 2. Eliminar la causa principal de la duplicación
- Corregir el flujo de `IncidentsModule`, que ahora recompone el texto desde `event.results` completo en cada callback y por eso duplica frases en móviles.
- Revisar `OrdersModule` y `BrainModule` para evitar que resultados intermedios y reinicios automáticos vuelvan a inyectar texto ya reconocido.
- Añadir deduplicación ligera de segmentos consecutivos repetidos, pensada para los casos típicos de móviles/tablets donde el navegador repite palabras o fragmentos muy próximos.

### 3. Separar dictado en vivo de edición manual
- Evitar que el texto provisional del micrófono machaque continuamente el `Textarea` mientras el usuario dicta.
- Mostrar el texto provisional como vista en vivo independiente y pasar al campo editable solo el texto final confirmado.
- Así el usuario podrá revisar y editar el contenido sin esperar a la reestructuración por IA.

### 4. Ajustar el comportamiento específico en móvil/tablet
- Hacer el reconocimiento más conservador en dispositivos móviles:
  - controlar mejor el auto-reinicio
  - evitar bucles de reinicio inestables
  - tolerar `no-speech` y `aborted` sin romper el estado
- Si hace falta, usar un modo “solo resultados finales” en móvil para priorizar estabilidad frente a inmediatez visual.

### 5. Mantener intacta la reestructuración con IA
- No cambiar el flujo funcional de “Reestructurar IA” / `clean-dictation`.
- Solo asegurar que el texto que llega a IA ya no llegue contaminado por repeticiones generadas por el reconocimiento de voz.

### 6. Verificación
- Probar los tres módulos con foco en móvil/tablet y comprobar:
  - que no se repiten palabras ni frases
  - que no se entremezclan segmentos
  - que el botón de parar realmente detiene el dictado
  - que el usuario puede editar el texto antes de reestructurarlo
  - que el Cerebro de Obra sigue permitiendo dictar consultas de forma estable

## Hallazgos ya confirmados
- `IncidentsModule` tiene una causa clara de duplicación: concatena todos los resultados de voz en cada evento, incluido contenido ya emitido antes.
- `OrdersModule` y `BrainModule` ya intentan separar resultados finales e intermedios, pero siguen escribiendo texto dictado en el mismo campo editable y mantienen una lógica de reinicio que en móvil puede seguir generando inestabilidad visual y repeticiones parciales.
- No hay evidencia de que el problema venga de la IA de limpieza; el origen está antes, en la captura/transcripción de voz del navegador.

## Detalles técnicos
- Archivos a tocar:
  - `src/pages/OrdersModule.tsx`
  - `src/pages/IncidentsModule.tsx`
  - `src/pages/BrainModule.tsx`
  - posiblemente una nueva utilidad compartida en `src/lib/` o un hook en `src/hooks/`
- En móvil priorizaré robustez del reconocimiento sobre mostrar cada cambio intermedio del navegador.
- No hace falta tocar base de datos ni backend para esta corrección.
- La IA seguirá funcionando solo en español y sobre el texto final depurado.

Cuando apruebes, lo implemento.