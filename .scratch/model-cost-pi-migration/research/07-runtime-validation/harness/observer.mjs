import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { registerRequiredChildExtensions } from 'E:/Developer/pi-playground/wf07-iso/install/node_modules/pi-subagents/src/api/required-child-extensions.js';
const dir=process.env.WF07_OBSERVATIONS;
mkdirSync(dir,{recursive:true});
export default function(pi) {
 let sid='factory',ctx0,registration,n=0;
 const log=(at,data={})=>appendFileSync(join(dir,`${process.pid}-${sid}.jsonl`),JSON.stringify({at,ts:Date.now(),pid:process.pid,sessionId:sid,seq:++n,...data})+'\n');
 const safe=(ctx)=>({model:ctx.model?{id:ctx.model.id,provider:ctx.model.provider}:null,effort:pi.getThinkingLevel(),idle:ctx.isIdle(),pending:ctx.hasPendingMessages()});
 pi.on('session_start',(event,ctx)=>{
  ctx0=ctx;sid=ctx.sessionManager.getSessionId();
  log('session_start',{reason:event.reason,header:ctx.sessionManager.getHeader(),sessionFile:ctx.sessionManager.getSessionFile(),branch:ctx.sessionManager.getBranch().map(x=>({id:x.id,type:x.type,role:x.message?.role})),...safe(ctx),tools:pi.getAllTools().map(t=>t.name),childEnv:process.env.PI_SUBAGENT_CHILD??null});
  registration=registerRequiredChildExtensions({sessionId:sid,extensions:[{id:'wf07-observer',path:process.env.WF07_OBSERVER}],requireForAllRunners:true});
  pi.events.emit('subagent:acknowledge-extension',{id:'wf07-observer'});
 });
 for(const name of ['agent_start','agent_end','agent_settled','turn_start','turn_end','input','tool_execution_start','tool_execution_end','tool_result']) {
  pi.on(name,(event,ctx)=>log(name,{event,...safe(ctx)}));
 }
 pi.on('before_provider_request',(_event,ctx)=>log('request_start',safe(ctx)));
 pi.on('after_provider_response',(event,ctx)=>log('response_boundary',{status:event.status,...safe(ctx)}));
 pi.on('message_end',(event,ctx)=>{const m=event.message;log('message_end',{message:m,...safe(ctx)});});
 for(const channel of ['subagent:async-started','subagent:async-complete','subagent:child-status','subagent:started','subagent:completed','subagent:failed','subagent:acknowledge-extension']) pi.events.on(channel,data=>log('bus',{channel,data}));
 pi.registerTool({name:'wf07_pause',label:'WF07 pause',description:'Validation-only bounded local 20-second wait. No network or filesystem work.',parameters:{type:'object',properties:{}},execute:async(_id,_args,signal)=>{
  log('pause.started');
  await new Promise(resolve=>{const finish=()=>{clearTimeout(t);signal?.removeEventListener('abort',finish);resolve();};const t=setTimeout(finish,20000);if(signal?.aborted)finish();else signal?.addEventListener('abort',finish,{once:true});});
  log('pause.ended',{aborted:signal?.aborted??false});return {content:[{type:'text',text:signal?.aborted?'ABORTED':'WAITED'}]};
 }});
 pi.registerTool({name:'wf07_control',label:'WF07 control',description:'Validation-only read-only RPC control. Call only when explicitly requested.',parameters:{type:'object',properties:{method:{type:'string'},params:{type:'object'}},required:['method']},execute:async(_id,args)=>{
  const requestId=`wf07-control-${process.pid}-${++n}`;
  const data=await new Promise(resolve=>{const off=pi.events.on(`subagents:rpc:v1:reply:${requestId}`,reply=>{clearTimeout(t);off();resolve(reply);});const t=setTimeout(()=>{off();resolve({timeout:true});},15000);pi.events.emit('subagents:rpc:v1:request',{version:1,requestId,method:args.method,params:args.params??{}});});
  log('control',{method:args.method,data});return {content:[{type:'text',text:JSON.stringify(data)}],details:data};
 }});
 pi.on('session_shutdown',()=>{registration?.dispose();log('session_shutdown');});
}
