import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: 'utf8', ...options });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}
run('npm', ['run', 'check']);
const output = run('npx', ['wrangler', 'deploy'], { cwd: new URL('../backend/', import.meta.url) });
const workerUrl = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/i)?.[0];
if (!workerUrl) throw new Error('Cloudflare deployed but did not return a workers.dev URL. Set VITE_API_URL to your Worker URL, then run npx vercel --prod.');
const apiUrl = `${workerUrl}/api`;
writeFileSync(new URL('../.env.production.local', import.meta.url), `VITE_API_URL=${apiUrl}\n`);
// A freshly deployed workers.dev route 404s until it propagates, so poll rather than fail on the first miss.
let check = null;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  check = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (check?.ok) break;
  if (attempt === 10) throw new Error(`Worker health check failed after ${attempt} attempts: ${check ? check.status : "no response"}`);
  await new Promise((resolve) => setTimeout(resolve, 6000));
}
console.log(`Cloudflare API ready at ${apiUrl}`);
const vercel = run('npx', ['vercel', 'deploy', '--yes', '--prod', '--build-env', `VITE_API_URL=${apiUrl}`]);

// A frontend built without VITE_API_URL silently serves on-device static mode and still deploys "successfully",
// so confirm the shipped bundle actually references the Worker rather than trusting the build env.
const siteUrl = vercel.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi)?.pop();
if (!siteUrl) throw new Error('Vercel deployed but did not report a URL to verify.');
const html = await (await fetch(siteUrl, { signal: AbortSignal.timeout(30000) })).text();
const asset = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
const bundle = asset ? await (await fetch(`${siteUrl}${asset}`, { signal: AbortSignal.timeout(30000) })).text() : '';
if (!bundle.includes(apiUrl)) throw new Error(`${siteUrl} does not reference ${apiUrl}, so it would quietly run in on-device static mode. Set the variable on the project: npx vercel env add VITE_API_URL production`);
console.log(`Frontend at ${siteUrl} is wired to ${apiUrl}`);
