import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const outDir = new URL("submission-screenshots/", root);
await fs.mkdir(outDir, { recursive: true });

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = fileURLToPath(new URL(".chrome-profile/", root));
const port = 9222;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const django = spawn("python", ["manage.py", "runserver", "127.0.0.1:8000", "--noreload"], {
  cwd: new URL("./", import.meta.url),
  windowsHide: true,
});

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--disable-extensions",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--window-size=1365,900",
], { windowsHide: true });

let ws;
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

async function waitForChrome() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/new`, { method: "PUT" });
      return await res.json();
    } catch {
      await delay(250);
    }
  }
  throw new Error("Chrome did not start");
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8000/");
      if (res.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("Django did not start");
}

function waitForEvent(method) {
  return new Promise((resolve) => {
    const handler = (event) => {
      if (event.method === method) {
        ws.removeEventListener("message", handler);
        resolve(event);
      }
    };
    ws.addEventListener("message", handler);
  });
}

async function navigate(url) {
  const loaded = waitForEvent("Page.loadEventFired");
  await send("Page.navigate", { url });
  await loaded;
  await delay(800);
}

async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await fs.writeFile(new URL(`submission-screenshots/${name}.png`, root), Buffer.from(result.data, "base64"));
}

async function evaluate(expression) {
  return send("Runtime.evaluate", { expression, awaitPromise: true });
}

try {
  await waitForServer();
  const tab = await waitForChrome();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  ws.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      data.error ? reject(new Error(data.error.message)) : resolve(data.result);
    }
  });
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  await send("Page.enable");
  await send("Runtime.enable");

  await navigate("http://127.0.0.1:8000/admin/login/?next=/admin/");
  await evaluate(`
    document.querySelector('input[name="username"]').value = 'root';
    document.querySelector('input[name="password"]').value = 'root';
    document.querySelector('form').submit();
  `);
  await delay(1500);
  await screenshot("admin_login");

  await navigate("http://127.0.0.1:8000/admin/logout/");
  await screenshot("admin_logout");

  await navigate("http://127.0.0.1:8000/dealers");
  await screenshot("get_dealers");

  await evaluate(`sessionStorage.setItem('username','root'); sessionStorage.setItem('firstname','Root'); sessionStorage.setItem('lastname','User');`);
  await navigate("http://127.0.0.1:8000/dealers");
  await screenshot("dealers_loggedin");

  await evaluate(`
    const select = document.querySelector('#state');
    select.value = 'Kansas';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  `);
  await delay(1500);
  await screenshot("dealersbystate");

  await navigate("http://127.0.0.1:8000/dealer/15");
  await screenshot("dealer_id_reviews");

  await navigate("http://127.0.0.1:8000/postreview/15");
  await delay(1200);
  await evaluate(`
    document.querySelector('#review').value = 'Fantastic services from the team.';
    document.querySelector('input[type="date"]').value = '2026-05-28';
    const cars = document.querySelector('#cars');
    if (cars.options.length > 1) cars.selectedIndex = 1;
    document.querySelector('input[type="int"]').value = '2023';
  `);
  await screenshot("dealership_review_submission");

  await navigate("http://127.0.0.1:8000/dealer/15");
  await screenshot("added_review");

  console.log("Screenshots created.");
} finally {
  if (ws) ws.close();
  chrome.kill();
  django.kill();
}
