import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import { tmpdir as nativeTestTmpdir } from 'node:os';
import { realpathSync as canonicalTestPath } from 'node:fs';
const tmpdir = () => canonicalTestPath(nativeTestTmpdir());
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {prepareResearchJob} from '../src/prepare.js';
import {submitPreparedJobOnce} from '../src/submit-once.js';
import {initializeStandardRuntime,inspectStandardRuntime,dispatchNextStandard,recordStandardObservation} from '../src/standard-runtime.js';
async function setup(t){
 const root=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'cra-review-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const outputRoot=join(root,'output');await fs.mkdir(outputRoot);
 const job=await prepareResearchJob({outputRoot,templatesRoot:fileURLToPath(new URL('../templates/',import.meta.url)),request:{question:'Tidal locking',mode:'standard',template_id:'research-question',template_version:'1.0.0',model_family:'gpt-5.6-pro',effort:'standard'}});
 const init=await initializeStandardRuntime({root:join(root,'rt')});let now=100000;
 return {root,outputRoot,job,runtime:{root:join(root,'rt'),epoch:init.runtime_epoch},context:{authorize:()=>true,deliveryReady:()=>true,clock:{now:()=>now,sleep:async ms=>{now+=ms;}},random:()=>0}};
}
const admit=(w,context=w.context)=>submitPreparedJobOnce({outputRoot:w.outputRoot,jobId:w.job.job_id,runtime:w.runtime,requestKey:'key',context});
const driver={prepare:async()=>({status:'ready',target:'target',evidenceRef:'prep'}),send:async()=>({status:'accepted',binding:{conversationId:'c',userMessageId:'u'},evidenceRef:'send'})};
async function observed(w){const r=await admit(w);await dispatchNextStandard({runtime:w.runtime,context:w.context,driver});return (await inspectStandardRuntime({runtime:w.runtime,operationRef:r.operation_ref})).operations[0];}




test('dispatch preserves original root identity even on an idle path',async t=>{
 const w=await setup(t),lstat=fs.lstat;let replaced=false;
 // Fault at effect acquisition, before it establishes its own directory baseline.
 // This named lifecycle seam must be revisited if acquireLock is renamed.
 fs.lstat=async(...a)=>{if(a[0]===w.runtime.root&&!replaced&&/at (?:async )?acquireLock /.test(new Error().stack)){const old=join(w.root,'old-runtime');await fs.rename(w.runtime.root,old);await fs.mkdir(w.runtime.root,{mode:0o700});await fs.copyFile(join(old,'runtime-state.json'),join(w.runtime.root,'runtime-state.json'));replaced=true;}return lstat(...a);};syncBuiltinESMExports();
 try{await assert.rejects(dispatchNextStandard({runtime:w.runtime,context:w.context,driver}));assert.equal(replaced,true);}finally{fs.lstat=lstat;syncBuiltinESMExports();}
});
test('persisted template profile versions and timestamps keep preparation formats',async t=>{
 for(const patch of [{template_id:'../bad'},{template_version:'1..0'},{rigor_profile_id:'Invalid profile'},{rigor_profile_version:'0.01.2'},{created_at:'x',prepared_at:'x'},{created_at:'+010000-01-01T00:00:00.000Z',prepared_at:'+010000-01-01T00:00:00.000Z'},{created_at:'2026-02-30T12:00:00.000Z',prepared_at:'2026-02-30T12:00:00.000Z'}]){
  const w=await setup(t),r=await admit(w),path=join(w.runtime.root,'runtime-state.json'),state=JSON.parse(await fs.readFile(path));
  Object.assign(state.operations[r.operation_ref].intent,patch);Object.assign(state.intents[r.operation_ref],patch);await fs.writeFile(path,JSON.stringify(state));
  await assert.rejects(inspectStandardRuntime({runtime:w.runtime}),JSON.stringify(patch));
 }
});
test('observation transition uses each detached primitive once',async t=>{
 const w=await setup(t),op=await observed(w);let statusReads=0;
 const observation={get status(){return ++statusReads===1?'running':'completed';},conversationId:'c',userMessageId:'u',evidenceRef:'stable-evidence'};
 const result=await recordStandardObservation({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:op.revision,observation});
 assert.equal(result.phase,'observing');assert.equal(statusReads,1);assert.equal((await inspectStandardRuntime({runtime:w.runtime})).occupied,1);
});
test('preparation validates and forwards the same detached target and status',async t=>{
 const w=await setup(t);await admit(w);let targets=0,statuses=0,sentTarget;
 const prep={get status(){statuses++;return 'ready';},get target(){return ++targets<=4?'owned-target':'foreign-target';},evidenceRef:'prep-evidence'};
 await dispatchNextStandard({runtime:w.runtime,context:w.context,driver:{prepare:async()=>prep,send:async(op,target)=>{sentTarget=target;return {status:'accepted',binding:{conversationId:'c',userMessageId:'u'},evidenceRef:'send-evidence'};}}});
 assert.equal(sentTarget,'owned-target');assert.equal(targets,1);assert.equal(statuses,1);
});
test('runtime initialization refuses an indirect symlink in the selected hierarchy',async t=>{
 const w=await setup(t),outside=join(w.root,'outside'),link=join(w.root,'link');await fs.mkdir(join(outside,'parent'),{recursive:true});await fs.symlink(outside,link);
 await assert.rejects(initializeStandardRuntime({root:join(link,'parent','new-runtime')}));await assert.rejects(fs.readFile(join(outside,'parent','new-runtime','runtime-state.json')));
});
test('oversized lock records are refused before whole-file reads',async t=>{
 const w=await setup(t),path=join(w.runtime.root,'state.lock');await fs.writeFile(path,'x'.repeat(1024*1024));
 const readFile=fs.readFile;let oversizedReads=0;fs.readFile=async(...a)=>{if(a[0]===path)oversizedReads++;return readFile(...a);};syncBuiltinESMExports();
 try{await assert.rejects(admit(w));assert.equal(oversizedReads,0);}finally{fs.readFile=readFile;syncBuiltinESMExports();}
 assert.equal((await fs.stat(path)).size,1024*1024,'unknown lock remains available for diagnosis');
});

test('observation detail fields cannot carry mutable objects into stored attention',async t=>{
 const w=await setup(t),op=await observed(w);
 await assert.rejects(recordStandardObservation({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:op.revision,observation:{status:'failed',conversationId:'c',userMessageId:'u',evidenceRef:'stable-evidence',attention:{label:'mutable'}}}));
 assert.equal((await inspectStandardRuntime({runtime:w.runtime})).operations[0].phase,'observing');
});
