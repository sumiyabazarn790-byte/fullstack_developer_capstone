import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const screenshotDir = path.join(root, "submission-screenshots");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const cdpPort = 9223;
const viewport = { width: 1440, height: 900 };

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Keep waiting.
    }
    await wait(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startServer() {
  try {
    const res = await fetch("http://127.0.0.1:8000/");
    if (res.ok) return null;
  } catch {
    // Start below.
  }
  const server = spawn("python", ["manage.py", "runserver", "127.0.0.1:8000"], {
    cwd: process.cwd(),
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForUrl("http://127.0.0.1:8000/");
  return server;
}

async function startChrome() {
  const profileDir = path.join(root, ".chrome-captures-submission");
  await fs.rm(profileDir, { recursive: true, force: true });
  await fs.mkdir(profileDir, { recursive: true });
  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    "about:blank",
  ], {
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForUrl(`http://127.0.0.1:${cdpPort}/json/version`);
  return chrome;
}

async function cdpConnect() {
  let pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  let page = pages.find((target) => target.type === "page");
  if (!page) {
    page = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    } else if (data.method) {
      events.push(data.method);
    }
  });

  async function send(method, params = {}) {
    const commandId = ++id;
    ws.send(JSON.stringify({ id: commandId, method, params }));
    const result = await new Promise((resolve) => pending.set(commandId, resolve));
    if (result.error) throw new Error(`${method}: ${JSON.stringify(result.error)}`);
    return result.result;
  }

  async function waitForLoad() {
    events.length = 0;
    await wait(700);
    const started = Date.now();
    while (Date.now() - started < 15000) {
      const state = await send("Runtime.evaluate", {
        expression: "document.readyState",
        returnByValue: true,
      });
      if (state.result.value === "complete") {
        await wait(900);
        return;
      }
      await wait(250);
    }
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  return { send, waitForLoad, close: () => ws.close() };
}

async function goto(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await cdp.waitForLoad();
}

async function evalJs(cdp, expression) {
  return cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
}

async function captureRaw(cdp, filename) {
  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  const rawPath = path.join(screenshotDir, `raw_${filename}`);
  await fs.writeFile(rawPath, Buffer.from(shot.data, "base64"));
  return rawPath;
}

async function capture(cdp, filename, urlForBar) {
  const rawPath = await captureRaw(cdp, filename);
  const framedPath = path.join(screenshotDir, filename);
  const py = spawn("python", [
    path.join(root, "tools", "frame_screenshot.py"),
    rawPath,
    framedPath,
    urlForBar,
  ], { stdio: "inherit", windowsHide: true });
  await new Promise((resolve, reject) => {
    py.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`frame script exited ${code}`)));
  });
  await fs.rm(rawPath, { force: true });
}

async function loginAdmin(cdp) {
  await goto(cdp, "http://127.0.0.1:8000/admin/login/?next=/admin/");
  await evalJs(cdp, `
    document.querySelector('#id_username').value = 'root';
    document.querySelector('#id_password').value = 'root';
    document.querySelector('form').submit();
  `);
  await cdp.waitForLoad();
}

async function setAppLogin(cdp) {
  await evalJs(cdp, `
    sessionStorage.setItem('username', 'root');
    sessionStorage.setItem('firstname', 'Root');
    sessionStorage.setItem('lastname', 'User');
  `);
}

async function main() {
  await fs.mkdir(screenshotDir, { recursive: true });
  await fs.rm(path.join(root, "server", "database", "data", "posted_reviews.json"), { force: true });
  const server = await startServer();
  const chrome = await startChrome();
  const cdp = await cdpConnect();
  const deployBase = "https://theiadockernext-8000.theianext-1-labs-prod-misc-tools-us-east-0.proxy.cognitiveclass.ai";

  try {
    await loginAdmin(cdp);
    await capture(cdp, "admin_login.png", "http://127.0.0.1:8000/admin/");

    await evalJs(cdp, `
      const button = document.querySelector('#logout-form button[type="submit"], form[action="/admin/logout/"] button[type="submit"]');
      if (button) button.click();
    `);
    await cdp.waitForLoad();
    await capture(cdp, "admin_logout.png", "http://127.0.0.1:8000/admin/logout/");

    await goto(cdp, "http://127.0.0.1:8000/");
    await setAppLogin(cdp);
    await goto(cdp, "http://127.0.0.1:8000/dealer/15/");
    await setAppLogin(cdp);
    await goto(cdp, "http://127.0.0.1:8000/dealer/15/");
    await capture(cdp, "dealer_id_reviews.png", "http://127.0.0.1:8000/dealer/15/");

    await evalJs(cdp, `
      fetch('/djangoapp/add_review', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          name: 'Root User',
          dealership: 15,
          review: 'Posted capstone review: the service was fantastic and helpful.',
          purchase: true,
          purchase_date: '2026-05-28',
          car_make: 'Toyota',
          car_model: 'Camry',
          car_year: 2023
        })
      })
    `);
    await wait(1000);
    await goto(cdp, "http://127.0.0.1:8000/dealer/15/");
    await setAppLogin(cdp);
    await goto(cdp, "http://127.0.0.1:8000/dealer/15/");
    await capture(cdp, "added_review.png", "http://127.0.0.1:8000/dealer/15/");

    await goto(cdp, "http://127.0.0.1:8000/");
    await setAppLogin(cdp);
    await goto(cdp, "http://127.0.0.1:8000/");
    await capture(cdp, "deployed_loggedin.png", `${deployBase}/`);

    await goto(cdp, "http://127.0.0.1:8000/dealer/15/");
    await setAppLogin(cdp);
    await goto(cdp, "http://127.0.0.1:8000/dealer/15/");
    await capture(cdp, "deployed_add_review.png", `${deployBase}/dealer/15/`);
  } finally {
    cdp.close();
    chrome.kill();
    if (server) server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
