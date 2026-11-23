### Pause safely

**You own a clean stop. Leave a checkpoint a cold-start agent can resume from.** This is explicit only. On "keep going", "going to bed, keep going", or "don't stop", do not pause.

1. Stop at a safe boundary. Finish the current atomic step or back out of it. Start nothing new, and cancel any nested subagents.
2. Take no irreversible action to pause. No PR and no push unless you already had one out.
3. Make the work durable. Commit the run’s own uncommitted edits as one clear `wip:` commit on the current branch so nothing is lost. Keep unrelated edits out and respect project commit authorization. If the tree is broken, say so in the commit body in one line.
4. Write the resume note in the run’s owned scratch directory as `<slug>-resume.md`, before compacting or leaving the conversation. Record intent, the current branch/worktree and WIP SHA (or why no commit was authorized), what is verified and how, current state, next action, key files, and gotchas. Carry over relevant facts from the current conversation; link an existing decision log instead of duplicating it. Give the note’s absolute path so the next OMP session can read it explicitly.

**Reply:** where you are in the loop, what's on disk versus still in your head (paths, no diff dumps), the commits you made and whether the tree is clean, and the first action on resume. This is a pause, not a final report.
