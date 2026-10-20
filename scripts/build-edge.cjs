const { build } = require('esbuild');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'supabase/functions/cavalaria-api/index.ts')],
  outfile: path.join(root, 'dist/cavalaria-api/index.ts'),
  tsconfigRaw: {},
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'none',
}).catch(() => { process.exitCode = 1; });
