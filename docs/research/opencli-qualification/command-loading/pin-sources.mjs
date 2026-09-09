// Maintainer pin-generation receipt helper; not called by run.mjs. Review new bytes before accepting pins.
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=process.argv[2]; if(!root) throw Error('Supply existing OpenCLI root');
const actual=['main.js','discovery.js','cli.js','commanderAdapter.js','execution.js','runtime.js','capabilityRouting.js','registry-api.js','registry.js','hooks.js','errors.js','package-paths.js','version.js','runtime-detect.js','constants.js','help.js','serialization.js','cli-argv-preprocess.js','browser/config.js'].map(x=>'dist/src/'+x);
const files=new Set(['package.json',...actual]);
for(const name of actual){const s=fs.readFileSync(path.join(root,name),'utf8');for(const m of s.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)){files.add(path.normalize(path.join(path.dirname(name),m[1])));}}
const dep=path.dirname(createRequire(path.join(root,'package.json')).resolve('commander'));
const sources={}; const hash=b=>createHash('sha256').update(b).digest('hex');
for(const name of [...files].sort())sources[name]=hash(fs.readFileSync(path.join(root,name)));
for(const name of ['package.json','index.js',...fs.readdirSync(path.join(dep,'lib')).filter(x=>x.endsWith('.js')).map(x=>'lib/'+x)])sources['commander/'+name]=hash(fs.readFileSync(path.join(dep,name)));
fs.writeFileSync(path.join(dir,'SOURCE-PINS.json'),JSON.stringify({opencliVersion:'1.8.7',executedOpenCliAllowlist:actual,commandSha256:hash(fs.readFileSync(path.join(dir,'refusal-command.js'))),sources},null,2)+'\n');
