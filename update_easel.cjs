const fs = require('fs');
let code = fs.readFileSync('src/components/EaselBoard.ts', 'utf8');

code = code.replace(/      \n      window.removeEventListener/g, '      window.removeEventListener');
code = code.replace(/      \n      window.addEventListener/g, '      window.addEventListener');

fs.writeFileSync('src/components/EaselBoard.ts', code);
