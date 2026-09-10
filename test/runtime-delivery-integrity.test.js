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

test('malformed or unbounded observer expiry never establishes delivery readiness',async t=>{
 const w=await configuration(t),r=await admission(w),clock={now:()=>100000};
 await binding.activateObserver({config:w.config,operationRef:r.operation_ref,observerId:'owner',generation:'generation',ttlMs:60000,clock});
 const path=join(w.config.runtime.root,'observers',r.operation_ref+'.json'),original=JSON.parse(await readFile(path,'utf8'));
 assert.equal(binding.deliveryReady({config:w.config,operationRef:r.operation_ref,clock}),true);
 for(const changed of [{expires_at:'garbage'},{expires_at:undefined},{activated_at:0,expires_at:999999999,ttl_ms:999999999},{schema:'wrong-schema'}]){
  await writeFile(path,JSON.stringify({...original,...changed}));
  assert.equal(binding.deliveryReady({config:w.config,operationRef:r.operation_ref,clock}),false,JSON.stringify(changed));
 }
});
test('activation cannot silently replace an active recipient generation',async t=>{
 const w=await configuration(t),r=await admission(w),clock={now:()=>100000};
 const original={config:w.config,operationRef:r.operation_ref,observerId:'original-owner',generation:'original-generation',ttlMs:60000,clock};
 await binding.activateObserver(original);
 await assert.rejects(binding.activateObserver({...original,observerId:'other-owner',generation:'other-generation'}));
 assert.equal((await binding.renewObserver(original)).observer_id,'original-owner');
});
