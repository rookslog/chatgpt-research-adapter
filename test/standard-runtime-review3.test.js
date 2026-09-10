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


test('successful lock release synchronizes the validated containing directory',async t=>{
 const w=await setup(t),open=fs.open,unlink=fs.unlink;let removed=false,synced=false;
 fs.unlink=async p=>{const out=await unlink(p);if(p===join(w.runtime.root,'state.lock'))removed=true;return out;};
 fs.open=async(...a)=>{const h=await open(...a);if(a[0]===w.runtime.root&&(await h.stat()).isDirectory()){const sync=h.sync.bind(h);h.sync=async()=>{if(removed)synced=true;return sync();};}return h;};syncBuiltinESMExports();
 try{await admit(w);assert.equal(removed,true);assert.equal(synced,true);}finally{fs.open=open;fs.unlink=unlink;syncBuiltinESMExports();}
});
test('failed ownership verification after new lock publication cleans only that lock',async t=>{
 const w=await setup(t),open=fs.open;let fault=true,triggered=false;
 fs.open=async(...a)=>{if(a[0]===join(w.runtime.root,'state.lock')&&fault&&(a[1]&constants.O_CREAT)===0){fault=false;triggered=true;throw Object.assign(new Error('verification open fault'),{code:'EIO'});}return open(...a);};syncBuiltinESMExports();
 try{await assert.rejects(admit(w));assert.equal(triggered,true);}finally{fs.open=open;syncBuiltinESMExports();}
 assert.equal((await admit(w)).admission,'accepted');
});
test('token mismatch observed during release preserves foreign record and refuses success',async t=>{
 const w=await setup(t),open=fs.open;let changed=false;
 // Mutate at retirement entry, independent of path-read versus descriptor-read choice.
 fs.open=async(...a)=>{if(a[0]===join(w.runtime.root,'state.lock')&&!changed&&(a[1]&constants.O_CREAT)===0&&/at (?:async )?releaseLock /.test(new Error().stack)){const value=JSON.parse(await fs.readFile(a[0],'utf8'));value.token='foreign-token';await fs.writeFile(a[0],JSON.stringify(value));changed=true;}return open(...a);};syncBuiltinESMExports();
 try{await assert.rejects(admit(w));assert.equal(changed,true);}finally{fs.open=open;syncBuiltinESMExports();}
 assert.equal(JSON.parse(await fs.readFile(join(w.runtime.root,'state.lock'),'utf8')).token,'foreign-token');
});
test('replaced temporary snapshot inode cannot produce a successful admission receipt',async t=>{
 const w=await setup(t),rename=fs.rename;let replaced=false;
 fs.rename=async(from,to)=>{if(String(from).startsWith(join(w.runtime.root,'runtime-state.json.tmp.'))&&!replaced){const bytes=await fs.readFile(from);await rename(from,from+'.retained-original');await fs.writeFile(from,bytes,{mode:0o600});replaced=true;}return rename(from,to);};syncBuiltinESMExports();
 try{await assert.rejects(admit(w));assert.equal(replaced,true);}finally{fs.rename=rename;syncBuiltinESMExports();}
});
test('stored model and effort must retain the admitted Standard vocabulary',async t=>{
 for(const [key,value] of [['model_family','gpt-6-pro'],['effort','unqualified']]){
  const w=await setup(t),r=await admit(w),p=join(w.runtime.root,'runtime-state.json'),s=JSON.parse(await fs.readFile(p,'utf8'));
  s.operations[r.operation_ref].intent[key]=value;s.intents[r.operation_ref][key]=value;await fs.writeFile(p,JSON.stringify(s));
  await assert.rejects(inspectStandardRuntime({runtime:w.runtime}),key);
 }
});
test('accepted identifiers and evidence are copied before post-send filesystem awaits',async t=>{
 const w=await setup(t),r=await admit(w),lstat=fs.lstat;let returned=false,mutated=false;
 const accepted={status:'accepted',binding:{conversationId:'c',userMessageId:'u'},evidenceRef:'accepted-original'};
 fs.lstat=async(...a)=>{if(returned&&!mutated){accepted.binding.conversationId='other-c';accepted.binding.userMessageId='other-u';accepted.evidenceRef='other-evidence';mutated=true;}return lstat(...a);};syncBuiltinESMExports();
 try{await dispatchNextStandard({runtime:w.runtime,context:w.context,driver:{...driver,send:async()=>{returned=true;return accepted;}}});assert.equal(mutated,true);}finally{fs.lstat=lstat;syncBuiltinESMExports();}
 const op=(await inspectStandardRuntime({runtime:w.runtime,operationRef:r.operation_ref})).operations[0];assert.deepEqual(op.binding,{conversationId:'c',userMessageId:'u'});assert.equal(op.evidence_ref,'accepted-original');
});
test('new runtime is private even with a permissive process umask',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'cra-umask-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const old=process.umask(0);
 try{await initializeStandardRuntime({root:join(root,'rt')});}finally{process.umask(old);}
 assert.equal((await fs.stat(join(root,'rt'))).mode&0o777,0o700);
});

test('verification-failure cleanup preserves a changed ownership token',async t=>{
 const w=await setup(t),open=fs.open;let fault=true;
 fs.open=async(...a)=>{if(a[0]===join(w.runtime.root,'state.lock')&&fault&&(a[1]&constants.O_CREAT)===0){fault=false;const value=JSON.parse(await fs.readFile(a[0],'utf8'));value.token='replacement-owner';await fs.writeFile(a[0],JSON.stringify(value));throw Object.assign(new Error('verification failed after ownership changed'),{code:'EIO'});}return open(...a);};syncBuiltinESMExports();
 try{await assert.rejects(admit(w));assert.equal(fault,false);}finally{fs.open=open;syncBuiltinESMExports();}
 assert.equal(JSON.parse(await fs.readFile(join(w.runtime.root,'state.lock'),'utf8')).token,'replacement-owner');
});
test('accessor acceptance cannot validate one identifier and persist another',async t=>{
 const w=await setup(t),r=await admit(w);let reads=0;
 const binding={get conversationId(){return ++reads===1?'first-c':'later-c';},userMessageId:'u'};
 let error;try{await dispatchNextStandard({runtime:w.runtime,context:w.context,driver:{...driver,send:async()=>({status:'accepted',binding,evidenceRef:'send'})}});}catch(e){error=e;}
 const op=(await inspectStandardRuntime({runtime:w.runtime,operationRef:r.operation_ref})).operations[0];
 if(!error)assert.equal(op.binding.conversationId,'first-c');else assert.notEqual(op.submission_effect,'accepted');
});
test('work and release failures both remain available in the error chain',async t=>{
 const w=await setup(t);await admit(w);const unlink=fs.unlink;
 fs.unlink=async p=>{if(p===join(w.runtime.root,'effect.lock'))throw new Error('cleanup-fault-marker');return unlink(p);};syncBuiltinESMExports();
 let error;try{await dispatchNextStandard({runtime:w.runtime,context:w.context,driver:{prepare:async()=>{throw new Error('work-fault-marker');}}});}catch(e){error=e;}finally{fs.unlink=unlink;syncBuiltinESMExports();}
 function messages(e,seen=new Set()){if(!e||seen.has(e))return '';seen.add(e);return [e.message,messages(e.cause,seen),...(e.errors??[]).map(x=>messages(x,seen))].join(' ');}
 assert.match(messages(error),/work-fault-marker/);assert.match(messages(error),/cleanup-fault-marker/);
});
test('directory replacement during retirement cannot return successful admission',async t=>{
 const w=await setup(t),unlink=fs.unlink;let swapped=false;
 fs.unlink=async p=>{const value=await unlink(p);if(p===join(w.runtime.root,'state.lock')&&!swapped){await fs.rename(w.runtime.root,join(w.root,'retained-runtime'));await fs.mkdir(w.runtime.root,{mode:0o700});swapped=true;}return value;};syncBuiltinESMExports();
 try{await assert.rejects(admit(w));assert.equal(swapped,true);}finally{fs.unlink=unlink;syncBuiltinESMExports();}
 const state=JSON.parse(await fs.readFile(join(w.root,'retained-runtime','runtime-state.json'),'utf8'));assert.equal(Object.keys(state.operations).length,1);
});

test('transient descriptor-stat failure after exclusive creation does not strand an owned lock',async t=>{
 const w=await setup(t),open=fs.open;let created=null,triggered=false;
 fs.open=async(...a)=>{const h=await open(...a);if(a[0]===join(w.runtime.root,'state.lock')&&(a[1]&constants.O_CREAT)!==0&&!triggered){created=h;const stat=h.stat.bind(h);h.stat=async(...s)=>{if(!triggered){triggered=true;throw Object.assign(new Error('descriptor-stat fault'),{code:'EIO'});}return stat(...s);};}return h;};syncBuiltinESMExports();
 try{await assert.rejects(admit(w));assert.equal(triggered,true);}finally{fs.open=open;syncBuiltinESMExports();await created?.close().catch(()=>{});}
 assert.equal((await admit(w)).admission,'accepted');
});
