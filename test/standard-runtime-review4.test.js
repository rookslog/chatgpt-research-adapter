import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
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



test('persisted v2 metadata retains the prepared loader semantic invariants',async t=>{
 for(const [key,value] of [['rigor_protocol_id','other'],['rigor_protocol_version','2.0.0'],['citation_level','unqualified'],['caller','other-harness'],['job_id','../other'],['turn_id','bad/id'],['created_at','different-time'],['job_root','/another/jobs/path']]){
  const w=await setup(t),r=await admit(w),p=join(w.runtime.root,'runtime-state.json'),state=JSON.parse(await fs.readFile(p,'utf8'));
  state.operations[r.operation_ref].intent[key]=value;state.intents[r.operation_ref][key]=value;await fs.writeFile(p,JSON.stringify(state));
  await assert.rejects(inspectStandardRuntime({runtime:w.runtime}),key);
 }
});
test('initialization binds the newly created root before parent durability awaits',async t=>{
 const parent=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'cra-init-identity-')));t.after(()=>fs.rm(parent,{recursive:true,force:true}));const root=join(parent,'rt'),open=fs.open;let replaced=false;
 fs.open=async(...a)=>{const h=await open(...a);if(a[0]===parent){const sync=h.sync.bind(h);h.sync=async()=>{if(!replaced){await fs.rename(root,join(parent,'created-root'));await fs.mkdir(root,{mode:0o700});replaced=true;}return sync();};}return h;};syncBuiltinESMExports();
 try{await assert.rejects(initializeStandardRuntime({root}));assert.equal(replaced,true);}finally{fs.open=open;syncBuiltinESMExports();}
 await assert.rejects(fs.readFile(join(root,'runtime-state.json')),'replacement must not receive usable history');
});
test('retirement keeps acquisition directory identity even when its owned inode moves',async t=>{
 const w=await setup(t),lstat=fs.lstat;let replaced=false;
 // Target the retirement entry, not a filesystem-call ordinal. This source-level
 // fault seam needs renaming if the private lifecycle entrypoint is renamed.
 fs.lstat=async(...a)=>{if(a[0]===w.runtime.root&&!replaced&&new Error().stack.includes('at releaseLock')){const old=join(w.root,'old-runtime');await fs.rename(w.runtime.root,old);await fs.mkdir(w.runtime.root,{mode:0o700});await fs.rename(join(old,'state.lock'),join(w.runtime.root,'state.lock'));replaced=true;}return lstat(...a);};syncBuiltinESMExports();
 try{await assert.rejects(admit(w));assert.equal(replaced,true);}finally{fs.lstat=lstat;syncBuiltinESMExports();}
 const old=JSON.parse(await fs.readFile(join(w.root,'old-runtime','runtime-state.json'),'utf8'));assert.equal(Object.keys(old.operations).length,1);assert.ok(await fs.lstat(join(w.runtime.root,'state.lock')));
});

test('supported effort and built-in or custom rigor choices remain admissible',async t=>{
 for(const choice of ['light','strict','custom']){
  const w=await setup(t);const extra={effort:choice==='light'?'standard':'extended',citation_level:choice==='light'?'principal':'expanded',audit_appendix:choice!=='light'};
  if(choice==='custom'){
   const manifest=JSON.parse(await fs.readFile(fileURLToPath(new URL('../rigor/profiles/strict/1.0.0.json',import.meta.url)),'utf8'));manifest.profile_id='custom-discipline';manifest.version='2.3.4';
   const path=join(w.root,'profile.json');await fs.writeFile(path,JSON.stringify(manifest));extra.rigor_profile_file=path;
  }else extra.rigor_profile=choice;
  const job=await prepareResearchJob({outputRoot:w.outputRoot,templatesRoot:fileURLToPath(new URL('../templates/',import.meta.url)),request:{question:'Preserve the requested rigorous research',mode:'standard',template_id:'research-question',template_version:'1.0.0',model_family:'gpt-5.6-pro',...extra}});
  const accepted=await submitPreparedJobOnce({outputRoot:w.outputRoot,jobId:job.job_id,runtime:w.runtime,requestKey:'valid-choice',context:w.context});
  const op=(await inspectStandardRuntime({runtime:w.runtime,operationRef:accepted.operation_ref})).operations[0];assert.equal(op.intent.effort,extra.effort);assert.equal(op.intent.citation_level,extra.citation_level);assert.equal(op.intent.rigor_profile_id,choice==='custom'?'custom-discipline':choice);
 }
});
