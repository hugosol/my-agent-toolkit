import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmdirSync } from "node:fs";
import connectBot from "../../extensions/connect-bot/harnesses/omp";
import connectBotPi from "../../extensions/connect-bot/harnesses/pi";
import { setPanelRequestForTest } from "../../extensions/connect-bot/shared-logic/panel/client";
import { request } from "../../framework/interface/general/http";
import { ompDouble } from "./support/omp-double";
import { ControlledClock } from "./support/controlled-clock";
import { startHerdrBot } from "./support/herdr-bot";
import { boundPiSurface } from "../framework/support/pi-surface-double";
import type { PiExtensionContext } from "../../adapters/pi";

// S2/S3, P18/P19/P20/P22/P26: exercise the real command, real HTTP transport and
// real isolated files. Restoring write access but issuing only ordinary beats
// would expose an autonomous history retry by creating the absent history file.
test("actual OMP connect keeps reporting and shutdown semantics across storage failure and explicit recovery", async () => {
    const panel = await startHerdrBot();
    const clock = new ControlledClock();
    const double = ompDouble({timers:{kind:"controlled",clock}});
    connectBot(double.api);
    const kinds: string[] = [];
    const pending = new Set<Promise<Response>>();
    setPanelRequestForTest((url, options) => {
        kinds.push(JSON.parse(options?.body ?? "{}").kind);
        const sending = request(`${panel.endpoint}${new URL(url).pathname}`, options).then(async response => {
            await response.clone().text();
            return response;
        });
        pending.add(sending);
        void sending.finally(() => pending.delete(sending));
        return sending;
    });
    const ctx = double.context({sessionId:"actual-connect-history-id",cwd:"C:/literal/interop",sessionName:"Original native",idle:false});
    const settle = async () => {
        for (let i=0;i<20;i++) { await Promise.all([...pending]); await Promise.resolve(); }
    };
    try {
        // Never request shutdown monitoring against a real power-off backend.
        expect(panel.diagnostics.join("\n")).toContain("安全壳");
        mkdirSync(`${panel.historyFile}.tmp`);
        let announced = double.nextNotification();
        double.run("connect-bot","",ctx);
        await announced;
        await settle();
        expect(double.notifications[double.notifications.length - 1]).toMatch(/已接入.*历史.*失败/);
        expect(double.notificationLevels[double.notificationLevels.length - 1]).toBe("warning");
        expect(double.widgets[double.widgets.length - 1]?.lines?.join(" ")).toContain("connectBot");
        expect(await panel.snapshot()).toContainEqual(expect.objectContaining({sessionId:"actual-connect-history-id",online:true,state:"working"}));
        expect(await fetch(`${panel.endpoint}/api/shutdown/monitor`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sessionId:"actual-connect-history-id",selected:true})}).then(r=>r.status)).toBe(200);
        rmdirSync(`${panel.historyFile}.tmp`);
        for(let beat=0;beat<6;beat++) { await clock.advanceBy(10_000); await settle(); }
        expect(kinds).toEqual(["register","state",...Array(6).fill("heartbeat")]);
        expect(existsSync(panel.historyFile)).toBe(false);
        expect(await panel.snapshot()).toContainEqual(expect.objectContaining({sessionId:"actual-connect-history-id",online:true,state:"working"}));
        double.startRun(ctx);
        await settle();
        const failedStorageCompletedCtx = double.context({sessionId:"actual-connect-history-id",cwd:"C:/literal/interop",idle:true});
        await double.settleRun(failedStorageCompletedCtx);
        await settle();
        const firstCountdown = await panel.waitFor(frame => {
            if (frame.event !== "shutdown" || frame.data === null || typeof frame.data !== "object" || !("shutdown" in frame.data)) return false;
            const state = frame.data.shutdown;
            return state !== null && typeof state === "object" && "phase" in state && state.phase === "counting-down";
        }, "countdown while history is unsaved", 5_000);
        expect(firstCountdown.data).toMatchObject({shutdown:{phase:"counting-down",monitoredSessionIds:[]}});
        expect(existsSync(panel.historyFile)).toBe(false);
        expect(await fetch(`${panel.endpoint}/api/shutdown/cancel`,{method:"POST"}).then(r=>r.status)).toBe(200);
        announced = double.nextNotification();
        double.run("connect-bot","",ctx);
        await announced;
        await settle();
        expect(double.notificationLevels[double.notificationLevels.length - 1]).toBe("info");
        const saved = await fetch(`${panel.endpoint}/api/sessions/history`).then(r=>r.json());
        expect(saved.sessions).toHaveLength(1);
        expect(saved.sessions[0]).toMatchObject({sessionId:"actual-connect-history-id",sessionName:"Original native",cwd:"C:/literal/interop",agentType:"omp"});
        expect(await fetch(`${panel.endpoint}/api/shutdown/monitor`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sessionId:"actual-connect-history-id",selected:true})}).then(r=>r.status)).toBe(200);
        const beforeCompletion = panel.frames.length;
        double.startRun(ctx);
        await settle();
        const completedCtx = double.context({sessionId:"actual-connect-history-id",cwd:"C:/literal/interop",idle:true});
        await double.settleRun(completedCtx);
        await settle();
        const countdown = await panel.waitFor(frame => {
            if (panel.frames.indexOf(frame) < beforeCompletion) return false;
            if (frame.event !== "shutdown" || frame.data === null || typeof frame.data !== "object" || !("shutdown" in frame.data)) return false;
            const state = frame.data.shutdown;
            return state !== null && typeof state === "object" && "phase" in state && state.phase === "counting-down";
        }, "completion countdown", 5_000);
        expect(countdown.data).toMatchObject({shutdown:{phase:"counting-down",monitoredSessionIds:[]}});
        expect(await fetch(`${panel.endpoint}/api/shutdown/cancel`,{method:"POST"}).then(r=>r.status)).toBe(200);
        expect(double.timers).toHaveLength(1);
        expect(double.timers[0]?.cancelled).toBe(false);
    } finally {
        double.run("connect-bot","off",ctx);
        await settle();
        setPanelRequestForTest(null);
        await panel.stop();
    }
}, 30_000);

// The Pi caller must use the same real receipt and actual UI channel, not merely
// put the warning into model context. Host API only is doubled.
test("actual Pi connect shows accepted-but-history-failed to its UI", async () => {
    const panel = await startHerdrBot();
    const surface = boundPiSurface();
    connectBotPi(surface.api);
    setPanelRequestForTest((url, options)=>request(`${panel.endpoint}${new URL(url).pathname}`,options));
    const notices: Array<{message:string;level:string}> = [];
    const notified = Promise.withResolvers<void>();
    const ctx = {cwd:"C:/literal/pi", hasUI:true, isIdle:()=>true, hasPendingMessages:()=>false,
        sessionManager:{getSessionId:()=>"actual-pi-history-id",getSessionName:()=>"Pi original",getBranch:()=>[]},
        ui:{notify:(message:string,level:string)=>{notices.push({message,level});notified.resolve();},setWidget:()=>{}}
    } as unknown as PiExtensionContext;
    const command = surface.commands.get("connect-bot")!;
    try {
        mkdirSync(`${panel.historyFile}.tmp`);
        await command.handler("",ctx);
        await notified.promise;
        expect(notices).toContainEqual({message:expect.stringMatching(/已接入.*历史.*失败/),level:"warning"});
        expect(await panel.snapshot()).toContainEqual(expect.objectContaining({sessionId:"actual-pi-history-id",online:true}));
    } finally {
        await command.handler("off",ctx);
        setPanelRequestForTest(null);
        await panel.stop();
    }
},30_000);
