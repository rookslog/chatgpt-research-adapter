import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {runCli} from '../src/cli.js';
import {planSetup,applySetup,planUninstall,applyUninstall} from '../src/setup.js';
import {acquireServiceLock,checkStopRequested} from '../src/runtime-service.js';
const sourceRepo=fileURLToPath(new URL('../',import.meta.url));
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'cra-setup-review-'));t.after(()=>rm(root,{recursive:true,force:true}));const sourceRoot=join(root,'source');await mkdir(sourceRoot);for(const f of ['package.json','bin','src','scripts','templates','rigor','README.md','LICENSE'])await cp(join(sourceRepo,f),join(sourceRoot,f),{recursive:true});return{root,sourceRoot,prefix:join(root,'install'),profilePath:join(root,'profile'),platform:process.platform,topology:'local',components:{}};}

test('installer and uninstaller preserve an unknown edited CLI wrapper',async t=>{
 const f=await fixture(t);await mkdir(join(f.prefix,'bin'),{recursive:true});const wrapper=join(f.prefix,'bin','chatgpt-research');await writeFile(wrapper,'user program');
 await assert.rejects(applySetup({plan:await planSetup(f)}));assert.equal(await readFile(wrapper,'utf8'),'user program');
 const g={...f,prefix:join(f.root,'other-install')};await applySetup({plan:await planSetup(g)});const installed=join(g.prefix,'bin','chatgpt-research');await writeFile(installed,'edited wrapper');
 const un=await planUninstall({prefix:g.prefix});await assert.rejects(applyUninstall({plan:un}));assert.equal(await readFile(installed,'utf8'),'edited wrapper');
});
test('installer refuses a destination symlink before writing through it',async t=>{
 const f=await fixture(t),outside=join(f.root,'unrelated');await mkdir(outside);await mkdir(f.prefix);await symlink(outside,join(f.prefix,'app'));
 await assert.rejects(applySetup({plan:await planSetup(f)}));await assert.rejects(readFile(join(outside,'package.json')));
});
test('setup help is successful and non-effectful at family and command level',async()=>{
 for(const argv of [['setup','--help'],['setup','apply','--help']]){let output='';await runCli(argv,{stdout:{write:s=>{output+=s;}}});assert.match(output,/setup.*plan/s);}
});
