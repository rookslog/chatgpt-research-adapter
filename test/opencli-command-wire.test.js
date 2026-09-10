import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createOpenCliCommandTransport} from '../src/opencli-browser-command.js';
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

const status=()=>new Response(JSON.stringify({ok:true,daemonVersion:'1.8.7',contextId:'ctx',extensionConnected:true,extensionVersion:'1.0.23'}));
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'cra-wire-'));t.after(()=>rm(root,{recursive:true,force:true}));return pinnedFixture(root);}
test('new-tab wire preserves exact operation, URL, context and deadline units',async t=>{
 const f=await fixture(t),seen=[];const transport=await createOpenCliCommandTransport({...f,contextId:'ctx',requestImpl:async(path,init)=>{if(path.startsWith('/status'))return status();seen.push({init,payload:JSON.parse(init.body)});return new Response(JSON.stringify({id:seen.at(-1).payload.id,ok:true,page:'owned-page'}));}});
 const result=await transport.command({id:'create-once',action:'tabs',op:'new',url:'https://chatgpt.com/',session:'owned-operation'});
 assert.equal(result.page,'owned-page');assert.equal(seen.length,1);const {payload,init}=seen[0];assert.equal(payload.op,'new');assert.equal(payload.url,'https://chatgpt.com/');assert.equal(payload.contextId,'ctx');assert.equal(payload.windowMode,'background');assert.equal(payload.timeout,120);assert.equal(init.timeout,120000);assert.ok(payload.deadlineAt>Date.now());assert.ok(payload.deadlineAt<=Date.now()+120000);
 await assert.rejects(transport.command({id:'no-op',action:'tabs',session:'owned-operation'}));assert.equal(seen.length,1);
});
test('command body deadline bounds a hung response and preserves unknown effect without retry',{timeout:5000},async t=>{
 const f=await fixture(t);let posts=0,cancelled=false;const transport=await createOpenCliCommandTransport({...f,contextId:'ctx',requestImpl:async(path)=>{if(path.startsWith('/status'))return status();posts++;return{ok:true,status:200,body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>{cancelled=true;}})}};}});
 t.mock.timers.enable({apis:['setTimeout']});const pending=transport.command({id:'hung-body',action:'exec',page:'p',session:'o',code:'1'});const rejected=assert.rejects(pending,e=>e.executorUnresolved===true&&e.commandId==='hung-body');
 // Source integrity includes filesystem awaits. Let the command reach its response body first.
 while(posts===0)await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(120001);await rejected;assert.equal(posts,1);assert.equal(cancelled,true);t.mock.timers.reset();
});
