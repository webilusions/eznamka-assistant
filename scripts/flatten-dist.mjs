import { cp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const distDir = "dist";
const clientDir = join(distDir, "client");
const serverDir = join(distDir, "server");

try {
  const entries = await readdir(clientDir, { withFileTypes: true });

  for (const entry of entries) {
    await cp(join(clientDir, entry.name), join(distDir, entry.name), {
      recursive: true,
      force: true,
    });
  }

  await rm(clientDir, { recursive: true, force: true });
  await rm(serverDir, { recursive: true, force: true });

  console.log("Static SPA output is ready in dist/.");
} catch (error) {
  console.error("Could not prepare static SPA output in dist/.");
  throw error;
}