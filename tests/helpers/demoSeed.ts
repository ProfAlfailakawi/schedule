/** Wait for the showcase-only async seed after /api/auth/demo returns quickly. */
export async function waitForDemoSeed(base: string, cookie: string, timeoutMs = 180_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const response = await fetch(`${base}/api/demo/seed-status`, { headers: { cookie }, cache: "no-store" });
    if (!response.ok) throw new Error(`Demo seed status returned ${response.status}`);
    const result = await response.json() as { status?: string };
    if (result.status === "ready") return;
    if (result.status === "failed") throw new Error("Demo showcase seeding failed");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Demo showcase did not finish within ${timeoutMs} ms`);
}
