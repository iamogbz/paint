const fs = require('fs');
let code = fs.readFileSync('src/components/EaselBoard.ts', 'utf8');

// 1. Remove window.addEventListener("easel-zoom-reset", this.resetZoom);
code = code.replace(/window\.addEventListener\("easel-zoom-reset", this\.resetZoom\);\n?/g, '');

// 2. Remove window.removeEventListener("easel-zoom-reset", this.resetZoom);
code = code.replace(/window\.removeEventListener\("easel-zoom-reset", this\.resetZoom\);\n?/g, '');

// 3. Remove private resetZoom = () => { ... };
const resetRegex = /\s*private resetZoom = \(\) => {[\s\S]*?this\.updateTransformStyle\(\);\n\s*};\n/g;
code = code.replace(resetRegex, '');

fs.writeFileSync('src/components/EaselBoard.ts', code);
console.log("Updated EaselBoard.");
