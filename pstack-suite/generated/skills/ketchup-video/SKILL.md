---
name: ketchup-video
description: "Catch the user up like /skill:ketchup, with a short subtitled video of slides for what happened and the waiting calls as text under it. Use for /skill:ketchup-video."
disable-model-invocation: true
---

# Ketchup video

Follow [`/skill:ketchup`](../ketchup/SKILL.md), but show what happened in a short subtitled video instead of its summary and visuals. Its window starts at the last message the user wrote before `/skill:ketchup-video`, not before any earlier `/skill:ketchup`. Writing and rendering the video, outside the repo, is the one exception to its read-only rule. The reply is ketchup's opening sentence, the embedded video, one line naming any work left that you can do yourself, and the action items. When the video shows a call's options, call each option by the name the video gives it. If the render fails, say so in one line and give only the calls.

## Slides

Use the screenshots, recordings, diffs, and data the work produced, not the chat's prose about them. Before you draw, write the one sentence the user should leave with and one line per slide. Drop each slide that does not change what the user knows. Use at most 10 slides, and fewer is better. Neither note goes in the reply.

Each slide makes one point. Build the slides on one picture and change it from slide to slide, rather than cut to an unrelated one. A color or shape means the same thing on every slide. Show the work in pictures, such as how a system works, a PR stack with each PR's state, a before and after of a fix, or options side by side. Point at what changed with arrows, highlights, and motion. A slide is never a bullet list, a status list, a table, or boxes with nothing connecting them.

Keep text to the minimum. Put each label on the thing it names, in plain words a person would say, not tags like "Tests: pass". Never caption what a picture shows, and never give a fact twice, across slides or in the text under them.

Show what came of each thing the user asked for, and whether it is done, still running, failed, or not checked. Never show something done that still waits on the user. Show any bug found and fixed on the way. If a visible change has no screenshot, say so on its slide and name what changed on screen. Draw only from facts you have. Never invent a number, and never draw a screen you did not capture.

## Subtitles

Give each slide one short subtitle line, about ten words, that says its point the way you would tell the user, from only what that slide shows. Say what the picture means rather than read out its labels. Put the subtitle in a strip below the slide, the same height on every slide and empty except for the subtitle, so it never covers the slide. Set it small, but readable when the video plays at chat size.

## Render

Render one silent landscape video, such as an mp4, with motion between slides. Every frame is the slide itself, edge to edge, above its subtitle strip. Make the frames from the slides, never by recording a screen, and burn each subtitle into its slide's frames so it stays on screen for the slide's whole hold. The hold is the time a slide is fully on screen, not counting the motion into or out of it. Hold each slide long enough to read the words it adds, at least one second for each three words. A slide adds its subtitle and each word that was not on the slide before it, including a label it changes. The first slide adds all its words. Words inside a screenshot do not count.

Before you embed the video, check the rendered file. Look at one frame from each slide at chat size, and check that its subtitle is readable and covers nothing. Measure each hold by matching the file's frames to the slide, not with a still-frame detector, which counts the faint ends of a fade as still. Count the words each slide adds against its measured hold. Fix any slide you cannot read in that time, render again, and check again.

## Run a real render in OMP

Upstream does not bundle a renderer or helper script. One supported path uses existing FFmpeg (with `xfade`, `ass`/libass, and `libx264`), FFprobe and a readable installed font. Do not install them implicitly. Work in a directory you own outside the repo.

For a two-slide report, put two same-sized landscape PNGs, `before.png` and `after.png`, in that directory. Prepare `captions.ass` as a UTF-8 Advanced SubStation Alpha subtitle file. Set `PlayResX` to the slide width and `PlayResY` to the slide height plus 64; use bottom-center alignment (2) and choose the font size and bottom margin so each single line stays entirely inside the 64-pixel strip. With the example timing, cue the first caption from `0:00:00.00` to `0:00:03.00` and the second from `0:00:03.50` to `0:00:07.50`. The half-second wipe is not part of either hold.

```sh
ffmpeg -hide_banner -loglevel error -nostdin -n -xerror -filter_complex_threads 1 -loop 1 -framerate 24 -t 3.5 -i before.png -loop 1 -framerate 24 -t 4.5 -i after.png -filter_complex "[0:v]format=yuv444p[a];[1:v]format=yuv444p[b];[a][b]xfade=transition=slideleft:duration=0.5:offset=3,pad=iw:ih+64:0:0:black,ass=captions.ass[v]" -map "[v]" -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart report.mp4
```

Use even slide dimensions. For other reports, change input durations, transition offsets and caption cues together, sizing the holds to the new words. A hold before a transition ends at its offset; the next hold starts after the transition. For more slides, chain additional transitions before padding and burning the captions. The command leaves the inputs intact and refuses to overwrite an existing `report.mp4`.

Read the actual stream and duration with `ffprobe -v error -show_streams -show_format report.mp4`; decode the video with `ffmpeg -v error -xerror -i report.mp4 -f null -` and inspect decoded frames from each hold as described above. An extension, a successful render exit, or an unburned subtitle file alone is not proof. Retain the checked video, subtitle source and necessary evidence; remove only scratch files you created. Missing dependencies, missing output or decode failure use the render-failure reply above.
