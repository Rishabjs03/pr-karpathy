import { readFileSync, writeFileSync } from 'node:fs';
import { compileFlowToMermaid } from '@lucidiff/core';
const file = 'fixtures/sample-document.json';
const doc = JSON.parse(readFileSync(file, 'utf8'));
doc.flow.mermaid = compileFlowToMermaid(doc.flow);
writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
console.log(doc.flow.mermaid.split('\n')[0]);
