import { expect, test } from "bun:test";
import connectBot from "../../extensions/connect-bot/harnesses/omp";
import { setPanelRequestForTest } from "../../extensions/connect-bot/shared-logic/panel/client";
import { ompDouble } from "./support/omp-double";
import { ControlledClock } from "./support/controlled-clock";

// S3/P18/P19/P22: a successful register with failed history must visibly warn the
// operator, keep the marker and continue normal heartbeat only. Dropping the
// extra receipt fields would leave only the ordinary success notification.
test("connect warns its operator without disarming or autonomously registering again", async () => {
    const requests: string[] = [];
    const clock = new ControlledClock();
    const double = ompDouble({ timers: { kind: "controlled", clock } });
    connectBot(double.api);
    setPanelRequestForTest(async (_url, options) => {
        const kind = JSON.parse(options?.body ?? "{}").kind;
        requests.push(kind);
        return Response.json(kind === "register" ? {
            outcome:"registered", onlineCount:1, historySaved:false,
            historyWarning:{code:"history-save-failed", message:"History unavailable"}
        } : {outcome:"accepted"});
    });
    const ctx = double.context({ sessionId:"history-warning-native", cwd:"C:/literal/project", idle:false });
    try {
        const notice = double.nextNotification();
        double.run("connect-bot", "", ctx);
        await notice;
        expect(double.notifications[double.notifications.length - 1]).toMatch(/已接入.*历史.*失败/);
        expect(double.notificationLevels[double.notificationLevels.length - 1]).toBe("warning");
        expect(double.widgets[double.widgets.length - 1]?.lines?.join(" ")).toContain("connectBot");
        expect(requests).toEqual(["register", "state"]);
        await clock.advanceBy(60_000);
        for(let turn=0;turn<100;turn++) await Promise.resolve();
        expect(requests).toEqual(["register", "state", ...Array(6).fill("heartbeat")]);
        expect(double.timers).toHaveLength(1);
        expect(double.timers[0]?.cancelled).toBe(false);
    } finally {
        double.run("connect-bot", "off", ctx);
        setPanelRequestForTest(null);
    }
});
