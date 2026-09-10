import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {planSetup,applySetup,planUninstall,applyUninstall} from '../src/setup.js';
import {acquireServiceLock,checkStopRequested} from '../src/runtime-service.js';
const sourceRepo=fileURLToPath(new URL('../',import.meta.url));
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'cra-setup-review-'));t.after(()=>rm(root,{recursive:true,force:true}));const sourceRoot=join(root,'source');await mkdir(sourceRoot);for(const f of ['package.json','bin','src','scripts','templates','rigor','README.md','LICENSE'])await cp(join(sourceRepo,f),join(sourceRoot,f),{recursive:true});return{root,sourceRoot,prefix:join(root,'install'),profilePath:join(root,'profile'),platform:process.platform,topology:'local',components:{}};}
test('uninstall cannot expand a plan to delete outside installed inventory',async t=>{const f=await fixture(t);await applySetup({plan:await planSetup(f)});const victim=join(f.root,'unrelated.txt');await writeFile(victim,'keep');const plan=await planUninstall({prefix:f.prefix});plan.files.push('../../unrelated.txt');await assert.rejects(applyUninstall({plan}));assert.equal(await readFile(victim,'utf8'),'keep');});
test('malformed existing service ownership is preserved and refused',async t=>{const f=await fixture(t),lock=join(f.root,'service.lock');await writeFile(lock,'broken owner record');let got;try{got=await acquireServiceLock(f.root,'config');}catch{}if(got)await got.release();assert.equal(got,undefined,'cannot replace unknown owner');assert.equal(await readFile(lock,'utf8'),'broken owner record');});
test('stale stop nonce cannot stop a different service generation',async t=>{const f=await fixture(t),lock=await acquireServiceLock(f.root,'config');t.after(()=>lock.release());await writeFile(join(f.root,'service.stop'),JSON.stringify({schema:'research.service-stop.v1',nonce:'other-service',requested_at:Date.now()}));assert.equal(await checkStopRequested(f.root),false);});
