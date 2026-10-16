"""Reconcile real observations against independently persisted Pi sessions; no model calls.
Runs before isolation cleanup. Saves compact analysis and replay-idempotence evidence.
"""
import collections, json, pathlib
ISO=pathlib.Path('E:/Developer/pi-playground/wf07-iso')
def load_rows():
 return [json.loads(line) for f in (ISO/'observations').glob('*.jsonl') for line in f.read_text(encoding='utf-8').splitlines()]
def reconcile(rows):
 starts=sorted((r for r in rows if r['at']=='session_start'),key=lambda r:r['ts'])
 sessions={}
 for r in starts:
  sessions.setdefault(r['sessionId'],r)
 paid={}; repeats=0
 for r in rows:
  if r['at']!='message_end' or r.get('message',{}).get('role')!='assistant':continue
  m=r['message']; rid=m.get('responseId')
  if not rid:continue
  key=(r['sessionId'],m['provider'],rid)
  if key in paid:repeats+=1
  paid[key]=m
 independent={}; inherited=0; mappings=[]
 for sid,start in sessions.items():
  baseline={x['id'] for x in start['branch']}
  path=pathlib.Path(start['sessionFile'])
  entries=[json.loads(line) for line in path.read_text(encoding='utf-8').splitlines()]
  for entry in entries:
   m=entry.get('message',{})
   if m.get('role')!='assistant' or not m.get('responseId'):continue
   if entry.get('id') in baseline:inherited+=1;continue
   key=(sid,m['provider'],m['responseId']);independent[key]=m
  parent=start['header'].get('parentSession')
  parent_sid=None
  if parent:
   header=json.loads(pathlib.Path(parent).read_text(encoding='utf-8').splitlines()[0]);parent_sid=header['id']
  mappings.append({'sessionId':sid,'parentSessionIdFromFile':parent_sid,'file':str(path),'bindings':[{'pid':r['pid'],'at':r['ts'],'reason':r['reason'],'branchEntries':len(r['branch'])} for r in starts if r['sessionId']==sid]})
 missing_observer=set(independent)-set(paid);missing_transcript=set(paid)-set(independent)
 usage_mismatch=[list(k) for k in paid.keys() & independent.keys() if paid[k].get('usage')!=independent[k].get('usage')]
 fields=['input','output','cacheRead','cacheWrite','totalTokens']
 def totals(data):
  return {'requests':len(data),'tokens':{f:sum(m.get('usage',{}).get(f,0) for m in data.values()) for f in fields},'costUSD':sum(m.get('usage',{}).get('cost',{}).get('total',0) for m in data.values())}
 by_session={sid:totals({k:v for k,v in paid.items() if k[0]==sid}) for sid in sessions}
 intervals=[]
 for sid in sessions:
  active={}
  for r in sorted((x for x in rows if x['sessionId']==sid),key=lambda x:x['ts']):
   if r['at']=='agent_start':active[r['pid']]=r['ts']
   if r['at']=='agent_settled' and r['pid'] in active:
    a=active.pop(r['pid']);intervals.append({'sessionId':sid,'pid':r['pid'],'start':a,'end':r['ts'],'observedActiveMs':r['ts']-a,'aborted':r.get('event',{}).get('aborted')})
 return {'observer':totals(paid),'transcript':totals(independent),'missingObserver':[list(k) for k in missing_observer],'missingTranscript':[list(k) for k in missing_transcript],'usageMismatch':usage_mismatch,'inheritedAssistantResponsesExcluded':inherited,'duplicateObservationResponses':repeats,'sessions':mappings,'bySession':by_session,'observedActiveIntervals':intervals,'requestStartCount':sum(r['at']=='request_start' for r in rows),'responseBoundaryCount':sum(r['at']=='response_boundary' for r in rows)}
if __name__=='__main__':
 rows=load_rows();result=reconcile(rows);replay=reconcile(rows+rows)
 result['replayIdempotent']=result['observer']==replay['observer'] and result['bySession']==replay['bySession']
 result['replayedDuplicateResponses']=replay['duplicateObservationResponses']
 print(json.dumps(result,indent=2))
