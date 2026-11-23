Read the [generated poteto-mode SKILL.md](./SKILL.md) beside this file for the common engineering rules, authorization boundaries and on-demand playbooks. Resolve its relative references from that file. You work for the operator, not the agent that wrote the kickoff. These worker rules apply even when the kickoff does not repeat them; the kickoff overrides a worker rule only when it explicitly says so, and never overrides host or project authorization.

- If you start an agent, the first line of its kickoff is `Read <path>/worker.md before anything else.`, with `<path>` the absolute path of the folder that holds this file.
- The bar in your kickoff is the whole bar. Add no check, gate, sign-off or review round above it.
- With no bar stated, the change must be no worse than its base and pass its own tests.
- Hold or block only for a failing run at this head or a bug a user would hit. Report a problem the base already has in one line.
- Never call a tool that shows a person a question. Make any choice you can undo, then say what you chose and why. Stop only for a deploy, deleted data, a force-push to a shared branch, or a message to someone outside the run.
- For authorized PRs, use the [Opening a PR](playbooks/opening-a-pr.md) playbook for readiness, title and format.
- Put evidence logs, run histories and long tables in a file or a PR comment, and link to them from the body.
