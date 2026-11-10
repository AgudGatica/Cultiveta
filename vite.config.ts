import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

// Librerías en archivos propios (vendor-*): cambian solo cuando se las actualiza, así que el celular las guarda
// entre publicaciones y con cada versión nueva baja solo el código de Cultiveta. Las de React y Firebase se usan
// desde que abre la app y se bajan siempre al entrar: no sumarles librerías que solo usan pantallas que se abren
// después (como motion), porque se bajarían al abrir.
const VENDOR_CHUNKS: Array<[name: string, test: RegExp]> = [
  ['vendor-react', /\/node_modules\/(react|react-dom|scheduler|react-router)\//],
  ['vendor-firebase', /\/node_modules\/(firebase\/(app|auth|storage)|@firebase\/(app|auth|storage|component|logger|util)|idb)\//],
  ['vendor-firestore', /\/node_modules\/(firebase\/firestore|@firebase\/(firestore|webchannel-wrapper))\//],
  // Lo trae Firestore para las consultas "pipeline" con regex (Cultiveta no las usa); aparte, para no pasar los 500 kB
  ['vendor-re2js', /\/node_modules\/re2js\//],
  // Animaciones (festejos, línea de tiempo): solo se bajan cuando se abre algo que las usa
  ['vendor-motion', /\/node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//],
  // Catálogo de ~1.100 genéticas: en su propio archivo, que el navegador guarda aparte y no cambia con cada versión
  ['catalogo-geneticas', /\/src\/data\/predefinedGenetics\.ts$/],
];

function vendorChunk(id: string): string | undefined {
  const file = id.replace(/\\/g, '/');
  return VENDOR_CHUNKS.find(([, test]) => test.test(file))?.[0];
}

// Aviso si un archivo pasa los 500 kB, como el de Vite, salvo heic2any (~1,3 MB): convierte fotos HEIC del
// iPhone y se baja solo cuando hace falta. Por eso el límite propio de Vite queda más alto.
const CHUNK_WARNING_KB = 500;
function chunkSizeWarning(): Plugin {
  return {
    name: 'cultiveta-chunk-size',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || chunk.name === 'heic2any') continue;
        const kb = Buffer.byteLength(chunk.code) / 1000;
        if (kb > CHUNK_WARNING_KB) {
          this.warn(`${chunk.fileName} pesa ${Math.round(kb)} kB (más de ${CHUNK_WARNING_KB} kB): conviene partirlo con import() o en VENDOR_CHUNKS.`);
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), chunkSizeWarning()],
    build: {
      chunkSizeWarningLimit: 1400,
      rollupOptions: {
        output: {
          manualChunks: vendorChunk,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
