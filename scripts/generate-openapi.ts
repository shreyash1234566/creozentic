import { readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.name === "route.ts") files.push(path);
  }
  return files;
}

const routes = await walk("app/api/v1");
const paths: Record<string, unknown> = {};
for (const route of routes) {
  const rel = relative("app/api/v1", route)
    .replace(/\/route\.ts$/, "")
    .replace(/\[([^\]]+)\]/g, "{$1}");
  const path = `/api/v1/${rel}`.replace(/\/+/g, "/");
  paths[path] = {
    get: {
      responses: {
        "200": { description: "Route available; request schema is defined by its handler." },
      },
    },
  };
}
const document = {
  openapi: "3.1.0",
  info: { title: "Creozentic API", version: "1.0.0" },
  paths,
  xRouteCount: Object.keys(paths).length,
  xGeneratedAt: new Date().toISOString(),
};
await writeFile("docs/openapi.generated.json", JSON.stringify(document, null, 2) + "\n");
console.log(`Generated ${Object.keys(paths).length} API paths.`);
