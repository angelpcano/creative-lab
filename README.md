# Creative Lab

Editor gráfico para crear y adaptar piezas visuales, construido con React, TypeScript, Vite y Fabric.js.

## Desarrollo local

```sh
npm install
npm run dev
```

## Funcionalidades actuales

- Dashboard local para crear, abrir, renombrar, duplicar, exportar y eliminar proyectos.
- Guardado automático en IndexedDB de documentos, miniaturas e imágenes importadas.
- Lienzo con formatos predefinidos y dimensiones personalizadas.
- Añadir y editar texto, formas e imágenes locales.
- Panel de capas para seleccionar, reordenar, renombrar, ocultar, bloquear, duplicar y eliminar elementos.
- Propiedades de posición, tamaño, rotación, opacidad, color y borde; controles tipográficos y recorte básico de imágenes.
- Deshacer/rehacer, copiar/pegar, agrupar/desagrupar y herramientas de alineación.
- Zoom, ajuste a pantalla, cuadrícula y ajuste magnético.
- Cambio de fondo y exportación PNG, JPG, SVG y PDF.
- Importación y exportación de proyectos portables `.clab`, con recursos incluidos.
- Modo claro/oscuro con control accesible en dashboard y editor; la preferencia se conserva localmente.

## Arquitectura del editor

- `src/domain/designDocument.ts` define el documento Creative Lab versionado, sus dimensiones, fondo, elementos, capas, recursos y metadatos. No depende de Fabric.js.
- `src/editor/engine/EditorEngine.ts` declara el contrato de operaciones y el estado que consume la interfaz.
- `src/editor/engine/FabricDocumentAdapter.ts` convierte el lienzo Fabric a ese modelo propio. El JSON interno de Fabric solo se usa para el historial local, no como formato de proyecto.
- `src/editor/components/` contiene la barra de herramientas y los paneles; `src/editor/hooks/` coordina el estado React del editor.
- `src/App.tsx` compone la aplicación y conecta la interfaz con la API del editor.
- `src/projects/` separa el dashboard, el ciclo de vida de proyectos, el repositorio IndexedDB y los paquetes portables.
- `src/editor/export/` contiene la exportación PDF independiente del componente de interfaz.

Los proyectos y recursos se guardan en este dispositivo; no hay backend ni sincronización entre equipos. Las plantillas, cuentas y funciones de IA todavía no están implementadas.

## Validación

```sh
npm run build
npm run lint
```

## Despliegue en GitHub Pages

Cada push a `main` ejecuta la compilación y publica `dist/` en GitHub Pages. El sitio usa la ruta base `/creative-lab/`.
