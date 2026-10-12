import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = readdirSync('src/components').filter(name => name.endsWith('.tsx')).map(name => join('src/components', name));
files.push('src/App.tsx');
const findings = [];
let total = 0;
for (const file of files) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = node => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'button') {
      total++;
      const attrs = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.text, attribute]));
      let parent = node.parent;
      let inForm = false;
      while (parent) {
        if ((ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) && parent.openingElement?.tagName?.getText(source) === 'form') { inForm = true; break; }
        parent = parent.parent;
      }
      const type = attrs.get('type')?.initializer?.getText(source).replaceAll('"', '').replaceAll("'", '');
      if (!attrs.has('onClick') && type !== 'submit' && !(type === undefined && inForm)) {
        findings.push(`${file}:${source.getLineAndCharacterOfPosition(node.pos).line + 1} button lacks an action`);
      }
      if (type === 'submit' && !inForm && !attrs.has('form')) findings.push(`${file}:${source.getLineAndCharacterOfPosition(node.pos).line + 1} submit button has no form`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
console.log(`Audited ${total} button elements across ${files.length} TSX files.`);
console.log(findings.join('\n') || 'No actionless buttons found.');
if (findings.length) process.exitCode = 1;
