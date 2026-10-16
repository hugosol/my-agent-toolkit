import { appendFileSync } from 'node:fs';
import { registerRequiredChildExtensions } from 'E:/Developer/pi-playground/wf07-iso/install/node_modules/pi-subagents/src/api/required-child-extensions.js';
const log = (record) => appendFileSync(process.env.WF07_LOG, JSON.stringify({ts:new Date().toISOString(),pid:process.pid,...record})+'\n');
export default function(pi) {
  let registration;
  let n=0;
  const call=(method,params={})=>{
    const requestId=`wf07-${method}-${++n}`;
    const off=pi.events.on(`subagents:rpc:v1:reply:${requestId}`,data=>{log({at:'rpc.reply',method,data});off();});
    log({at:'rpc.send',method});
    pi.events.emit('subagents:rpc:v1:request',{version:1,requestId,method,params});
  };
  log({at:'factory'});
  pi.events.on('subagents:rpc:v1:ready',data=>log({at:'rpc.ready',data}));
  pi.on('before_provider_request',()=>log({at:'UNEXPECTED_PROVIDER_REQUEST'}));
  pi.on('session_start',(_event,ctx)=>{
    const sessionId=ctx.sessionManager.getSessionId();
    log({at:'session_start',sessionId,header:ctx.sessionManager.getHeader(),tools:pi.getAllTools().map(t=>t.name),nativeCapabilities:{viewedRead:typeof ctx.getViewedSession,viewedSubscribe:typeof ctx.subscribeViewedSessionChanged,asyncSnapshot:typeof ctx.getAsyncJobSnapshot,contextUsage:typeof ctx.getContextUsage,sessionName:typeof ctx.sessionManager.getSessionName,sessionNameSubscription:typeof ctx.sessionManager.onSessionNameChanged,timer:typeof ctx.setTimeout,clearTimer:typeof ctx.clearTimer,hasUI:ctx.hasUI,modelRegistry:typeof ctx.modelRegistry}});
    registration=registerRequiredChildExtensions({sessionId,extensions:[{id:'wf07-observer',path:process.env.WF07_PROBE}],requireForAllRunners:true});
    log({at:'registration.created',sessionId});
    call('ping');call('status');call('cost');
  });
  pi.on('session_shutdown',()=>{
    registration?.dispose();
    log({at:'registration.disposed'});
  });
}
