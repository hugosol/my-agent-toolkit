---
name: control-ui
description: Build or adapt a local browser/CDP harness to drive and inspect a web, IDE, or Electron UI. Use for local UI verification, screenshots, accessibility snapshots, perf profiles, visual diffs, or reproducing UI bugs.
---

# Control UI

Use local browser automation to verify UI behavior with evidence. First reuse the repo's own Playwright, browser, or Electron harness if it exists; otherwise assemble a temporary local harness around the app's dev server or Chromium debug port.

## What It Is Used For

- Reproducing UI bugs that depend on real browser focus, keyboard input, scrolling, resizing, or rendering.
- Verifying visual or accessibility changes with screenshots and snapshots.
- Checking local web, IDE, or Electron behavior before shipping.
- Capturing console logs, network logs, CPU profiles, traces, or heap snapshots.
- Creating before/after evidence for `verify-this`.

## Setup Pattern

1. Start the app locally using the repo's documented dev command.
2. Discover existing local harnesses: Playwright tests, Cypress specs, Storybook, browser scripts, Electron launch scripts, or snapshot tools.
3. For a web app, connect to the local URL with the existing browser tooling.
4. For Electron/Chromium, enable a remote debugging port when supported.
5. Select the correct page by stable app markers, not by tab order alone.
6. Prefer accessibility roles, labels, and stable `data-*` selectors over coordinates.

## Local web and CDP harness

Prefer the project’s existing browser harness. For a temporary standalone probe, use an existing Python Playwright installation (`python -m playwright --version`) and an owned Chromium browser (Chrome or Edge on Windows), or an owned Electron target with CDP enabled. This does not install Playwright or any browser.

For stand-alone Chromium, start the actual browser executable with `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=0`, and `--user-data-dir=<new-owned-profile>`, followed by the owned app URL. Record the launched PID. Get the assigned port from the first line of `DevToolsActivePort` in that profile; do not use an existing browser profile, session, or tab. Use headless mode only if its rendering is suitable for the check. For Electron, use the project’s documented debug launch and record its owned endpoint and process.

Save the example as `page.py` and run `python page.py <cdp-url> <exact-page-url> <root-css> <button-name> <new-empty-output-directory>`. The probe matches both the app URL and a stable root selector, clicks one named button using Playwright, and captures before/after PNGs and accessibility transcripts. Check those artifacts and any app-side effects against the expected result. The probe detaches; close only the browser/app and dev server you launched, await their exits, then remove the owned profile.

```python pstack-page
import sys
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

if len(sys.argv) != 6:
    raise SystemExit("Usage: python page.py <cdp-url> <exact-page-url> <root-css> <button-name> <new-empty-output-directory>")
endpoint, url, selector, button, output = sys.argv[1:]
cdp = urlsplit(endpoint)
if cdp.scheme != "http" or cdp.hostname != "127.0.0.1" or not cdp.port:
    raise SystemExit("Use the owned browser CDP endpoint at http://127.0.0.1:<port>")
out = Path(output)
if not out.is_dir() or any(out.iterdir()):
    raise SystemExit("The output directory must exist and be empty")

with sync_playwright() as tools:
    browser = tools.chromium.connect_over_cdp(endpoint, timeout=5000)
    pages = [page for context in browser.contexts for page in context.pages]
    matches = [page for page in pages if page.url == url and page.locator(selector).count() == 1]
    if len(matches) != 1:
        raise SystemExit(f"Expected one matching page for {url} and {selector}; found {len(matches)}. Open URLs: {[page.url for page in pages]}")
    page = matches[0]
    page.set_default_timeout(5000)
    page.set_default_navigation_timeout(5000)
    root = page.locator(selector)
    print("before:", root.aria_snapshot(), flush=True)
    page.screenshot(path=out / "before.png", full_page=True)
    root.get_by_role("button", name=button, exact=True).click()
    print("after:", root.aria_snapshot(), flush=True)
    page.screenshot(path=out / "after.png", full_page=True)
```

## Interaction Loop

1. Capture a page snapshot or screenshot before acting.
2. Choose a target from the latest page structure.
3. Perform exactly one structural action: click, type, keypress, drag, scroll, navigate, or resize.
4. Capture a fresh snapshot/screenshot.
5. Verify the expected state change.
6. Save artifacts for before/after comparisons when the user asked for proof.

## CDP Capabilities

Use raw CDP only when higher-level browser APIs are insufficient:

- Performance: CPU profiles, traces, paint flashing, FPS meter, layout shift inspection.
- Memory: heap snapshots and forced GC for leak investigations.
- Network: request blocking, throttling, cache disablement, request/response logs.
- Rendering: viewport changes, color scheme emulation, reduced motion, accessibility checks.
- Debugging: console streaming, exception capture, DOM snapshots.

## Page Selection

When multiple app windows/tabs share a debug port:

- Prefer a positive marker for the surface under test, such as an app root selector.
- Use a negative marker to avoid the wrong surface when necessary.
- If no page matches, list available page titles and URLs instead of guessing.

## Guardrails

- Do not rely on stale element references after navigation or structural changes.
- Avoid coordinate clicks unless a fresh screenshot was captured immediately before the click.
- Keep test data local and disposable.
- Do not store screenshots or heap snapshots from privacy-sensitive workspaces unless the user explicitly agrees.
- Do not hard-code selectors, ports, or script paths from another repository. Discover the current repo's local app markers.
- Clean up dev servers, debug sessions, and temp profiles when done.
