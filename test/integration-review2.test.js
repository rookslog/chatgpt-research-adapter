import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {planSetup,applySetup,planUninstall,applyUninstall} from '../src/setup.js';
import {executeStandardCommand,collectStandardResult} from '../src/standard-runtime.js';
import {mkdtemp,mkdir,readFile,writeFile,rm,chmod,stat} from 'node:fs/promises';
import { tmpdir as nativeTestTmpdir } from 'node:os';
import { realpathSync as canonicalTestPath } from 'node:fs';
const tmpdir = () => canonicalTestPath(nativeTestTmpdir());
import {join} from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runCli} from '../src/cli.js';
import {initializeStandardRuntime,inspectStandardRuntime,dispatchNextStandard} from '../src/standard-runtime.js';
import {prepareResearchJob} from '../src/prepare.js';
import {submitPreparedJobOnce} from '../src/submit-once.js';
let cfg,binding,service,events;
for(const name of ['runtime-config','caller-binding','runtime-service','runtime-events']){
  try{const m=await import(`../src/${name}.js`);if(name==='runtime-config')cfg=m;if(name==='caller-binding')binding=m;if(name==='runtime-service')service=m;if(name==='runtime-events')events=m;}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
}
async function temp(t){const root=await mkdtemp(join(tmpdir(),'cra-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
function sink(){let text='';return{write:s=>{text+=s;},read:()=>text};}

async function configuration(t){
 const root=await temp(t),contentRoot=join(root,'content'),registryRoot=join(root,'registry'),packageRoot=join(root,'opencli');
 await mkdir(contentRoot);await mkdir(registryRoot);await mkdir(join(packageRoot,'dist/src/browser'),{recursive:true});
 await writeFile(join(packageRoot,'package.json'),JSON.stringify({name:'@jackwener/opencli',version:'1.8.7',type:'module'}));
 const files={};for(const f of ['dist/src/browser/daemon-transport.js','dist/src/constants.js','dist/src/daemon.js']){const b='export const syntheticFixture=true;\n';await writeFile(join(packageRoot,f),b);files[f]=createHash('sha256').update(b).digest('hex');}
 const init=await initializeStandardRuntime({root:join(root,'rt')});const runtime={root:join(root,'rt'),epoch:init.runtime_epoch};
 const args={configPath:join(root,'runtime.json'),runtime,contentRoot,packageRoot,sourceIdentity:{packageName:'@jackwener/opencli',version:'1.8.7',bridgeVersion:'1.0.23',files},contextId:'ctx',hostId:'host',registryRoot};
 await cfg.configureRuntime(args);return {root,args,config:await cfg.readRuntimeConfig(args.configPath)};
}
async function admission(w){
 const outputRoot=join(w.root,'prepared');const job=await prepareResearchJob({outputRoot,templatesRoot:fileURLToPath(new URL('../templates/',import.meta.url)),request:{question:'Separate research job',mode:'standard',template_id:'research-question',template_version:'1.0.0',model_family:'gpt-5.6-pro',effort:'standard'}});
 return submitPreparedJobOnce({outputRoot,jobId:job.job_id,runtime:w.config.runtime,requestKey:'admit',context:{authorize:()=>true}});
}


import {spawn} from 'node:child_process';
import * as browserHost from '../src/browser-host.js';
import {humanControlActive} from '../src/human-control.js';

async function hostFixture(t){
 const w=await configuration(t),components=join(w.root,'components'),children=[];await mkdir(components,{mode:0o700});
 const executable=join(components,'fixture-backend');await writeFile(executable,'#!/usr/bin/env node\nsetInterval(()=>{},1000);\n',{mode:0o700});await chmod(executable,0o700);
 const bridge=join(components,'bridge'),html=join(components,'html');await mkdir(bridge);await mkdir(html);
 w.config={...w.config,browserHost:{platform:'linux',topology:'ssh-linux',profilePath:join(w.root,'profile'),display:':251',socketPath:join(w.root,'sockets'),viewer:{host:'127.0.0.1',port:18799,secretPath:join(w.root,'private-viewer','password')},components:{chrome:executable,xpra:executable,xvfb:executable,xpraHtml:html,bridge}}};
 let calls=0;const spawnImpl=(file,args,opts)=>{calls++;const child=spawn(file,args,opts);children.push(child);return child;};
 t.after(async()=>{for(const child of children){if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>{const timer=setTimeout(resolve,1000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}}});
 return {...w,spawnImpl,calls:()=>calls};
}

const exec=promisify(execFile);
const accepting={authorize:()=>true,deliveryReady:()=>true,random:()=>0,clock:{now:()=>100000,sleep:async()=>{}}};
async function admitAt(w,key){const outputRoot=join(w.root,key);await mkdir(outputRoot);const job=await prepareResearchJob({outputRoot,templatesRoot:fileURLToPath(new URL('../templates/',import.meta.url)),request:{question:key,mode:'standard',template_id:'research-question',template_version:'1.0.0',model_family:'gpt-5.6-pro',effort:'standard'}});const r=await submitPreparedJobOnce({outputRoot,jobId:job.job_id,runtime:w.config.runtime,requestKey:key,context:{authorize:()=>true}});await binding.activateObserver({config:w.config,operationRef:r.operation_ref,observerId:key,generation:'g',ttlMs:60000,clock:accepting.clock});return r;}
const ready=async()=>({status:'ready',target:'owned',evidenceRef:'fixture-prep'});
const sent=async()=>({status:'accepted',binding:{conversationId:'c',userMessageId:'u'},evidenceRef:'fixture-send'});
test('all held preparations notify their own active caller, even when another operation dispatches',async t=>{
 for(const dispatchOther of [false,true]){
  const w=await configuration(t),a=await admitAt(w,'first'),b=await admitAt(w,'second');
  const driver={prepare:async op=>dispatchOther&&op.operation_ref===b.operation_ref?ready():({status:'held',reason:'signed_out'}),send:sent};
  await service.runRuntimeCycle({config:w.config,context:accepting,driver});await service.runRuntimeCycle({config:w.config,context:accepting,driver});
  for(const r of dispatchOther?[a]:[a,b]){const e=await events.readOperationEvents({config:w.config,operationRef:r.operation_ref});assert.equal(e.filter(x=>x.type==='preparation.attention').length,1,'each held caller receives one attention');}
 }
});
test('owned backend can restart after a definitively exited fixture process without deleting profile',async t=>{
 const w=await hostFixture(t);const first=await browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl});await browserHost.authCheck({config:w.config,transport:{probeAuth:async()=>({signedIn:true,contextId:w.config.browser.contextId})}});
 await mkdir(w.config.browserHost.profilePath,{recursive:true});const marker=join(w.config.browserHost.profilePath,'retained');await writeFile(marker,'keep login data fixture');
 process.kill(first.backend.pid,'SIGTERM');for(let i=0;i<100;i++){try{process.kill(first.backend.pid,0);}catch(e){if(e.code==='ESRCH')break;throw e;}await new Promise(r=>setTimeout(r,10));}
 assert.throws(()=>process.kill(first.backend.pid,0),e=>e.code==='ESRCH');
 const second=await browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl});assert.equal(w.calls(),2);assert.notEqual(second.backend.pid,first.backend.pid);assert.equal(await readFile(marker,'utf8'),'keep login data fixture');
});
test('permission-denied liveness cannot authorize managed browser retirement',async t=>{
 const w=await hostFixture(t);await browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl});await browserHost.authCheck({config:w.config,transport:{probeAuth:async()=>({signedIn:true,contextId:w.config.browser.contextId})}});const before=await readFile(join(w.config.runtime.root,'managed-browser.json'));
 const kill=process.kill;process.kill=()=>{throw Object.assign(new Error('unknown liveness'),{code:'EPERM'});};try{await assert.rejects(browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl}));}finally{process.kill=kill;}
 assert.equal(w.calls(),1);assert.deepEqual(await readFile(join(w.config.runtime.root,'managed-browser.json')),before);
});
test('immutable configuration rejects a changed priority policy',async t=>{
 const w=await configuration(t),configPath=join(w.root,'high.json');await cfg.configureRuntime({...w.args,configPath,allowedPriorities:['normal','high']});const before=await readFile(configPath);
 await assert.rejects(cfg.configureRuntime({...w.args,configPath,allowedPriorities:['normal']}),e=>e.code==='ERR_RUNTIME_CONFIG_CONFLICT');assert.deepEqual(await readFile(configPath),before);
});
test('unchanged observation attention is not published on every service cycle',async t=>{
 for(const throwing of [false,true]){
  const w=await configuration(t),r=await admitAt(w,'observe');await dispatchNextStandard({runtime:w.config.runtime,context:accepting,driver:{prepare:ready,send:sent}});
  let reason='unqualified_completion';const driver={observe:async()=>{if(throwing)throw new Error('fixture observation failure');return {status:'attention',reason};}};
  await service.runRuntimeCycle({config:w.config,context:accepting,driver});await service.runRuntimeCycle({config:w.config,context:accepting,driver});
  let e=await events.readOperationEvents({config:w.config,operationRef:r.operation_ref});assert.equal(e.filter(x=>x.type==='observation.attention').length,1);
  if(!throwing){reason='different_attention';await service.runRuntimeCycle({config:w.config,context:accepting,driver});e=await events.readOperationEvents({config:w.config,operationRef:r.operation_ref});assert.equal(e.filter(x=>x.type==='observation.attention').length,2);reason='unqualified_completion';await service.runRuntimeCycle({config:w.config,context:accepting,driver});e=await events.readOperationEvents({config:w.config,operationRef:r.operation_ref});assert.equal(e.filter(x=>x.type==='observation.attention').length,3,'a changed attention reason may return');}
 }
});
test('installed launcher uses explicitly selected Node when PATH lacks Node',async t=>{
 const w=await configuration(t),prefix=join(w.root,'install'),profilePath=join(w.root,'profile');const node=await fs.realpath(process.execPath);await applySetup({plan:await planSetup({sourceRoot:fileURLToPath(new URL('../',import.meta.url)),prefix,profilePath,platform:process.platform,topology:'local',components:{node}})});
 const r=await exec(join(prefix,'bin','chatgpt-research'),['runtime','--help'],{env:{...process.env,PATH:join(w.root,'no-tools')}});assert.match(r.stdout,/runtime init/);
});
test('observer renewal at expiry requires explicit expired replacement',async t=>{
 const w=await configuration(t),r=await admitAt(w,'expiry');assert.equal(binding.deliveryReady({config:w.config,operationRef:r.operation_ref,clock:{now:()=>160000}}),false);
 await assert.rejects(binding.renewObserver({config:w.config,operationRef:r.operation_ref,observerId:'expiry',generation:'g',ttlMs:60000,clock:{now:()=>160000}}),e=>e.code==='ERR_BINDING_EXPIRED');
});

test('dead backend recovery during an existing auth episode preserves owned profile',async t=>{
 const w=await hostFixture(t);const first=await browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl});process.kill(first.backend.pid,'SIGTERM');for(let i=0;i<100;i++){try{process.kill(first.backend.pid,0);}catch(e){if(e.code==='ESRCH')break;throw e;}await new Promise(r=>setTimeout(r,10));}
 const second=await browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl});assert.equal(w.calls(),2);assert.notEqual(second.backend.pid,first.backend.pid);
});
test('dead backend with a different configured profile is preserved and refused',async t=>{
 const w=await hostFixture(t);const first=await browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl});await browserHost.authCheck({config:w.config,transport:{probeAuth:async()=>({signedIn:true,contextId:w.config.browser.contextId})}});const record=join(w.config.runtime.root,'managed-browser.json'),before=await readFile(record);process.kill(first.backend.pid,'SIGTERM');for(let i=0;i<100;i++){try{process.kill(first.backend.pid,0);}catch(e){if(e.code==='ESRCH')break;throw e;}await new Promise(r=>setTimeout(r,10));}
 const config={...w.config,browserHost:{...w.config.browserHost,profilePath:join(w.root,'different-profile')}};await assert.rejects(browserHost.authShow({config,spawnImpl:w.spawnImpl}));assert.equal(w.calls(),1);assert.deepEqual(await readFile(record),before);
});
