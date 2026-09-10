import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm,readdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {runCli} from '../src/cli.js';
let setup,host;
try{setup=await import('../src/setup.js');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
try{host=await import('../src/browser-host.js');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
const sourceRepo=fileURLToPath(new URL('../',import.meta.url));
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'cra-setup-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const sourceRoot=join(root,'source');await mkdir(sourceRoot);
 for(const f of ['package.json','bin','src','scripts','templates','rigor','README.md','LICENSE']) await cp(join(sourceRepo,f),join(sourceRoot,f),{recursive:true});
 return {root,sourceRoot,prefix:join(root,'install'),profilePath:join(root,'profile'),platform:process.platform,topology:'local',components:{}};
}
test('setup plan CLI reports missing prerequisites without creating runtime or launching browser',async t=>{
 const f=await fixture(t),components=join(f.root,'components.json'),planFile=join(f.root,'plan.json');await writeFile(components,'{}');
 let output='';await runCli(['setup','plan','--prefix',f.prefix,'--source',f.sourceRoot,'--platform',f.platform,'--topology','local','--components',components,'--profile',f.profilePath,'--plan-output',planFile,'--json'],{stdout:{write:s=>{output+=s;}}});
 const plan=JSON.parse(await readFile(planFile,'utf8'));assert.equal(plan.schema,'research.setup-plan.v1');assert.ok(plan.missing_prerequisites.length>0);
 assert.ok(JSON.parse(output));await assert.rejects(readdir(f.prefix),{code:'ENOENT'});await assert.rejects(readdir(f.profilePath),{code:'ENOENT'});
});
test('setup plan is read-only, rejects unsupported topology and source symlink escape', {skip:!setup?'S1 setup absent':false},async t=>{
 const f=await fixture(t);const before=(await readdir(f.root)).sort();const plan=await setup.planSetup(f);assert.equal(plan.schema,'research.setup-plan.v1');assert.deepEqual((await readdir(f.root)).sort(),before);
 await assert.rejects(setup.planSetup({...f,platform:'darwin',topology:'remote-mac'}));
 await symlink(join(f.root,'outside'),join(f.sourceRoot,'bin','escape'));await assert.rejects(setup.planSetup(f));
});
test('installer rejects stale source and unknown destination, and reruns preserve matching installed bytes', {skip:!setup?'S1 setup absent':false},async t=>{
 const f=await fixture(t),plan=await setup.planSetup(f),sourceFile=join(f.sourceRoot,'README.md'),bytes=await readFile(sourceFile);
 await writeFile(sourceFile,'changed after plan');await assert.rejects(setup.applySetup({plan}));await writeFile(sourceFile,bytes);
 await mkdir(join(f.prefix,'app'),{recursive:true});await writeFile(join(f.prefix,'app','README.md'),'unknown user file');await assert.rejects(setup.applySetup({plan}));assert.equal(await readFile(join(f.prefix,'app','README.md'),'utf8'),'unknown user file');
 const other={...f,prefix:join(f.root,'clean-install')},cleanPlan=await setup.planSetup(other);
 const result=await setup.applySetup({plan:cleanPlan});assert.ok(['installed','pending-prerequisite','pending-human'].includes(result.status));
 const installed=await readFile(join(other.prefix,'app','bin','chatgpt-research.js'));assert.ok(installed.length>0);
 await setup.applySetup({plan:cleanPlan});assert.deepEqual(await readFile(join(other.prefix,'app','bin','chatgpt-research.js')),installed);
});
test('uninstall retains profile/history and refuses drift instead of deleting unknown edits', {skip:!setup?'S1 setup absent':false},async t=>{
 const f=await fixture(t),plan=await setup.planSetup(f);await setup.applySetup({plan});await mkdir(f.profilePath);await writeFile(join(f.profilePath,'sentinel'),'keep login');
 const path=join(f.prefix,'app','README.md');await writeFile(path,'user-edited installed file');
 const uninstall=await setup.planUninstall({prefix:f.prefix});await assert.rejects(setup.applyUninstall({plan:uninstall}));
 assert.equal(await readFile(path,'utf8'),'user-edited installed file');assert.equal(await readFile(join(f.profilePath,'sentinel'),'utf8'),'keep login');
});
