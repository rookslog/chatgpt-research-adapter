import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import { tmpdir as nativeTestTmpdir } from 'node:os';
import { realpathSync as canonicalTestPath } from 'node:fs';
const tmpdir = () => canonicalTestPath(nativeTestTmpdir());
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import {runRuntimeCycle} from '../src/runtime-service.js';
import {performance} from 'node:perf_hooks';
import {prepareResearchJob} from '../src/prepare.js';
import {submitPreparedJobOnce} from '../src/submit-once.js';
import {initializeStandardRuntime,inspectStandardRuntime,dispatchNextStandard,collectStandardResult,getStandardResult,exportStandardResult,continueStandardJob} from '../src/standard-runtime.js';
import {createStandardBrowserDriver} from '../src/standard-browser.js';
async function setup(t){const root=await mkdtemp(join(tmpdir(),'cra-tx-review-'));t.after(()=>rm(root,{recursive:true,force:true}));const outputRoot=join(root,'out'),contentRoot=join(root,'content');await mkdir(outputRoot);await mkdir(contentRoot);const init=await initializeStandardRuntime({root:join(root,'rt')});let now=100000;const context={contentRoot,authorize:()=>true,deliveryReady:()=>true,random:()=>0,clock:{now:()=>now,sleep:async ms=>{now+=ms;}}};const runtime={root:join(root,'rt'),epoch:init.runtime_epoch};const job=await prepareResearchJob({outputRoot,templatesRoot:fileURLToPath(new URL('../templates/',import.meta.url)),request:{question:'Tidal locking',mode:'standard',template_id:'research-question',template_version:'1.0.0',model_family:'gpt-5.6-pro',effort:'standard'}});const r=await submitPreparedJobOnce({outputRoot,jobId:job.job_id,runtime,requestKey:'init',context});return{root,runtime,context,r};}
const ready=async op=>({status:'ready',target:{pageId:'owned',contextId:'ctx',origin:'https://chatgpt.com',baseHref:'https://chatgpt.com/',requestedDraft:op.intent.prompt,selection:{modelSelector:'[data-fixture-model]',modelText:'GPT-5.6 Pro',effortSelector:'[data-fixture-effort]',effortText:'Standard'},userMessageIds:[],assistantMessageIds:[]},evidenceRef:'fixture-prep'});
const cap=(user,assistant,text='A report')=>({conversationId:'conv',userMessageId:user,assistantMessageId:assistant,text,citations:[],mediaType:'text/markdown',complete:true,stable:true,completionEvidence:'qualified-turn-complete',laterUserMessageIds:[],evidenceRef:'fixture-capture'});
async function finish(w,opref,user,assistant){await dispatchNextStandard({runtime:w.runtime,context:w.context,driver:{prepare:ready,send:async()=>({status:'accepted',binding:{conversationId:'conv',userMessageId:user},evidenceRef:'fixture-send'})}});const op=(await inspectStandardRuntime({runtime:w.runtime,operationRef:opref})).operations[0];return collectStandardResult({runtime:w.runtime,operationRef:opref,expectedRevision:op.revision,capture:cap(user,assistant),context:w.context});}


function pageFixture({origin='https://chatgpt.com',composer=true,account=true,login=false,challenge=false,answer='Report',marker=true,generating=false}={}) {
 const element=(text='')=>({innerText:text,textContent:text,getBoundingClientRect:()=>({width:20,height:20}),getAttribute:()=>null});
 const c=element(),a=element(),l=element('Log in'),h=element();
 const turns=['user','assistant'].map((role,i)=>{
  const e=element(i===0?'Question':answer);e.getAttribute=k=>k==='data-message-author-role'?role:k==='data-message-id'?(i===0?'u':'a'):null;
  // The toolbar is a sibling of message content inside a conversation turn.
  const container={innerText:e.innerText,querySelector:q=>q.includes('copy-turn-action-button')&&i===1&&marker?element():null};
  e.closest=()=>container;e.parentElement=container;e.querySelector=()=>null;e.querySelectorAll=()=>[];return e;
 });
 const doc={readyState:'complete',querySelector:q=>{
  if(q==='#prompt-textarea')return composer?c:null;
  if(q.includes('accounts-profile-button'))return account?a:null;
  if(q.includes('challenge'))return challenge?h:null;
  if(q.includes('stop-button'))return generating?element():null;
  return null;
 },querySelectorAll:q=>q==='[data-message-author-role]'?turns:q==='#prompt-textarea'?(composer?[c]:[]):q==='a,button'?(login?[l]:[]):[]};
 const location={origin,pathname:'/c/conv',href:origin+'/c/conv'};
 return {document:doc,window:{document:doc,location},location,getComputedStyle:()=>({display:'block',visibility:'visible'})};
}
test('prepare classifies real serialized page facts before model qualification',async t=>{
 for(const [options,reason] of [[{origin:'null'},'wrong_origin'],[{challenge:true},'challenge'],[{account:false,login:true},'signed_out'],[{composer:false},'composer_unavailable'],[{account:false},'authentication_unconfirmed'],[{},'ERR_STANDARD_EFFORT_UNQUALIFIED']]){
  const w=await setup(t);let execs=0;const driver=createStandardBrowserDriver({runtime:w.runtime,transport:{contextId:'ctx',command:async c=>c.action==='tabs'?{ok:true,page:'owned'}:(execs++,{ok:true,data:vm.runInNewContext(c.code,pageFixture(options))})}});
  let result;await dispatchNextStandard({runtime:w.runtime,context:w.context,driver:{prepare:async op=>(result=await driver.prepare(op)),send:async()=>assert.fail('held preparation must not send')}});
  assert.equal(result.status,'held');assert.equal(result.reason,reason);assert.equal(execs,1,'only inspect, no selection/draft/send');
 }
});
test('actual observation expression finds sibling toolbar and waits between stable captures',async t=>{
 const w=await setup(t);await dispatchNextStandard({runtime:w.runtime,context:w.context,driver:{prepare:ready,send:async()=>({status:'accepted',binding:{conversationId:'conv',userMessageId:'u'},evidenceRef:'fixture-send'})}});
 const op=(await inspectStandardRuntime({runtime:w.runtime})).operations[0];let calls=0;const times=[];
 const driver=createStandardBrowserDriver({runtime:w.runtime,transport:{contextId:'ctx',command:async c=>{calls++;times.push(performance.now());return {ok:true,data:vm.runInNewContext(c.code,pageFixture())};}}});
 let result;await runRuntimeCycle({config:{runtime:w.runtime,contentRoot:w.context.contentRoot},context:w.context,driver:{observe:async o=>(result=await driver.observe(o))}});assert.equal(result.status,'completed');assert.equal(result.capture.text,'Report');assert.equal(calls,2);assert.ok(times[1]-times[0]>=40,'default production clock must yield between captures');
});
test('actual expression preserves incomplete or changing report instead of collecting',async t=>{
 for(const variant of ['no-marker','generating','changing']){
  const w=await setup(t);await dispatchNextStandard({runtime:w.runtime,context:w.context,driver:{prepare:ready,send:async()=>({status:'accepted',binding:{conversationId:'conv',userMessageId:'u'},evidenceRef:'fixture-send'})}});
  const op=(await inspectStandardRuntime({runtime:w.runtime})).operations[0];let count=0,commands=0;
  const driver=createStandardBrowserDriver({runtime:w.runtime,clock:{sleep:async()=>{}},transport:{contextId:'ctx',command:async c=>(commands++,{ok:true,data:vm.runInNewContext(c.code,pageFixture({marker:variant!=='no-marker',generating:variant==='generating',answer:variant==='changing'?'Report '+(++count):'Report'}))})}});
  let result;await runRuntimeCycle({config:{runtime:w.runtime,contentRoot:w.context.contentRoot},context:w.context,driver:{observe:async o=>(result=await driver.observe(o))}});assert.ok(commands>0,'real serialized expression must execute');assert.notEqual(result.status,'completed');
 }
});
