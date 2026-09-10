import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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

test('existing admission retries must reconfirm directory durability after a failed publication',async t=>{
 const w=await setup(t),original=fs.open;let syncs=0;
 fs.open=async(...args)=>{const h=await original(...args);if((await h.stat()).isDirectory())h.sync=async()=>{syncs++;throw Object.assign(new Error('directory fault'),{code:'EIO'});};return h;};syncBuiltinESMExports();
 try{await assert.rejects(admit(w));const before=syncs;await assert.rejects(admit(w));assert.ok(syncs>before);}finally{fs.open=original;syncBuiltinESMExports();}
 const success=await admit(w);assert.equal(success.admission,'existing');
});
test('observations cannot reverse collecting or settled terminal transitions',async t=>{
 const w=await setup(t),op=await observed(w);
 const first=await recordStandardObservation({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:op.revision,observation:{status:'completed',conversationId:'c',userMessageId:'u',evidenceRef:'completed-evidence'},context:w.context});
 await assert.rejects(recordStandardObservation({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:first.revision,observation:{status:'failed',conversationId:'c',userMessageId:'u',evidenceRef:'later-failure'},context:w.context}));
 assert.equal((await inspectStandardRuntime({runtime:w.runtime,operationRef:op.operation_ref})).operations[0].phase,'collecting');
});
test('ready preparation missing target or evidence never enters possible-send phase',async t=>{
 for(const prep of [{status:'ready'},{status:'ready',target:'target'},{status:'ready',target:null,evidenceRef:'p'}]){
  const w=await setup(t);await admit(w);let sends=0;
  await dispatchNextStandard({runtime:w.runtime,context:w.context,driver:{prepare:async()=>prep,send:async()=>{sends++;return driver.send();}}}).catch(()=>{});
  assert.equal(sends,0);assert.equal((await inspectStandardRuntime({runtime:w.runtime})).occupied,0);
 }
});
test('authorization annotation cannot change persisted prepared intent',async t=>{
 const w=await setup(t);let outcome;
 try{outcome=await admit(w,{...w.context,authorize:c=>{c.intent.prompt='replaced';c.intent.effort='extended';return true;}});}catch{}
 const view=await inspectStandardRuntime({runtime:w.runtime});
 if(outcome){assert.equal(view.operations[0].intent.effort,'standard');assert.notEqual(view.operations[0].intent.prompt,'replaced');}else assert.equal(view.operations.length,0);
});
test('provider observation needs nonempty evidence before capacity release',async t=>{
 const w=await setup(t),op=await observed(w);
 await assert.rejects(recordStandardObservation({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:op.revision,observation:{status:'completed',conversationId:'c',userMessageId:'u'},context:w.context}));
 assert.equal((await inspectStandardRuntime({runtime:w.runtime})).occupied,1);
});
test('owned lock unlink failure is surfaced instead of returning a successful receipt',async t=>{
 const w=await setup(t),original=fs.unlink;let faults=0;
 fs.unlink=async path=>{if(path===join(w.runtime.root,'state.lock')){faults++;throw Object.assign(new Error('unlink fault'),{code:'EACCES'});}return original(path);};syncBuiltinESMExports();
 try{await assert.rejects(admit(w));assert.ok(faults>0);}finally{fs.unlink=original;syncBuiltinESMExports();}
});

import {canonicalJson} from '../src/canonical-json.js';
test('failed initial lock publication cleans only its owned inode and permits a later retry',async t=>{
 const w=await setup(t),original=fs.open;let fault=true,parentSync=0;
 fs.open=async(...args)=>{const h=await original(...args);if((await h.stat()).isDirectory()){const sync=h.sync.bind(h);h.sync=async()=>{parentSync++;return sync();};}if(args[0]===join(w.runtime.root,'state.lock')&&fault){h.sync=async()=>{throw Object.assign(new Error('lock fsync fault'),{code:'EIO'});};}return h;};syncBuiltinESMExports();
 try{await assert.rejects(admit(w));}finally{fault=false;fs.open=original;syncBuiltinESMExports();}
 assert.ok(parentSync>0,'failed lock cleanup must synchronize its directory');
 assert.equal((await admit(w)).admission,'accepted');
});
test('successful runtime initialization synchronizes its parent directory',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'cra-parent-sync-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const original=fs.open;let parentSync=0;
 fs.open=async(...args)=>{const h=await original(...args);if(args[0]===root){const sync=h.sync.bind(h);h.sync=async()=>{parentSync++;return sync();};}return h;};syncBuiltinESMExports();
 try{await initializeStandardRuntime({root:join(root,'rt')});assert.ok(parentSync>0);}finally{fs.open=original;syncBuiltinESMExports();}
});
test('runtime initialization refuses a parent swapped to a symlink after validation',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'cra-parent-swap-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const parent=join(root,'chosen'),outside=join(root,'outside');await fs.mkdir(parent);await fs.mkdir(outside);const original=fs.mkdir;
 fs.mkdir=async(...args)=>{if(args[0]===join(parent,'rt')){await fs.rename(parent,join(root,'old'));await fs.symlink(outside,parent);}return original(...args);};syncBuiltinESMExports();
 try{await assert.rejects(initializeStandardRuntime({root:join(parent,'rt')}));}finally{fs.mkdir=original;syncBuiltinESMExports();}
 await assert.rejects(fs.readFile(join(outside,'rt','runtime-state.json')),'must not publish a usable snapshot in replacement parent');
});
test('same corrupted prompt in both intent copies cannot pass its original digest',async t=>{
 const w=await setup(t),r=await admit(w),path=join(w.runtime.root,'runtime-state.json'),s=JSON.parse(await fs.readFile(path,'utf8'));
 s.operations[r.operation_ref].intent.prompt='changed';s.intents[r.operation_ref].prompt='changed';await fs.writeFile(path,JSON.stringify(s));
 await assert.rejects(inspectStandardRuntime({runtime:w.runtime}));
});
test('duplicate key compares complete prepared provenance even when prompt bytes stay equal',async t=>{
 const w=await setup(t);await admit(w);const jobRoot=join(w.outputRoot,'jobs',w.job.job_id),eventPath=join(jobRoot,'events.jsonl'),currentPath=join(jobRoot,'current.json');
 const originalEvents=(await fs.readFile(eventPath,'utf8')).trim().split('\n').map(JSON.parse),originalCurrent=JSON.parse(await fs.readFile(currentPath,'utf8'));
 for(const [field,value] of [['template_sha256','1'.repeat(64)],['template_body_sha256','2'.repeat(64)],['rigor_profile_sha256','3'.repeat(64)],['rigor_profile_id','different-profile'],['rigor_profile_version','2.0.0'],['citation_level','expanded'],['audit_appendix',true]]){
   const events=structuredClone(originalEvents),current=structuredClone(originalCurrent);for(const e of events)e[field]=value;current.job[field]=value;
   await fs.writeFile(eventPath,events.map(canonicalJson).join('\n')+'\n');await fs.writeFile(currentPath,canonicalJson(current)+'\n');
   await assert.rejects(admit(w),{code:'ERR_RUNTIME_REQUEST_KEY_CONFLICT'},field);
 }
});
