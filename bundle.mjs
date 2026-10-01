import fs from 'fs';
import path from 'path';

const dir = 'c:/Users/emeyer/Documents/Work/Teaching/Mechanobiology/F2026/PolymerStatisticalMechanics';

const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf-8');
const indexHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf-8');
let physicsJs = fs.readFileSync(path.join(dir, 'physics.js'), 'utf-8');
let rendererJs = fs.readFileSync(path.join(dir, 'renderer.js'), 'utf-8');
let appJs = fs.readFileSync(path.join(dir, 'app.js'), 'utf-8');

// Strip export/import statements
physicsJs = physicsJs.replace(/export\s+const\s+/g, 'const ')
                     .replace(/export\s+function\s+/g, 'function ')
                     .replace(/export\s+class\s+/g, 'class ');

rendererJs = rendererJs.replace(/export\s+class\s+PolymerRenderer/g, 'class PolymerRenderer')
                       .replace(/export\s+function\s+renderThumbnail/g, 'function renderThumbnail');

appJs = appJs.replace(/import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?/g, '');

const combinedJs = `
// ==========================================
// Bundled Polymer Statistical Mechanics Engine
// ==========================================
${physicsJs}

${rendererJs}

${appJs}
`;

// Replace <link rel="stylesheet" href="style.css"> with <style>...</style> using function replacer to prevent $ substitution
let standaloneHtml = indexHtml.replace(
  '<link rel="stylesheet" href="style.css">',
  () => `<style>\n${css}\n</style>`
);

// Replace <script type="module" src="app.js"></script> with <script>...</script> using function replacer
standaloneHtml = standaloneHtml.replace(
  '<script type="module" src="app.js"></script>',
  () => `<script>\n${combinedJs}\n</script>`
);

fs.writeFileSync(path.join(dir, 'index_standalone.html'), standaloneHtml, 'utf-8');
console.log('Successfully generated index_standalone.html');
