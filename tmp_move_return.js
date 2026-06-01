const fs = require('fs');
const path = 'domains/operations/clients/client-detail-page.tsx';
let text = fs.readFileSync(path, 'utf8');
const start = text.indexOf('  return (');
const endMarker = '  const handleContactDelete';
const next = text.indexOf(endMarker, start);
if (start === -1 || next === -1) {
  throw new Error('markers not found');
}
const block = text.slice(start, next);
text = text.slice(0, start) + text.slice(next);
text = text.trimEnd();
if (!text.endsWith('}')) {
  text += '\n';
}
text += '\n' + block.trimEnd() + '\n';
fs.writeFileSync(path, text);
