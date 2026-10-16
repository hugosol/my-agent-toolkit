"""WF07 isolated real-host driver. Never prints or persists credentials."""
import json, os, pathlib, queue, subprocess, threading, time
ISO=pathlib.Path('E:/Developer/pi-playground/wf07-iso')
NODE='D:/nvm4w/nodejs/node.exe'
CLI='D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'
OBSERVER=pathlib.Path(__file__).with_name('observer.mjs').resolve()
class Host:
 def __init__(self,name):
  self.name=name; self.rows=[]; self.errors=[]; self.q=queue.Queue()
  env={k:v for k,v in os.environ.items() if not any(s in k.upper() for s in ['API_KEY','TOKEN','SECRET','CREDENTIAL'])}
  env.update(PI_CODING_AGENT_DIR=str(ISO/'agent'),PI_CODING_AGENT_SESSION_DIR=str(ISO/'sessions'),PI_SKIP_VERSION_CHECK='1',PI_TELEMETRY='0',WF07_OBSERVATIONS=str(ISO/'observations'),WF07_OBSERVER=str(OBSERVER))
  env['DEEPSEEK_API_KEY']=pathlib.Path('E:/Developer/pi-playground/dskey.txt').read_text().strip()
  self.args=[NODE,CLI,'--mode','rpc','--provider','deepseek','--model','deepseek-flash','--thinking','off','--no-extensions','--no-skills','--no-prompt-templates','--no-context-files','--no-mcp','--session',str(ISO/'sessions'/f'{name}.jsonl'),'-e',str(ISO/'install/node_modules/pi-subagents/index.js'),'-e',str(OBSERVER)]
  self.p=subprocess.Popen(self.args,cwd=ISO/'project',env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
  def collect(stream,rows,parse):
   for line in stream:
    rows.append(line)
    if parse:
     try:self.q.put(json.loads(line))
     except ValueError:pass
  threading.Thread(target=collect,args=(self.p.stdout,self.rows,True),daemon=True).start()
  threading.Thread(target=collect,args=(self.p.stderr,self.errors,False),daemon=True).start()
 def send(self,data):
  self.p.stdin.write(json.dumps(data)+'\n');self.p.stdin.flush()
 def wait(self,predicate,timeout=120):
  end=time.monotonic()+timeout
  while True:
   row=self.q.get(timeout=max(0.01,end-time.monotonic()))
   if row.get('type')=='extension_error': print('EXTENSION_ERROR',row)
   if predicate(row):return row
 def prompt(self,text,timeout=120):
  self.send({'type':'prompt','message':text})
  return self.wait(lambda r:r.get('type')=='agent_end',timeout)
 def save(self):
  dest=pathlib.Path(__file__).parent.parent/'raw';dest.mkdir(exist_ok=True)
  (dest/f'{self.name}.stdout.jsonl').write_text(''.join(self.rows),encoding='utf-8')
  (dest/f'{self.name}.stderr.txt').write_text(''.join(self.errors),encoding='utf-8')
 def close(self):
  if self.p.poll() is None:
   self.p.stdin.close()
   try:self.p.wait(timeout=15)
   except subprocess.TimeoutExpired:self.p.terminate();self.p.wait(timeout=10)
  self.save()
