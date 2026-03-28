const fs = require('fs');
let c = fs.readFileSync('src/services/orchestrator.ts', 'utf8');
c = c.replace(/\\\\n/g, '\\n')
     .replace(/\\\\`/g, '`')
     .replace(/\\\\\\$/g, '$');
fs.writeFileSync('src/services/orchestrator.ts', c);
console.log("Done");
