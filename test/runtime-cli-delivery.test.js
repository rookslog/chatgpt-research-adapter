import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import { tmpdir as nativeTestTmpdir } from 'node:os';
import { realpathSync as canonicalTestPath } from 'node:fs';
const tmpdir = () => canonicalTestPath(nativeTestTmpdir());
import {join} from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runCli} from '../src/cli.js';
import {initializeStandardRuntime,inspectStandardRuntime} from '../src/standard-runtime.js';
import {prepareResearchJob} from '../src/prepare.js';
import {submitPreparedJobOnce} from '../src/submit-once.js';
let cfg,binding,service,events;
for(const name of ['runtime-config','caller-binding','runtime-service','runtime-events']){
  try{const m=await import(`../src/${name}.js`);if(name==='runtime-config')cfg=m;if(name==='caller-binding')binding=m;if(name==='runtime-service')service=m;if(name==='runtime-events')events=m;}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
}
async function temp(t){const root=await mkdtemp(join(tmpdir(),'cra-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
function sink(){let text='';return{write:s=>{text+=s;},read:()=>text};}

test('runtime init CLI creates durable four-slot runtime and reports versioned JSON',async t=>{
 const parent=await temp(t),root=join(parent,'runtime'),stdout=sink();
 await runCli(['runtime','init','--root',root,'--json'],{stdout});
 const result=JSON.parse(stdout.read());assert.equal(result.schema,'research.cli.v1');assert.equal(result.capacity,4);assert.ok(result.runtime_epoch);
 const state=await inspectStandardRuntime({runtime:{root,epoch:result.runtime_epoch}});assert.equal(state.capacity,4);
 await assert.rejects(runCli(['runtime','init','--root',root,'--json'],{stdout:sink()}));
});
test('new command parsing rejects duplicates, unsupported flags and invalid capacity before effects',async t=>{
 const root=await temp(t);
 for(const argv of [ ['runtime','init','--root',join(root,'x'),'--root',join(root,'y')],['runtime','init','--root',join(root,'x'),'--capacity','5'],['runtime','init','--root',join(root,'x'),'--automatic-send'],['runtime','init','--root'] ]){
 const stdout=sink();await assert.rejects(runCli(argv,{stdout}));assert.equal(stdout.read(),'');
 }
});
test('human mode uses concise labels while legacy prepare JSON stays intact',async t=>{
 const root=await temp(t),stdout=sink();await runCli(['runtime','init','--root',join(root,'rt')],{stdout});
 assert.match(stdout.read(),/Runtime|Created/);assert.equal(stdout.read().trim().startsWith('{'),false);
 const request=join(root,'request.json');await writeFile(request,JSON.stringify({question:'A bounded question',mode:'standard',template_id:'research-question',template_version:'1.0.0',model_family:'gpt-5.6-pro',effort:'standard'}));
 const legacy=sink();await runCli(['prepare','--request',request,'--output-root',join(root,'prepared')],{stdout:legacy});assert.ok(JSON.parse(legacy.read()).job_id);
});
async function configuration(t){
 const root=await temp(t),contentRoot=join(root,'content'),registryRoot=join(root,'registry'),packageRoot=join(root,'opencli');
 await mkdir(contentRoot);await mkdir(registryRoot);await mkdir(join(packageRoot,'dist/src/browser'),{recursive:true});
 await writeFile(join(packageRoot,'package.json'),JSON.stringify({name:'@jackwener/opencli',version:'1.8.7',type:'module'}));
 const files={};for(const f of ['dist/src/browser/daemon-transport.js','dist/src/constants.js','dist/src/daemon.js']){const b='export const syntheticFixture=true;\n';await writeFile(join(packageRoot,f),b);files[f]=createHash('sha256').update(b).digest('hex');}
 const init=await initializeStandardRuntime({root:join(root,'rt')});const runtime={root:join(root,'rt'),epoch:init.runtime_epoch};
 const args={configPath:join(root,'runtime.json'),runtime,contentRoot,packageRoot,sourceIdentity:{packageName:'@jackwener/opencli',version:'1.8.7',bridgeVersion:'1.0.23',files},contextId:'ctx',hostId:'host',registryRoot};
 await cfg.configureRuntime(args);return {root,args,config:await cfg.readRuntimeConfig(args.configPath)};
}
test('configuration persists exact epoch/context/content and prevents competing capacity aliases', {skip:!cfg?'N1 config absent':false},async t=>{
 const w=await configuration(t);assert.equal(w.config.runtime.epoch,w.args.runtime.epoch);assert.equal(w.config.contentRoot,w.args.contentRoot);
 const same=await cfg.configureRuntime(w.args);assert.equal(same.generation,w.config.generation);
 await assert.rejects(cfg.configureRuntime({...w.args,contextId:'changed'}));
 const other=await initializeStandardRuntime({root:join(w.root,'other-runtime')});
 await assert.rejects(cfg.configureRuntime({...w.args,configPath:join(w.root,'other.json'),runtime:{root:join(w.root,'other-runtime'),epoch:other.runtime_epoch}}));
 await assert.rejects(cfg.configureRuntime({...w.args,sourceIdentity:{...w.args.sourceIdentity,files:{...w.args.sourceIdentity.files,'dist/src/constants.js':'0'.repeat(64)}}}));
});
async function admission(w){
 const outputRoot=join(w.root,'prepared');const job=await prepareResearchJob({outputRoot,templatesRoot:fileURLToPath(new URL('../templates/',import.meta.url)),request:{question:'Separate research job',mode:'standard',template_id:'research-question',template_version:'1.0.0',model_family:'gpt-5.6-pro',effort:'standard'}});
 return submitPreparedJobOnce({outputRoot,jobId:job.job_id,runtime:w.config.runtime,requestKey:'admit',context:{authorize:()=>true}});
}
test('operation-specific delivery lease expires and rejects stale generation renewal', {skip:!cfg||!binding?'N1 binding absent':false},async t=>{
 const w=await configuration(t),r=await admission(w);let now=100000;const clock={now:()=>now};
 const a={config:w.config,operationRef:r.operation_ref,observerId:'observer1',generation:'generation1',ttlMs:1000,clock};
 assert.equal(await binding.deliveryReady({config:w.config,operationRef:r.operation_ref,clock}),false);
 await binding.activateObserver(a);assert.equal(await binding.deliveryReady({config:w.config,operationRef:r.operation_ref,clock}),true);
 assert.equal(await binding.deliveryReady({config:w.config,operationRef:'different-operation',clock}),false);
 await assert.rejects(binding.renewObserver({...a,generation:'stale'}));now+=1001;
 assert.equal(await binding.deliveryReady({config:w.config,operationRef:r.operation_ref,clock}),false);
 assert.equal((await inspectStandardRuntime({runtime:w.config.runtime,operationRef:r.operation_ref})).operations[0].submission_effect,'known_unsent');
});
test('service holds before activation, then dispatches once, observer expiry never replays accepted job', {skip:!cfg||!binding||!service?'N1 service absent':false},async t=>{
 const w=await configuration(t),r=await admission(w);let now=100000,sends=0;const clock={now:()=>now,sleep:async ms=>{now+=ms;}};
 const context={clock,random:()=>0,authorize:()=>true};
 const driver={prepare:async()=>({status:'ready',target:{pageId:'owned'},evidenceRef:'synthetic-prep'}),send:async()=>{sends++;return{status:'accepted',binding:{conversationId:'c1',userMessageId:'u1'},evidenceRef:'fixture'};},observe:async()=>({status:'running',conversationId:'c1',userMessageId:'u1',evidenceRef:'fixture-observe'})};
 await service.runRuntimeCycle({config:w.config,driver,context});assert.equal(sends,0);
 await binding.activateObserver({config:w.config,operationRef:r.operation_ref,observerId:'o',generation:'g',ttlMs:60000,clock});
 await service.runRuntimeCycle({config:w.config,driver,context});assert.equal(sends,1);
 now+=60001;await service.runRuntimeCycle({config:w.config,driver,context});assert.equal(sends,1);
});
test('independent watchers receive scoped current state, timeout without resubmission or cross-cursor writes', {skip:!cfg||!events?'N1 events absent':false},async t=>{
 const w=await configuration(t),r=await admission(w);const a=[],b=[];
 await events.watchOperation({config:w.config,operationRef:r.operation_ref,observerId:'a',after:0,timeoutMs:20,emit:e=>a.push(e)});
 await events.watchOperation({config:w.config,operationRef:r.operation_ref,observerId:'b',after:0,timeoutMs:20,emit:e=>b.push(e)});
 assert.ok(a.some(e=>e.operation_ref===r.operation_ref));assert.ok(b.some(e=>e.operation_ref===r.operation_ref));
 assert.ok(a.every(e=>e.schema==='research.event.v1'));assert.ok(a.some(e=>e.type==='watch.timeout'));
 await assert.rejects(events.readOperationEvents({config:w.config,operationRef:r.operation_ref,after:999999}));
 assert.equal((await inspectStandardRuntime({runtime:w.config.runtime,operationRef:r.operation_ref})).operations[0].submission_effect,'known_unsent');
});

test('watch receives an event that arrives after watching starts', {skip:!cfg||!events?'N1 events absent':false},async t=>{
 const w=await configuration(t),r=await admission(w),seen=[];
 const waiting=events.watchOperation({config:w.config,operationRef:r.operation_ref,observerId:'async-watch',after:0,timeoutMs:300,emit:e=>seen.push(e)});
 await new Promise(resolve=>setTimeout(resolve,40));
 await events.recordOperationEvent({config:w.config,operationRef:r.operation_ref,jobRef:r.job_ref,type:'operation.attention',payload:{reason:'synthetic-ready'}});
 await waiting;assert.ok(seen.some(e=>e.type==='operation.attention'),'watch must observe events that arrive while it waits');
});
test('concurrent event publication retains both events with distinct cursors', {skip:!cfg||!events?'N1 events absent':false},async t=>{
 const w=await configuration(t),r=await admission(w);await events.readOperationEvents({config:w.config,operationRef:r.operation_ref});
 await Promise.all(['one','two'].map(reason=>events.recordOperationEvent({config:w.config,operationRef:r.operation_ref,jobRef:r.job_ref,type:'operation.attention',payload:{reason}})));
 const list=await events.readOperationEvents({config:w.config,operationRef:r.operation_ref});const notices=list.filter(e=>e.type==='operation.attention');assert.equal(notices.length,2);assert.equal(new Set(notices.map(e=>e.cursor)).size,2);
});

test('CLI retry of the same request key returns the original admission after acknowledgement loss',async t=>{
 const w=await configuration(t),request=join(w.root,'retry-request.json'),outputRoot=join(w.root,'prepared-cli');
 await mkdir(outputRoot,{mode:0o700});
 await writeFile(request,JSON.stringify({question:'Keep one immutable admission',mode:'standard',template_id:'research-question',template_version:'1.0.0',model_family:'gpt-5.6-pro',effort:'standard'}));
 const argv=['research','submit','--runtime',w.args.configPath,'--request',request,'--output-root',outputRoot,'--key','lost-ack-key','--json'];
 const a=sink();await runCli(argv,{stdout:a});const first=JSON.parse(a.read());
 const b=sink();await runCli(argv,{stdout:b});const second=JSON.parse(b.read());
 assert.equal(second.operation_ref,first.operation_ref);assert.equal(second.job_ref,first.job_ref);
 assert.equal((await inspectStandardRuntime({runtime:w.config.runtime})).operations.length,1);
 await writeFile(request,JSON.stringify({question:'Different intent must conflict',mode:'standard',template_id:'research-question',template_version:'1.0.0',model_family:'gpt-5.6-pro',effort:'standard'}));
 await assert.rejects(runCli(argv,{stdout:sink()}));
 assert.equal((await inspectStandardRuntime({runtime:w.config.runtime})).operations.length,1);
});

test('CLI background start does not claim readiness when the configured transport cannot load',async t=>{
 const w=await configuration(t),stdout=sink();
 // The pinned fixture is intentionally not a daemon transport implementation.
 // The ordinary child must report startup failure rather than a successful spawn as ready.
 await assert.rejects(runCli(['runtime','start','--runtime',w.args.configPath,'--json'],{stdout}));
 assert.equal(stdout.read().includes('"status":"started"'),false);
});
