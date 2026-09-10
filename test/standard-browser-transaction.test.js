import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir as nativeTestTmpdir } from 'node:os';
import { realpathSync as canonicalTestPath } from 'node:fs';
const tmpdir = () => canonicalTestPath(nativeTestTmpdir());
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

import { prepareResearchJob } from '../src/prepare.js';
import { submitPreparedJobOnce } from '../src/submit-once.js';

// Conditional imports for existing runtime and new C2 modules
let standardRuntimeModule = null;
try {
  standardRuntimeModule = await import('../src/standard-runtime.js');
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
}

let standardBrowserModule = null;
try {
  standardBrowserModule = await import('../src/standard-browser.js');
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
}

let opencliCommandModule = null;
try {
  opencliCommandModule = await import('../src/opencli-browser-command.js');
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
}

let standardResultsModule = null;
try {
  standardResultsModule = await import('../src/standard-results.js');
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
}

const {
  initializeStandardRuntime,
  inspectStandardRuntime,
  dispatchNextStandard,
  recordStandardObservation,
  // C2 functions (if implemented in standard-runtime.js):
  collectStandardResult = standardResultsModule?.collectStandardResult,
  getStandardResult = standardResultsModule?.getStandardResult,
  exportStandardResult = standardResultsModule?.exportStandardResult,
  continueStandardJob,
  recordStandardControl
} = standardRuntimeModule ?? {};

const {
  createStandardBrowserDriver,
  buildStandardSendExpression
} = standardBrowserModule ?? {};

const {
  createOpenCliCommandTransport
} = opencliCommandModule ?? {};

const templatesRoot = fileURLToPath(new URL('../templates/', import.meta.url));

function createAdvancingClock(initial = 10_000_000) {
  let currentTime = initial;
  return {
    now: () => currentTime,
    sleep: async (ms) => { currentTime += ms; }
  };
}

async function createWorkspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'standard-tx-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = join(root, 'output');
  const contentRoot = join(root, 'content');
  await mkdir(outputRoot, { recursive: true });
  await mkdir(contentRoot, { recursive: true });
  return { root, outputRoot, contentRoot };
}

const baseRequest = {
  question: 'Explain the mechanism of tidal locking.',
  mode: 'standard',
  template_id: 'research-question',
  template_version: '1.0.0',
  model_family: 'gpt-5.6-pro',
  effort: 'standard'
};

async function createPreparedJob(outputRoot, overrides = {}) {
  return await prepareResearchJob({
    request: { ...baseRequest, ...overrides },
    outputRoot,
    templatesRoot
  });
}

// ---------------------------------------------------------------------------
// 1. Meaningful First RED: Persistent unresolved-executor fence
// ---------------------------------------------------------------------------
test('1. persistent unresolved-executor fence blocks subsequent dispatch across senders while local inspect and admission remain available', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 4 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  // 1. Admit two operations into capacity 4
  const job1 = await createPreparedJob(outputRoot, { question: 'Operation 1 tidal locking question' });
  const job2 = await createPreparedJob(outputRoot, { question: 'Operation 2 resonance question' });

  const receipt1 = await submitPreparedJobOnce({
    outputRoot,
    jobId: job1.job_id,
    runtime,
    requestKey: 'unresolved-fence-key-1'
  });
  assert.equal(receipt1.admission, 'accepted');

  const receipt2 = await submitPreparedJobOnce({
    outputRoot,
    jobId: job2.job_id,
    runtime,
    requestKey: 'unresolved-fence-key-2'
  });
  assert.equal(receipt2.admission, 'accepted');

  // Authorized + deliveryReady fake context with advancing clock
  const clock = createAdvancingClock(10_000_000);
  const context = {
    authorize: () => true,
    deliveryReady: () => true,
    clock,
    random: () => 0
  };

  // 2. First driver's send increments a call counter then throws a typed error with
  // executorUnresolved: true and commandId: 'owned-command'
  let driver1SendCalls = 0;
  const driver1 = {
    prepare: async () => ({
      status: 'ready',
      target: { pageId: 'page-1', contextId: 'ctx-1' },
      evidenceRef: 'ev-prep-1'
    }),
    send: async () => {
      driver1SendCalls++;
      const err = new Error('transport lost during send execution');
      err.code = 'ERR_DRIVER_EXECUTOR_UNRESOLVED';
      err.executorUnresolved = true;
      err.commandId = 'owned-command';
      throw err;
    }
  };

  // 3. Catch that error
  let caughtError = null;
  try {
    await dispatchNextStandard({ runtime, context, driver: driver1 });
  } catch (err) {
    caughtError = err;
  }
  assert.ok(caughtError, 'first dispatch must throw or reject');
  assert.equal(caughtError.executorUnresolved, true, 'freeze executorUnresolved:true at driver seam');
  assert.equal(caughtError.commandId, 'owned-command', 'commandId must be correlated');
  assert.equal(driver1SendCalls, 1, 'first driver send must be called exactly once');

  // 4. Invoke next dispatch with a different sender
  let driver2SendCalls = 0;
  const driver2 = {
    prepare: async () => ({
      status: 'ready',
      target: { pageId: 'page-2', contextId: 'ctx-2' },
      evidenceRef: 'ev-prep-2'
    }),
    send: async () => {
      driver2SendCalls++;
      return {
        status: 'accepted',
        binding: { conversationId: 'conv-2', userMessageId: 'msg-2' },
        evidenceRef: 'ev-send-2'
      };
    }
  };

  try {
    await dispatchNextStandard({ runtime, context, driver: driver2 });
  } catch {
    // A C2 GREEN runtime will refuse or hold dispatch because the executor is unresolved.
  }

  // 5. Expect second sender NOT invoked because prior browser executor remains unresolved
  assert.equal(
    driver2SendCalls,
    0,
    'second sender must NOT be invoked because prior browser executor remains unresolved'
  );

  // 6. Local inspect still works and first effect stays unknown
  const inspected = await inspectStandardRuntime({ runtime, operationRef: receipt1.operation_ref });
  assert.equal(inspected.occupied, 1, 'first operation remains occupying capacity');
  const op1State = inspected.operations.find((o) => o.operation_ref === receipt1.operation_ref);
  assert.ok(op1State);
  assert.equal(op1State.phase, 'dispatching');
  assert.equal(op1State.submission_effect, 'unknown');

  // 7. Local admission still works
  const job3 = await createPreparedJob(outputRoot, { question: 'Operation 3 admission during unresolved fence' });
  const receipt3 = await submitPreparedJobOnce({
    outputRoot,
    jobId: job3.job_id,
    runtime,
    requestKey: 'unresolved-fence-key-3'
  });
  assert.equal(receipt3.admission, 'accepted');
});


// Parent-authored result/continuation checks use a real accepted binding, not an unsent job.
async function admitted(t, priority='normal') {
  const w=await createWorkspace(t), runtimeRoot=join(w.root,'runtime');
  const init=await initializeStandardRuntime({root:runtimeRoot});
  const runtime={root:runtimeRoot,epoch:init.runtime_epoch};
  const context={authorize:()=>true,deliveryReady:()=>true,clock:createAdvancingClock(),random:()=>0,contentRoot:w.contentRoot,priority};
  const job=await createPreparedJob(w.outputRoot);
  const receipt=await submitPreparedJobOnce({outputRoot:w.outputRoot,jobId:job.job_id,runtime,requestKey:'initial',context});
  return {...w,runtime,context,receipt};
}
async function accepted(w, conversationId='conv-1', userMessageId='user-1') {
  let sends=0;
  await dispatchNextStandard({runtime:w.runtime,context:w.context,driver:{prepare:async()=>({status:'ready',target:{pageId:'owned',contextId:'ctx'},evidenceRef:'fixture-prep'}),send:async()=>{sends++;return {status:'accepted',binding:{conversationId,userMessageId},evidenceRef:'fixture-send'};}}});
  assert.equal(sends,1);
  return (await inspectStandardRuntime({runtime:w.runtime,operationRef:w.receipt.operation_ref})).operations[0];
}
const capture={conversationId:'conv-1',userMessageId:'user-1',assistantMessageId:'assistant-1',text:'A source-linked answer.\n',citations:[{text:'Source',url:'https://example.org/source'}],evidenceRef:'synthetic-fixture',complete:true,stable:true,completionEvidence:'qualified-turn-complete',laterUserMessageIds:[],mediaType:'text/markdown'};
const c2Skip=!collectStandardResult?'C2 result APIs absent':false;

test('result publication requires accepted exact binding and a positive stable completion', {skip:c2Skip}, async t=>{
  const w=await admitted(t);
  await assert.rejects(collectStandardResult({runtime:w.runtime,operationRef:w.receipt.operation_ref,expectedRevision:w.receipt.revision,capture,context:w.context}));
  const op=await accepted(w);
  for (const invalid of [{...capture,userMessageId:'older-user'},{...capture,complete:false},{...capture,stable:false},{...capture,laterUserMessageIds:['new-user']},{...capture,text:''}]) {
    await assert.rejects(collectStandardResult({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:op.revision,capture:invalid,context:w.context}));
  }
  const result=await collectStandardResult({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:op.revision,capture,context:w.context});
  const got=await getStandardResult({runtime:w.runtime,resultRef:result.result_ref,operationRef:op.operation_ref});
  assert.equal(got.text,capture.text);assert.deepEqual(got.citations,capture.citations);assert.match(got.content_sha256,/^[a-f0-9]{64}$/);
  const view=await inspectStandardRuntime({runtime:w.runtime,operationRef:op.operation_ref});
  assert.equal(view.operations[0].result_ref,result.result_ref);assert.equal(view.occupied,0);
  assert.equal(view.events.filter(e=>e.type==='result.available'&&e.operation_ref===op.operation_ref).length,1);
  const again=await collectStandardResult({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:view.operations[0].revision,capture,context:w.context});
  assert.equal(again.result_ref,result.result_ref);
  await assert.rejects(collectStandardResult({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:999999,capture,context:w.context}),{code:'ERR_RUNTIME_REVISION_CONFLICT'});
  await assert.rejects(collectStandardResult({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:view.operations[0].revision,capture:{...capture,text:'Different'},context:w.context}));
  assert.equal((await getStandardResult({runtime:w.runtime,resultRef:result.result_ref})).text,capture.text);
});

test('failed content publication leaves no available pointer; export refuses overwrite', {skip:c2Skip}, async t=>{
  const w=await admitted(t);const op=await accepted(w);
  const badRoot=join(w.root,'missing-content');
  await assert.rejects(collectStandardResult({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:op.revision,capture,context:{...w.context,contentRoot:badRoot}}));
  let view=await inspectStandardRuntime({runtime:w.runtime,operationRef:op.operation_ref});
  assert.ok(!view.operations[0].result_ref);assert.equal((view.events??[]).filter(e=>e.type==='result.available').length,0);
  const result=await collectStandardResult({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:view.operations[0].revision,capture,context:w.context});
  const destination=join(w.root,'export.md');
  const exported=await exportStandardResult({runtime:w.runtime,resultRef:result.result_ref,destination,context:w.context});
  assert.equal(await readFile(destination,'utf8'),capture.text);assert.equal(exported.result_ref,result.result_ref);
  await assert.rejects(exportStandardResult({runtime:w.runtime,resultRef:result.result_ref,destination,context:w.context}));
  assert.equal(await readFile(destination,'utf8'),capture.text);
  await assert.rejects(exportStandardResult({runtime:w.runtime,resultRef:result.result_ref,destination:join(w.root,'denied.md'),context:{...w.context,authorize:()=>false}}));
});

test('completed followups retain job and old result, reject key reuse and stale bases, honor task priority', {skip:!continueStandardJob?'C2 continuation absent':false}, async t=>{
  const w=await admitted(t);const op=await accepted(w);
  const result=await collectStandardResult({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:op.revision,capture,context:w.context});
  const args={runtime:w.runtime,jobRef:op.job_ref,baseResultRef:result.result_ref,requestKey:'f1',prompt:'First follow-up',context:w.context};
  const f1=await continueStandardJob(args), same=await continueStandardJob(args);
  assert.equal(f1.job_ref,op.job_ref);assert.notEqual(f1.operation_ref,op.operation_ref);assert.equal(same.operation_ref,f1.operation_ref);
  await assert.rejects(continueStandardJob({...args,prompt:'Changed'}));
  const f2=await continueStandardJob({...args,requestKey:'f2',prompt:'Second from same base'});
  const high=await createPreparedJob(w.outputRoot,{question:'High priority new job'});
  const hr=await submitPreparedJobOnce({outputRoot:w.outputRoot,jobId:high.job_id,runtime:w.runtime,requestKey:'high-new',context:{...w.context,priority:'high'}});
  const order=[];
  const driver={prepare:async op=>({status:'ready',target:{},evidenceRef:'fixture-prep'}),send:async op=>{order.push(op.operation_ref);return {status:'accepted',binding:{conversationId:op.job_ref===f1.job_ref?'conv-1':'conv-high',userMessageId:op.operation_ref},evidenceRef:'synthetic-order'};}};
  await dispatchNextStandard({runtime:w.runtime,context:w.context,driver});
  await dispatchNextStandard({runtime:w.runtime,context:w.context,driver});
  assert.deepEqual(order,[hr.operation_ref,f1.operation_ref]);
  await dispatchNextStandard({runtime:w.runtime,context:w.context,driver});
  assert.equal(order.includes(f2.operation_ref),false,'same-base sibling must never silently rebase after first follow-up send');
  assert.equal((await getStandardResult({runtime:w.runtime,resultRef:result.result_ref})).text,capture.text);
});

test('capture classifier rejects ambiguous or unfinished turns even with matching text', {skip:!standardBrowserModule?.classifyStandardCapture?'C2 classifier absent':false}, ()=>{
  const classify=standardBrowserModule.classifyStandardCapture;
  const operation={binding:{conversationId:'conv-1',userMessageId:'user-1'}};
  assert.equal(classify({operation,capture}).status,'completed');
  for(const variant of [{...capture,userMessageId:'old'},{...capture,laterUserMessageIds:['new']},{...capture,assistantMessageId:''},{...capture,complete:false},{...capture,stable:false}]) {
    assert.notEqual(classify({operation,capture:variant}).status,'completed');
  }
});

import {createMinimalDomContext} from './fixtures/standard-browser/dom-helper.js';
test('actual serialized final guard refuses changed DOM and clicks once only on qualified exact fixture', {skip:!buildStandardSendExpression?'C2 guard absent':false},()=>{
  const operation={operation_ref:'guard-op',intent:{prompt:'Exact draft',model_family:'gpt-5.6-pro',effort:'standard'}};
  const target={pageId:'page',contextId:'ctx',baseHref:'https://chatgpt.com/',origin:'https://chatgpt.com',requestedDraft:'Exact draft',selection:{modelSelector:'[data-fixture-model]',modelText:'GPT-5.6 Pro',effortSelector:'[data-fixture-effort]',effortText:'Standard'},userMessageIds:[],assistantMessageIds:[]};
  const code=buildStandardSendExpression({operation,target});assert.equal(typeof code,'string');
  const matching=createMinimalDomContext({pathname:'/',composerText:'Exact draft'});
  vm.runInNewContext(code,matching.window);assert.equal(matching.getSendClickCount(),1);
  for(const opts of [{origin:'https://example.org'},{pathname:'/c/wrong'},{composerText:'foreign'},{sendButtonEnabled:false},{duplicateSendButton:true},{duplicateComposer:true}]) {
    const dom=createMinimalDomContext({pathname:'/',composerText:'Exact draft',...opts});
    try{vm.runInNewContext(code,dom.window);}catch{}
    assert.equal(dom.getSendClickCount(),0,JSON.stringify(opts));
  }
  const changed=createMinimalDomContext({pathname:'/',composerText:'Exact draft'});changed.effort.textContent='Extended';changed.effort.innerText='Extended';
  try{vm.runInNewContext(code,changed.window);}catch{}
  assert.equal(changed.getSendClickCount(),0,'selection changed after preparation');
});

import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
async function pinnedFixture(root){
  const packageRoot=join(root,'opencli');await mkdir(join(packageRoot,'dist/src/browser'),{recursive:true});
  await writeFile(join(packageRoot,'package.json'),JSON.stringify({name:'@jackwener/opencli',version:'1.8.7',type:'module'}));
  // Synthetic inert source tree; requestImpl is the trusted boundary under test. No browser package is launched.
  const files={};
  for(const file of ['dist/src/browser/daemon-transport.js','dist/src/constants.js','dist/src/daemon.js']) {
    const bytes=file.endsWith('daemon-transport.js')?'export async function requestDaemon(){throw Error("fixture must use injection");}\n':'export const syntheticFixture = true;\n';
    await writeFile(join(packageRoot,file),bytes);files[file]=createHash('sha256').update(bytes).digest('hex');
  }
  return {packageRoot,sourceIdentity:{packageName:'@jackwener/opencli',version:'1.8.7',bridgeVersion:'1.0.23',files}};
}
test('generic command transport sends one exact correlated command; lost reply never retries', {skip:!createOpenCliCommandTransport?'C2 command transport absent':false},async t=>{
  const {root}=await createWorkspace(t);const fixture=await pinnedFixture(root);let posts=0,commands=[];
  const requestImpl=async(path,init)=>{
    if(path.startsWith('/status')) return new Response(JSON.stringify({ok:true,daemonVersion:'1.8.7',contextId:'ctx',extensionConnected:true,extensionVersion:'1.0.23'}));
    assert.equal(path,'/command');posts++;commands.push(JSON.parse(init.body));
    throw Object.assign(new Error('applied then reply lost'),{code:'ECONNRESET'});
  };
  const transport=await createOpenCliCommandTransport({...fixture,contextId:'ctx',requestImpl});
  await assert.rejects(transport.command({id:'one-command',action:'exec',page:'page',session:'op-1',code:'1+1'}),e=>e.executorUnresolved===true&&e.commandId==='one-command');
  assert.equal(posts,1);assert.equal(commands[0].id,'one-command');assert.equal(commands[0].contextId,'ctx');assert.equal(commands[0].windowMode,'background');
  const tampered={...fixture.sourceIdentity,files:{...fixture.sourceIdentity.files,'dist/src/constants.js':'0'.repeat(64)}};
  await assert.rejects(createOpenCliCommandTransport({...fixture,sourceIdentity:tampered,contextId:'ctx',requestImpl}));
  const mismatch=await createOpenCliCommandTransport({...fixture,contextId:'ctx',requestImpl:async(path,init)=>path.startsWith('/status')?requestImpl(path,init):new Response(JSON.stringify({id:'different-command',ok:true,data:1}))});
  await assert.rejects(mismatch.command({id:'expected-command',action:'exec',page:'page',session:'op-1',code:'1'}),e=>e.executorUnresolved===true);
});

test('final guard requires selection evidence and rechecks prior user turns',()=>{
 const operation={operation_ref:'o',intent:{prompt:'Exact draft',model_family:'gpt-5.6-pro',effort:'standard'}};
 const target={baseHref:'https://chatgpt.com/',origin:'https://chatgpt.com',requestedDraft:'Exact draft',userMessageIds:[],assistantMessageIds:[]};
 const missing=createMinimalDomContext({pathname:'/',composerText:'Exact draft'});
 try{vm.runInNewContext(buildStandardSendExpression({operation,target}),missing.window);}catch{}
 assert.equal(missing.getSendClickCount(),0,'missing model/effort evidence must not click');
 const dom=createMinimalDomContext({pathname:'/',composerText:'Exact draft'}),original=dom.document.querySelectorAll;
 dom.document.querySelectorAll=s=>s.includes('data-message-author-role')?[{getAttribute:k=>k==='data-message-id'?'new-user':null,dataset:{messageId:'new-user'}}]:original.call(dom.document,s);
 target.selection={modelSelector:'[data-fixture-model]',modelText:'GPT-5.6 Pro',effortSelector:'[data-fixture-effort]',effortText:'Standard'};
 try{vm.runInNewContext(buildStandardSendExpression({operation,target}),dom.window);}catch{}
 assert.equal(dom.getSendClickCount(),0,'new external turn after preparation prevents send');
});
test('driver never fabricates provider IDs from an acknowledged click without accepted turn evidence',async t=>{
 const w=await admitted(t);const op=(await inspectStandardRuntime({runtime:w.runtime})).operations[0];
 const driver=createStandardBrowserDriver({runtime:w.runtime,transport:{contextId:'ctx',command:async()=>({ok:true,data:true,page:'owned'})}});
 let outcome;try{outcome=await driver.send(op,{pageId:'owned',contextId:'ctx',origin:'https://chatgpt.com',baseHref:'https://chatgpt.com/',requestedDraft:op.intent.prompt});}catch(e){outcome={error:e.code};}
 assert.notEqual(outcome?.status,'accepted','click acknowledgement is not provider acceptance');
});
test('transport refuses empty pins, stale source, context overrides and propagates daemon unknown status',async t=>{
 const {root}=await createWorkspace(t),fixture=await pinnedFixture(root);let posts=0;
 const status=()=>new Response(JSON.stringify({ok:true,daemonVersion:'1.8.7',contextId:'ctx',extensionConnected:true,extensionVersion:'1.0.23'}));
 const requestImpl=async(path,init)=>{if(path.startsWith('/status'))return status();posts++;const p=JSON.parse(init.body);return new Response(JSON.stringify({ok:false,id:p.id,errorCode:'command_result_unknown',error:'executor may continue'}));};
 await assert.rejects(createOpenCliCommandTransport({...fixture,sourceIdentity:{...fixture.sourceIdentity,files:{}},contextId:'ctx',requestImpl}));
 const tr=await createOpenCliCommandTransport({...fixture,contextId:'ctx',requestImpl});
 await assert.rejects(tr.command({id:'x',action:'exec',page:'p',session:'s',code:'1',contextId:'other'}));assert.equal(posts,0);
 await assert.rejects(tr.command({id:'y',action:'exec',page:'p',session:'s',code:'1'}),e=>e.executorUnresolved===true&&e.commandId==='y');assert.equal(posts,1);
 await writeFile(join(fixture.packageRoot,'dist/src/constants.js'),'export const changed=true;');
 await assert.rejects(tr.command({id:'z',action:'exec',page:'p',session:'s',code:'1'}));assert.equal(posts,1,'source drift must stop before command POST');
});

test('executor intent is durable before command and only matching correlated settlement can clear it',async t=>{
 const w=await admitted(t);let op=(await inspectStandardRuntime({runtime:w.runtime})).operations[0];
 const marked=await recordStandardControl({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:op.revision,control:{kind:'executor_intent',commandId:'pending-create',action:'tabs'},context:w.context});
 let state=JSON.parse(await readFile(join(w.runtime.root,'runtime-state.json'),'utf8'));
 assert.equal(state.unresolved_executor.commandId,'pending-create');
 await assert.rejects(recordStandardControl({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:marked.revision,control:{kind:'executor_settled',commandId:'different'},context:w.context}));
 let sends=0;await dispatchNextStandard({runtime:w.runtime,context:w.context,driver:{prepare:async()=>{sends++;return{status:'held'};}}}).catch(()=>{});assert.equal(sends,0);
 await recordStandardControl({runtime:w.runtime,operationRef:op.operation_ref,expectedRevision:marked.revision,control:{kind:'executor_settled',commandId:'pending-create'},context:w.context});
 state=JSON.parse(await readFile(join(w.runtime.root,'runtime-state.json'),'utf8'));assert.equal(state.unresolved_executor,null);
});
