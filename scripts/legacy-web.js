// Übersetzt das Web-Bundle nach dem Export in älteres JavaScript.
// Grund: Ältere Android-WebViews (z. B. Fire-Tablets mit Fire OS 7 in Fully Kiosk)
// kennen ?. ?? ??= und Klassenfelder nicht und zeigen sonst nur eine weiße Seite.
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const dir = path.join(__dirname, '..', 'dist', '_expo', 'static', 'js', 'web');
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
  const file = path.join(dir, f);
  const src = fs.readFileSync(file, 'utf8');
  const out = babel.transformSync(src, {
    babelrc: false, configFile: false, compact: true, comments: false, sourceType: 'script',
    assumptions: { setPublicClassFields: true, privateFieldsAsProperties: true },
    plugins: [
      '@babel/plugin-transform-optional-chaining',
      '@babel/plugin-transform-nullish-coalescing-operator',
      '@babel/plugin-transform-logical-assignment-operators',
      '@babel/plugin-transform-class-properties',
      '@babel/plugin-transform-private-methods',
      '@babel/plugin-transform-optional-catch-binding',
    ],
  });
  fs.writeFileSync(file, out.code);
  console.log(`legacy-web: ${f} ${Math.round(src.length / 1024)} → ${Math.round(out.code.length / 1024)} KB`);
}
