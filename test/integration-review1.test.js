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
const fakeReady=async()=>({status:'ready',target:'owned',evidenceRef:'fixture-prep'});
const fakeSend=async()=>({status:'accepted',binding:{conversationId:'c',userMessageId:'u'},evidenceRef:'fixture-send'});
const accepting={authorize:()=>true,deliveryReady:()=>true,random:()=>0,clock:{now:()=>100000,sleep:async()=>{}}};
test('definitively completed executor rejection clears command fence but not unknown provider effect',async t=>{
 const w=await configuration(t),r=await admission(w);
 await assert.rejects(dispatchNextStandard({runtime:w.config.runtime,context:accepting,driver:{prepare:fakeReady,send:async op=>executeStandardCommand({runtime:w.config.runtime,operationRef:op.operation_ref,expectedRevision:op.revision,command:{id:'known-rejection',action:'exec',page:'p',session:op.operation_ref,code:'guard'},execute:async()=>{throw Object.assign(new Error('definitive rejected execution'),{executorUnresolved:false,commandId:'known-rejection'});}})}}));
 const state=await inspectStandardRuntime({runtime:w.config.runtime});assert.equal(state.unresolved_executor,null);assert.equal(state.operations[0].submission_effect,'unknown');assert.equal(state.occupied,1);
});
test('configured permitted priorities reach service preparation with an active route',async t=>{
 const w=await configuration(t),outputRoot=join(w.root,'priorities');await mkdir(outputRoot);const job=await prepareResearchJob({outputRoot,templatesRoot:fileURLToPath(new URL('../templates/',import.meta.url)),request:{question:'High priority fixture',mode:'standard',template_id:'research-question',template_version:'1.0.0',model_family:'gpt-5.6-pro',effort:'standard'}});
 const config={...w.config,allowedPriorities:['normal','high']};const r=await submitPreparedJobOnce({outputRoot,jobId:job.job_id,runtime:config.runtime,requestKey:'high',context:{authorize:()=>true,priority:'high'}});await binding.activateObserver({config,operationRef:r.operation_ref,observerId:'o',generation:'g',ttlMs:60000,clock:accepting.clock});let prepared=0;
 await service.runRuntimeCycle({config,context:{clock:accepting.clock},driver:{prepare:async()=>{prepared++;return{status:'held',reason:'fixture'};}}});assert.equal(prepared,1);
});
async function installFixture(t){const w=await configuration(t);return{...w,sourceRoot:fileURLToPath(new URL('../',import.meta.url)),prefix:join(w.root,"install'x#part"),profilePath:join(w.root,'profile'),platform:process.platform,topology:'local',components:{}};}
test('installed launcher accepts apostrophe and hash in a valid prefix',async t=>{
 const w=await installFixture(t);await applySetup({plan:await planSetup(w)});const r=await exec(join(w.prefix,'bin','chatgpt-research'),['runtime','--help']);assert.match(r.stdout,/runtime init/);
});
test('failed prelaunch human handoff does not leave automation permanently paused',async t=>{
 const w=await hostFixture(t);await writeFile(join(w.config.runtime.root,'effect.lock'),'owned fixture blocks retirement');let now=0;const clock={now:()=>now,sleep:async ms=>{now+=ms;}};
 await assert.rejects(browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl,clock}));assert.equal(w.calls(),0);assert.equal(await humanControlActive(w.config.runtime),false);
 await fs.unlink(join(w.config.runtime.root,'effect.lock'));const shown=await browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl});assert.ok(shown.backend.pid);assert.equal(w.calls(),1);
});
test('concurrent configuration cannot replace another runtime registry claim',async t=>{
 const w=await configuration(t),registry=join(w.root,'new-registry');await mkdir(registry);const init=await initializeStandardRuntime({root:join(w.root,'rt2')});const other={root:join(w.root,'rt2'),epoch:init.runtime_epoch};
 const original=fs.readFile;let arrived=0,release;const barrier=new Promise(r=>{release=r;});
 fs.readFile=async(...a)=>{if(a[0]===join(registry,'host_ctx.json')){try{return await original(...a);}catch(e){if(e.code!=='ENOENT')throw e;arrived++;if(arrived===2)release();await barrier;throw e;}}return original(...a);};syncBuiltinESMExports();
 let results;try{results=await Promise.allSettled([cfg.configureRuntime({...w.args,registryRoot:registry,configPath:join(w.root,'a.json')}),cfg.configureRuntime({...w.args,registryRoot:registry,configPath:join(w.root,'b.json'),runtime:other})]);}finally{fs.readFile=original;syncBuiltinESMExports();}
 assert.equal(arrived,2);assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'exactly one distinct runtime may claim the context');
 const winner=results.findIndex(r=>r.status==='fulfilled');const checked=await cfg.readRuntimeConfig(join(w.root,winner===0?'a.json':'b.json'));assert.equal(checked.runtime.root,winner===0?w.config.runtime.root:other.root);
});
test('an event cannot attach another operation report',async t=>{
 const w=await configuration(t),r=await admission(w);await dispatchNextStandard({runtime:w.config.runtime,context:accepting,driver:{prepare:fakeReady,send:fakeSend}});let op=(await inspectStandardRuntime({runtime:w.config.runtime})).operations[0];
 const result=await collectStandardResult({runtime:w.config.runtime,operationRef:r.operation_ref,expectedRevision:op.revision,context:{contentRoot:w.config.contentRoot},capture:{conversationId:'c',userMessageId:'u',assistantMessageId:'a',text:'Report',citations:[],mediaType:'text/markdown',complete:true,stable:true,completionEvidence:'qualified-turn-complete',laterUserMessageIds:[],evidenceRef:'capture'}});
 const outputRoot=join(w.root,'out2');await mkdir(outputRoot);const job=await prepareResearchJob({outputRoot,templatesRoot:fileURLToPath(new URL('../templates/',import.meta.url)),request:{question:'Other operation',mode:'standard',template_id:'research-question',template_version:'1.0.0',model_family:'gpt-5.6-pro',effort:'standard'}});const r2=await submitPreparedJobOnce({outputRoot,jobId:job.job_id,runtime:w.config.runtime,requestKey:'second',context:{authorize:()=>true}});
 await assert.rejects(events.recordOperationEvent({config:w.config,operationRef:r2.operation_ref,jobRef:r2.job_ref,type:'result.available',resultRef:result.result_ref}));
});
test('oversized CLI request refuses before a whole-file read',async t=>{
 const w=await configuration(t),path=join(w.root,'huge.json');await writeFile(path,' '.repeat(2*1024*1024));const read=fs.readFile;let unbounded=0;fs.readFile=async(...a)=>{if(a[0]===path)unbounded++;return read(...a);};syncBuiltinESMExports();
 try{await assert.rejects(runCli(['research','submit','--runtime',w.args.configPath,'--request',path,'--output-root',w.root,'--key','huge','--json'],{stdout:sink()}));assert.equal(unbounded,0);}finally{fs.readFile=read;syncBuiltinESMExports();}
});
test('uninstall refuses an application directory replaced with an external symlink',async t=>{
 const w=await installFixture(t);await applySetup({plan:await planSetup(w)});const plan=await planUninstall({prefix:w.prefix});const outside=join(w.root,'moved-app');await fs.rename(join(w.prefix,'app'),outside);await fs.symlink(outside,join(w.prefix,'app'));
 let refused=false;try{const newer=await planUninstall({prefix:w.prefix});await applyUninstall({plan:newer});}catch{refused=true;}assert.equal(refused,true);assert.ok(await readFile(join(outside,'package.json')));await assert.rejects(applyUninstall({plan}));
});
test('a stale stop nonce cannot poison stopping the current service',async t=>{
 const w=await configuration(t),lock=await service.acquireServiceLock(w.config.runtime.root,w.args.configPath);t.after(()=>lock.release());await writeFile(join(w.config.runtime.root,'service.stop'),JSON.stringify({schema:'research.service-stop.v1',nonce:'earlier-generation',requested_at:100}));
 assert.equal(await service.checkStopRequested(w.config.runtime.root),false);const requested=await service.requestServiceStop(w.config.runtime.root);assert.equal(requested.status,'stop_requested');assert.equal(await service.checkStopRequested(w.config.runtime.root),true);
});
