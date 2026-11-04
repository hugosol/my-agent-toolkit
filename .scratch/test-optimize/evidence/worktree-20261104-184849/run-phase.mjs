import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const here=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/,"$1:"));
const meta=JSON.parse(await readFile(path.join(here,"environment.json"),"utf8"));
const phase=process.argv[2];
const focused={
  "focus-modes":["test","./tests/harness-dock/model-cost-modes.test.ts","--test-name-pattern=an unlisted pair"],
  "focus-modes-all":["test","./tests/harness-dock/model-cost-modes.test.ts"],
  "focus-integration":["test","./tests/integrations/cli.test.ts"],
  "focus-activity":["test","./tests/harness-dock/activity-facts.test.ts"],
};
const command=focused[phase] ?? (phase==="dock-cold" ? ["run","test:dock:serial"] : ["run","test"]);
command.push("--reporter=junit",`--reporter-outfile=${path.join(here,phase+".xml")}`,`--timings=${path.join(here,phase+"-timings.json")}`,"--update-timings");
const start=performance.now();
const log=createWriteStream(path.join(here,phase+".log"));
console.log(JSON.stringify({phase,command:[process.execPath,...command],cwd:meta.worktree,startedAt:new Date().toISOString()}));
const child=spawn(process.execPath,command,{cwd:meta.worktree,env:{...process.env,...meta.envOverrides},stdio:["ignore","pipe","pipe"]});
child.stdout.pipe(log,{end:false}); child.stderr.pipe(log,{end:false});
const exit=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("close",resolve);});
await new Promise(resolve=>log.end(resolve));
const result={phase,command:["bun",...command],wallSeconds:(performance.now()-start)/1000,exit,finishedAt:new Date().toISOString()};
await writeFile(path.join(here,phase+"-summary.json"),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
process.exitCode=exit;
