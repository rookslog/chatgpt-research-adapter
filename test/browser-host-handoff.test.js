import assert from 'node:assert/strict';
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
test('auth handoff executes one owned private backend, reuses it, and requires exact signed-in handback',async t=>{
 const w=await hostFixture(t);const shown=await browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl});
 assert.equal(shown.status,'auth_required');assert.equal(w.calls(),1);assert.equal(await humanControlActive(w.config.runtime),true);
 const secret=await readFile(w.config.browserHost.viewer.secretPath,'utf8');assert.ok(secret.trim().length>=32);assert.equal((await stat(w.config.browserHost.viewer.secretPath)).mode&0o777,0o600);assert.equal(JSON.stringify(shown).includes(secret.trim()),false);
 const repeated=await browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl});assert.equal(w.calls(),1,'reuse must not create competing same-profile backend');assert.equal(repeated.backend.pid,shown.backend.pid);
 const wrong=await browserHost.authCheck({config:w.config,transport:{probeAuth:async()=>({signedIn:true,contextId:'other'})}});assert.notEqual(wrong.status,'signed-in');assert.equal(await humanControlActive(w.config.runtime),true);
 const restored=await browserHost.authCheck({config:w.config,transport:{probeAuth:async()=>({signedIn:true,contextId:w.config.browser.contextId})}});assert.equal(restored.status,'signed-in');assert.equal(await humanControlActive(w.config.runtime),false);
});
test('human auth waits for in-flight browser ownership and prevents another dispatch during the handoff',async t=>{
 const w=await hostFixture(t);await admission(w);let enter,release;const entered=new Promise(r=>{enter=r;}),gate=new Promise(r=>{release=r;});let sends=0;
 const context={authorize:()=>true,deliveryReady:()=>true,random:()=>0};
 const first=dispatchNextStandard({runtime:w.config.runtime,context,driver:{prepare:async()=>{enter();await gate;return {status:'held'};},send:async()=>{sends++;}}});await entered;
 const handoff=browserHost.authShow({config:w.config,spawnImpl:w.spawnImpl});
 try{
  const early=await Promise.race([handoff.then(()=> 'finished'),new Promise(r=>setTimeout(()=>r('waiting'),150))]);assert.equal(early,'waiting');assert.equal(w.calls(),0);
 }finally{release();await first;}
 await handoff;let prepares=0;
 const next=await dispatchNextStandard({runtime:w.config.runtime,context,driver:{prepare:async()=>{prepares++;return{status:'held'};},send:async()=>{sends++;}}});
 assert.equal(prepares,0);assert.equal(sends,0);assert.equal(next.status,'held');
});
