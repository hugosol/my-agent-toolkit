import { appendFileSync, readFileSync } from "node:fs";

// Executable test peer for gh. Replies are independent inputs, not watcher verdicts.
const args = process.argv.slice(2);
const fixture = JSON.parse(readFileSync(process.env.PSTACK_FORGE_FIXTURE!, "utf8"));
appendFileSync(process.env.PSTACK_FORGE_CALLS!, `${JSON.stringify(args)}\n`);
const [group, operation, id] = args;
const field = (prefix: string) => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const repo = args[args.indexOf("--repo") + 1];
const pr = group === "api" ? field("pr=") : id;
const matchesRepo = group === "api"
  ? field("owner=") === "isolated" && field("repo=") === "demo"
  : repo === "isolated/demo";
const row = matchesRepo ? fixture[pr ?? ""] : undefined;
const query = field("query=");

if (row && group === "pr" && operation === "view") {
  if (row.error) {
    console.error(row.error);
    process.exit(1);
  }
  console.log(JSON.stringify(row.view));
} else if (row && group === "pr" && operation === "checks") {
  console.log(JSON.stringify([{ name: "test", bucket: "pass", state: "SUCCESS", link: "", workflow: "Test", description: "" }]));
} else if (row && group === "api" && operation === "graphql" && query?.includes("query ReviewThreads")) {
  console.log(JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } }));
} else if (row && group === "api" && operation === "graphql" && query?.includes("query PrCommitStatuses")) {
  console.log(JSON.stringify({ data: { repository: { pullRequest: { commits: { nodes: [{ commit: { oid: row.view.headRefOid, statusCheckRollup: { state: "SUCCESS" } } }] } } } } }));
} else if (row && group === "api" && operation === "graphql" && query?.includes("query LandingState")) {
  if (row.error) {
    console.error(row.error);
    process.exit(1);
  }
  console.log(JSON.stringify({ data: { repository: { pullRequest: { ...row.view, ...row.landing } } } }));
} else {
  console.error(`Unexpected controlled forge request: ${JSON.stringify(args)}`);
  process.exitCode = 13;
}
