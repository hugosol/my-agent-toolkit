import { expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startCaptureServer, type CaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";

const captions = `[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 244

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,12,12,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:03.00,Default,,0,0,0,,The gate opens
Dialogue: 0,0:00:03.50,0:00:07.50,Default,,0,0,0,,Now the gate has safely closed
`;

// S3: run the recipe received from a real native skill invocation. The fixture
// independently calls for a 3 s red hold, a moving 0.5 s wipe and a 4 s blue
// hold with different captions. An output that only exists, drops the second
// slide, mistimes either hold, or leaves the subtitles out cannot pass readback.
test("P42 P36 renders a silent, captioned report and decodes its holds and motion", async () => {
  const run = createRunRoot("pstack-video-render");
  const files = ["before.png", "after.png", "captions.ass", "report.mp4", "first.ppm", "transition.ppm", "last.ppm"];
  const evidence: Record<string, unknown> = { platform: process.platform, bun: Bun.version, ownedRunRoot: run.path };
  const processes: unknown[] = [];
  evidence.processes = processes;
  let capture: CaptureServer | undefined;
  let session: ControlledSession | undefined;
  let command: string | undefined;
  const readMedia = (exe: string, ...args: string[]) => {
    const argv = [exe, ...args];
    const child = Bun.spawnSync(argv, { cwd: run.workDir, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 20_000 });
    const stderr = child.stderr.toString();
    processes.push({ argv, pid: child.pid, exit: child.exitCode, stderr,
      ...(args.includes("pipe:1") ? { decodedBytes: child.stdout.length } : { stdout: child.stdout.toString() }) });
    expect(child.exitCode, stderr).toBe(0);
    return child.stdout;
  };
  try {
    const ffmpeg = Bun.which("ffmpeg");
    const ffprobe = Bun.which("ffprobe");
    if (!ffmpeg || !ffprobe) throw new Error("Video proof requires existing ffmpeg and ffprobe executables on PATH.");
    readMedia(ffmpeg, "-version");
    readMedia(ffprobe, "-version");
    for (const [color, file] of [["red", "before.png"], ["blue", "after.png"]]) {
      readMedia(ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-f", "lavfi", "-i", `color=${color}:s=320x180`,
        "-frames:v", "1", "-threads", "1", "-update", "1", file);
    }
    writeFileSync(join(run.workDir, "captions.ass"), captions);
    const harness = await resolveInstalledOmp();
    evidence.harness = harness;
    capture = startCaptureServer({
      dir: run.captureDir,
      respond: ({ index }) => index === 2 && command ? { toolCall: { name: "bash", arguments: JSON.stringify({ command }) } } : undefined,
    });
    const skills = resolve(import.meta.dir, "../../pstack-suite/generated/skills");
    writeFileSync(join(run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(skills)}\n`);
    session = await ControlledSession.start({
      harness, runRoot: run, extensions: [resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts")],
      model: DOCK_MODEL_SELECTOR,
      env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, HOME: run.agentDir, USERPROFILE: run.agentDir },
      extraArgs: ["--offline"],
    });
    const done = { agentInvoked: true, status: "completed" };
    expect(await session.prompt("/skill:ketchup-video Read the runnable render example.")).toMatchObject(done);
    const request = capture.requests()[0]?.json as { messages?: { role: string; content: { type: string; text?: string }[] | string }[] } | undefined;
    const text = request?.messages?.flatMap(({ role, content }) => role === "user"
      ? typeof content === "string" ? [content] : content.flatMap(block => block.type === "text" && block.text ? [block.text] : [])
      : []);
    const recipe = text?.map(content => /```sh\r?\n(ffmpeg [^\r\n]+)\r?\n```/.exec(content)?.[1]).find(Boolean);
    expect(recipe, "Native skill attachment must supply the runnable FFmpeg recipe").toBeDefined();
    command = recipe;
    evidence.command = command;
    expect(await session.prompt("Run the supplied example on the two owned slides and their caption file.")).toMatchObject(done);
    const toolResults = session.frames().filter(frame => frame.type === "tool_execution_end" && frame.toolName === "bash");
    expect(toolResults.map(frame => frame.isError)).toEqual([false]);
    const result = toolResults[0]!.result as { details?: { trace?: { history?: {
      kind: string; argv?: string[]; pid?: number; status?: number; command?: { seq: number };
    }[] } } };
    const history = result.details?.trace?.history ?? [];
    const spawns = history.filter(event => event.kind === "Spawn" && event.argv?.[0] === "ffmpeg");
    expect(spawns).toHaveLength(1);
    const renderer = spawns[0]!;
    const pid = renderer.pid!;
    expect(pid).toBeGreaterThan(0);
    expect(renderer.command).toBeDefined();
    const end = history.find(event => event.kind === "CmdEnd" && event.command?.seq === renderer.command?.seq);
    expect(end?.status).toBe(0);
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
    // Query the OS, not the shell's virtual job table, and never terminate a PID.
    let live = true;
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      live = false;
    }
    evidence.renderProcess = { pid, exit: end?.status, live };
    expect(live).toBe(false);

    const metadata = JSON.parse(readMedia(ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", "report.mp4").toString());
    expect(metadata.format.format_name.split(",")).toContain("mp4");
    expect(Number(metadata.format.duration)).toBeCloseTo(7.5, 2);
    expect(metadata.streams).toHaveLength(1);
    expect(metadata.streams[0]).toMatchObject({ codec_type: "video", codec_name: "h264", width: 320, height: 244, avg_frame_rate: "24/1" });
    const { width, height } = { width: 160, height: 122 };
    const stride = width * height * 3;
    const decoded = readMedia(ffmpeg, "-v", "error", "-xerror", "-nostdin", "-i", "report.mp4", "-vf", "scale=160:122",
      "-pix_fmt", "rgb24", "-threads", "1", "-f", "rawvideo", "pipe:1");
    expect(decoded.length / stride).toBe(180);
    const frame = (index: number) => decoded.subarray(index * stride, (index + 1) * stride);
    const color = (image: Buffer, x: number) => {
      const i = (30 * width + x) * 3;
      const r = image[i], g = image[i + 1], b = image[i + 2];
      return r > 220 && g < 30 && b < 30 ? "red" : b > 220 && r < 30 && g < 30 ? "blue" : "other";
    };
    const whitePixels = (image: Buffer, y1: number, y2: number) => {
      let count = 0;
      for (let i = y1 * width * 3; i < y2 * width * 3; i += 3) {
        if (image[i] > 160 && image[i + 1] > 160 && image[i + 2] > 160) count++;
      }
      return count;
    };
    const observed = Array.from({ length: 180 }, (_, index) => {
      const image = frame(index);
      return { left: color(image, 20), right: color(image, 140), caption: whitePixels(image, 90, height),
        overlap: whitePixels(image, 0, 90) };
    });
    evidence.decodedFrames = observed;
    for (const [file, index] of [["first.ppm", 36], ["transition.ppm", 78], ["last.ppm", 132]] as const) {
      writeFileSync(join(run.workDir, file), Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), frame(index)]));
    }
    expect(observed.slice(0, 72).every(f => f.left === "red" && f.right === "red" && f.caption > 20)).toBe(true);
    expect(observed[78]).toMatchObject({ left: "red", right: "blue", caption: 0 });
    expect(observed.slice(84).every(f => f.left === "blue" && f.right === "blue" && f.caption > observed[36].caption * 1.5)).toBe(true);
    expect(observed.every(f => f.overlap === 0)).toBe(true);
  } finally {
    try {
      if (session && !session.exited()) await session.stop();
      Object.assign(evidence, { argv: session?.argv, exit: session?.exited(), frames: session?.frames(),
        requests: capture?.requests().map(({ raw }) => raw) });
      const dir = process.env.PSTACK_VIDEO_EVIDENCE_DIR;
      if (dir) {
        mkdirSync(dir, { recursive: true });
        for (const name of files) {
          const path = join(run.workDir, name);
          if (existsSync(path)) copyFileSync(path, join(dir, name));
        }
      }
    } finally {
      capture?.stop();
      run.dispose();
      const rootRemoved = !existsSync(run.path);
      const dir = process.env.PSTACK_VIDEO_EVIDENCE_DIR;
      if (dir) writeFileSync(join(dir, "video-render-omp.json"), JSON.stringify({ ...evidence, rootRemoved }, null, 2));
      expect(rootRemoved).toBe(true);
    }
  }
}, 180_000);
