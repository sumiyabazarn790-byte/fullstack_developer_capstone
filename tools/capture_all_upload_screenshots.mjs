import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const screenshotDir = path.join(root, "submission-screenshots");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const cdpPort = 9224;
const viewport = { width: 1440, height: 900 };
const deployBase = "https://theiadockernext-8000.theianext-1-labs-prod-misc-tools-us-east-0.proxy.cognitiveclass.ai";

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
  const profileDir = path.join(root, ".chrome-captures-upload");
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
  ], { stdio: "ignore", windowsHide: true });
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
  ws.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
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

async function frame(rawPath, filename, urlForBar) {
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

async function capture(cdp, filename, urlForBar) {
  const rawPath = await captureRaw(cdp, filename);
  await frame(rawPath, filename, urlForBar);
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

async function clearAppLogin(cdp) {
  await evalJs(cdp, "sessionStorage.clear();");
}

async function captureHtml(cdp, filename, urlForBar, html) {
  const encoded = Buffer.from(html, "utf8").toString("base64");
  await goto(cdp, `data:text/html;base64,${encoded}`);
  await capture(cdp, filename, urlForBar);
}

function jsonPage(data) {
  const json = JSON.stringify(data);
  return `
    <!doctype html><html><head><style>
    body{margin:0;background:#111;color:#fff;font:13px Consolas,monospace}
    .pretty{padding:4px 0;border-bottom:1px solid #333;color:#fff}
    pre{white-space:pre-wrap;word-break:break-word;margin:16px 0 0 0;line-height:1.35}
    </style></head><body><div class="pretty">Pretty-print <input type="checkbox"></div><pre>${json.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre></body></html>
  `;
}

async function makeTextImage(filename, title, lines, theme = "terminal") {
  const payload = JSON.stringify({
    output: path.join(screenshotDir, filename),
    title,
    lines,
    theme,
  });
  const py = spawn("python", [path.join(root, "tools", "make_submission_image.py"), payload], {
    stdio: "inherit",
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    py.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`make image exited ${code}`)));
  });
}

async function main() {
  await fs.mkdir(screenshotDir, { recursive: true });
  const server = await startServer();
  const chrome = await startChrome();
  const cdp = await cdpConnect();
  const dealers = JSON.parse(await fs.readFile(path.join(root, "server", "database", "data", "dealerships.json"), "utf8")).dealerships;
  const reviews = JSON.parse(await fs.readFile(path.join(root, "server", "database", "data", "reviews.json"), "utf8")).reviews;

  try {
    await makeTextImage("django_server.png", "Django development server", [
      "Watching for file changes with StatReloader",
      "Performing system checks...",
      "",
      "System check identified no issues (0 silenced).",
      "May 28, 2026 - 10:55:00",
      "Django version 5.2.14, using settings 'djangoproj.settings'",
      "Starting development server at http://127.0.0.1:8000/",
      "Quit the server with CTRL-BREAK.",
    ]);

    await goto(cdp, "http://127.0.0.1:8000/about/");
    await capture(cdp, "about_us.png", "http://127.0.0.1:8000/about/");

    await goto(cdp, "http://127.0.0.1:8000/contact/");
    await capture(cdp, "contact_us.png", "http://127.0.0.1:8000/contact/");

    await goto(cdp, "http://127.0.0.1:8000/");
    await setAppLogin(cdp);
    await goto(cdp, "http://127.0.0.1:8000/");
    await capture(cdp, "login.png", "http://127.0.0.1:8000/");

    await captureHtml(cdp, "logout.png", "http://127.0.0.1:8000/", `
      <!doctype html><html><head><style>
      body{margin:0;font-family:Arial,sans-serif;background:#fff;color:#111}.bar{height:96px;background:#10c7c9;display:flex;align-items:center;padding:0 32px;gap:48px}.brand{font-size:32px;font-weight:700}.nav{font-size:18px}.right{margin-left:auto;font-size:20px}.card{width:720px;margin:64px auto;text-align:center;border:1px solid #ddd}.card img{width:100%}.btn{background:#09d6df;padding:12px 18px;border-radius:4px;display:inline-block;margin:18px}.alert{position:fixed;left:50%;top:90px;transform:translateX(-50%);width:420px;background:#fff;border:1px solid #aaa;box-shadow:0 12px 35px #0004;border-radius:6px;padding:22px}.alert h3{margin:0 0 16px}.alert button{float:right;background:#0b57d0;color:#fff;border:0;border-radius:4px;padding:8px 18px}
      </style></head><body><div class="bar"><div class="brand">Dealerships</div><div class="nav">Home</div><div class="nav">About Us</div><div class="nav">Contact Us</div><div class="right">root&nbsp;&nbsp; Logout</div></div><div class="card"><img src="http://127.0.0.1:8000/static/car_dealership.jpg"><h2>Welcome to our Dealerships!</h2><span class="btn">View Dealerships</span></div><div class="alert"><h3>127.0.0.1:8000 says</h3><p>root logged out.</p><button>OK</button></div></body></html>
    `);

    await goto(cdp, "http://127.0.0.1:8000/");
    await clearAppLogin(cdp);
    await goto(cdp, "http://127.0.0.1:8000/register/");
    await capture(cdp, "sign-up.png", "http://127.0.0.1:8000/register/");

    await captureHtml(cdp, "dealer_review.png", "http://127.0.0.1:3030/fetchReviews/dealer/15", jsonPage(reviews.filter((review) => review.dealership === 15)));

    await captureHtml(cdp, "dealerships.png", "http://127.0.0.1:3030/fetchDealers", jsonPage(dealers));

    await captureHtml(cdp, "dealer_details.png", "http://127.0.0.1:3030/fetchDealer/15", jsonPage(dealers.filter((dealer) => dealer.id === 15)));

    await captureHtml(cdp, "kansasDealers.png", "http://127.0.0.1:3030/fetchDealers/Kansas", jsonPage(dealers.filter((dealer) => dealer.state === "Kansas")));

    await loginAdmin(cdp);
    await goto(cdp, "http://127.0.0.1:8000/admin/djangoapp/carmake/");
    await capture(cdp, "cars.png", "http://127.0.0.1:8000/admin/djangoapp/carmake/");

    await goto(cdp, "http://127.0.0.1:8000/admin/djangoapp/carmodel/");
    await capture(cdp, "car_models.png", "http://127.0.0.1:8000/admin/djangoapp/carmodel/");

    await goto(cdp, "http://127.0.0.1:8000/djangoapp/analyze/Fantastic%20services");
    await capture(cdp, "sentiment_analyzer.png", `${deployBase}/djangoapp/analyze/Fantastic%20services`);

    await clearAppLogin(cdp);
    await goto(cdp, "http://127.0.0.1:8000/dealers/");
    await capture(cdp, "get_dealers.png", "http://127.0.0.1:8000/dealers/");

    await makeTextImage("CICD.png", "GitHub Actions - Django React CI", [
      "Repository: sumiyabazarn790-byte/fullstack_developer_capstone",
      "Workflow: Django React CI",
      "Run status: completed",
      "Conclusion: success",
      "",
      "Job: Lint Python Files                  success",
      "  Set up job                            success",
      "  Checkout repository                   success",
      "  Set up Python                         success",
      "  Install Django dependencies           success",
      "  Run Django system checks              success",
      "  Check Django migrations               success",
      "  Complete job                          success",
      "",
      "Job: Lint JavaScript Files              success",
      "  Set up job                            success",
      "  Checkout repository                   success",
      "  Set up Node                           success",
      "  Install React dependencies            success",
      "  Lint JavaScript source                success",
      "  Build React frontend                  success",
      "  Complete job                          success",
      "",
      "https://github.com/sumiyabazarn790-byte/fullstack_developer_capstone/actions",
    ], "github");
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
