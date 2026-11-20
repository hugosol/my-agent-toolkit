---
name: poteto-help
description: Guides users through pstack setup, /poteto-mode, and picking the skill, playbook, or principle for a task. Type /skill:poteto-help with a question.
disable-model-invocation: true
---

# Poteto help

Answer the user's question about pstack, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a pstack run spends real tokens, so let them send the prompt.

A message asking for work, such as "use pstack to fix this bug", is not a help question. Read [poteto-mode](../poteto-mode/SKILL.md) and do the work under it. If the session loads the continuous mode extension, /poteto-mode toggles it. /skill:poteto-mode attaches the generated mode instructions for one turn.

Read the generated file you route to before quoting it. Link the installed file and use its real path; an upstream link does not certify that its steps are available here.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with `/poteto-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make pstack my own

## Get set up

Use an OMP session configured for the pstack Suite. Check which resources and model bindings are actually installed before promising a workflow. Use [`/skill:setup-pstack`](../setup-pstack/SKILL.md) to review and confirm role bindings even before any roles are configured; do not presume defaults or change global OMP models. Model changes take effect in a new session after the suite has been rebuilt with current sessions stopped.

Delegation and review panels consume extra model calls. Explain costs from the actual configured roles, not guesses about built-in models.

## Start a task with poteto-mode

A prompt should give a goal and a check that can fail. The mode matches a playbook and reads the referenced steps as needed. Continuous mode and an explicit /skill:poteto-mode invocation are different; an explicit skill attachment does not toggle continuous mode.

## Pick a skill

These are explicit OMP commands. Read the leaf before giving a recommendation and give the user one example prompt.

| The user wants to | Skill |
|---|---|
| Restate the goal before work | [`/skill:in-your-own-words`](../in-your-own-words/SKILL.md) |
| Make a prompt deeper without doing the work | [`/skill:sharpen`](../sharpen/SKILL.md) |
| Understand how code runs or where code belongs | [`/skill:how`](../how/SKILL.md) |
| Trace a design decision, regression or number to its source | [`/skill:why`](../why/SKILL.md) |
| Understand a subsystem in plain language | [`/skill:teach`](../teach/SKILL.md) |
| Catch up on changes and decisions in this chat | [`/skill:ketchup`](../ketchup/SKILL.md) |
| Restate the last reply plainly | [`/skill:bro`](../bro/SKILL.md) |
| Assess what else a change can break | [`/skill:blast-radius`](../blast-radius/SKILL.md) |
| Design types and boundaries before code | [`/skill:architect`](../architect/SKILL.md) |
| Run parallel slices, a race, or both | [`/skill:swarm`](../swarm/SKILL.md) |
| Synthesize the best of multiple independent candidates | [`/skill:arena`](../arena/SKILL.md) |
| Keep only adversarial findings a rerun proves | [`/skill:interrogate`](../interrogate/SKILL.md) |
| Pin a bug with a failing test when a cheap local seam exists | [`/skill:tdd`](../tdd/SKILL.md) |
| Apply TypeScript guidance | [`/skill:typescript-best-practices`](../typescript-best-practices/SKILL.md) |
| Review comments and encode constraints | [`/skill:no-comments`](../no-comments/SKILL.md) |
| Cut artificial phrasing | [`/skill:unslop`](../unslop/SKILL.md) |
| Write docs, PR descriptions or commit messages | [`/skill:technical-writing`](../technical-writing/SKILL.md) |
| Vet a measured performance number | [`/skill:benchmark-checklist`](../benchmark-checklist/SKILL.md) |
| Design and verify an auditable run when no playbook fits | [`/skill:figure-it-out`](../figure-it-out/SKILL.md) |
| Keep a reviewable decision trail | [`/skill:show-me-your-work`](../show-me-your-work/SKILL.md) |

How explains the current mechanism, why cites its historical reasons, and teach combines them. Ketchup covers only this chat; for a supplied branch or resume note use [Session pickup](../poteto-mode/playbooks/session-pickup.md).

## Playbooks and principles

Playbooks are steps, not slash commands. The [generated mode](../poteto-mode/SKILL.md#playbooks) is the default route list for investigation, design, implementation, refactoring, bug fixing, performance, prototype, visual parity, forensics, handoff, PR opening and babysitting, shipping a verified stack, and local autonomous or autopilot runs. The [principles](../poteto-mode/SKILL.md#principles) are hidden leaf skills the mode reads on demand. The mode should cite only leaves it actually read.

## Fix a run that went wrong

- Somebody reported success from a build alone: check the actual behavior on the corresponding surface and report missing evidence.
- Parallel workers overwrote files: use a single owner for shared changes or separate worktrees for independent changes.
- A handoff lost context: use an explicit resume note, branch and decision log rather than guessing from another chat.
- An action is not shipped: say it is unavailable in this suite. See the [migration backlog](../../../MIGRATION-BACKLOG.md) for the boundaries; names there are not commands. Never claim that a generic reply or a missing tool completed the action.

## Make pstack my own

Generated files are not user-editable configuration. Maintain the fixed snapshot and [named mappings](../../../README.md#更新流程) or keep personal skills in user-owned resources. Stop same-package sessions before rebuilding; start fresh afterward.

## Reply

Lead with the answer. Give at most one example prompt in a code block, based on the selected generated leaf, then link that leaf. Keep it short unless the user asked for the whole map.
