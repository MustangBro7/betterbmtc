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
const check = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(30000) });
if (!check.ok) throw new Error(`Worker health check failed: ${check.status}`);
console.log(`Cloudflare API ready at ${apiUrl}`);
run('npx', ['vercel', 'deploy', '--yes', '--prod', '--build-env', `VITE_API_URL=${apiUrl}`]);
