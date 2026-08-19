import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xiaofu-smoke-"));
const repo = path.join(tempRoot, "repo");
const port = 39000 + Math.floor(Math.random() * 1000);
fs.cpSync(root, repo, {
  recursive: true,
  filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.endsWith(`${path.sep}.git`)
});
fs.rmSync(path.join(repo, "data", "admin.json"), { force: true });

const child = spawn(process.execPath, ["server.js"], {
  cwd: repo,
  env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: "smoke-pass" },
  stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });

const stop = () => { if (!child.killed) child.kill("SIGTERM"); };
process.on("exit", stop);

async function request(url, options) {
  return fetch(`http://127.0.0.1:${port}${url}`, options);
}
async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await request("/healthz");
      if (res.ok) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("服务未能启动：\n" + logs);
}
async function json(res) {
  return res.json();
}

try {
  await waitReady();
  const health = await request("/healthz");
  const healthBody = await json(health);
  assert.equal(healthBody.status, "ok");
  assert.equal(healthBody.db, "ok");

  const home = await request("/");
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.equal(home.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(home.headers.get("content-security-policy") || "", /default-src 'self'/);
  assert.match(await home.text(), /og:image/);

  const robots = await (await request("/robots.txt")).text();
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Sitemap: https:\/\//);

  const sitemap = await (await request("/sitemap.xml")).text();
  assert.match(sitemap, /<urlset/);
  const rssResponse = await request("/rss.xml");
  assert.match(rssResponse.headers.get("content-type") || "", /application\/rss\+xml/);
  assert.match(await rssResponse.text(), /<rss version="2.0">/);

  const postHtml = await (await request("/post.html?id=hello-world")).text();
  assert.match(postHtml, /canonical[^>]+post\.html\?id=hello-world/);

  const login = await request("/api/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "smoke-pass" })
  });
  const token = (await json(login)).token;
  assert.ok(token);
  const authHeaders = { authorization: `Bearer ${token}` };

  const posted = await request("/api/comments", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postId: "hello-world", name: "smoke", text: "pending" })
  });
  assert.equal((await json(posted)).pending, true);
  const adminComments = await json(await request("/api/comments", { headers: authHeaders }));
  const comment = adminComments.comments.find((item) => item.name === "smoke");
  assert.equal(comment.status, "pending");
  await request(`/api/comments?id=${encodeURIComponent(comment.id)}`, {
    method: "PUT", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ status: "approved" })
  });
  const visible = await json(await request("/api/comments?postId=hello-world"));
  assert.ok(visible.comments.some((item) => item.id === comment.id));
  await request(`/api/comments?id=${encodeURIComponent(comment.id)}`, { method: "DELETE", headers: authHeaders });

  const fakeUpload = await request("/api/upload", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ name: "fake.png", data: "bm90LWFuLWltYWdl" })
  });
  assert.equal(fakeUpload.status, 400);

  console.log("SMOKE_OK");
} finally {
  stop();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
