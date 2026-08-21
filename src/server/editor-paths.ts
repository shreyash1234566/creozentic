import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

function configuredRoots() {
  const separator = process.platform === "win32" ? ";" : ":";
  const configured = (process.env.CREOZENTIC_ALLOWED_MEDIA_ROOTS ?? "")
    .split(separator)
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length) return configured.map((value) => resolve(value));
  return [resolve(process.env.CREOZENTIC_MEDIA_ROOT ?? join(tmpdir(), "creozentic-media"))];
}

function isWithin(candidate: string, root: string) {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export async function assertTrustedMediaPath(
  inputPath: string,
  label: string,
  options: { mustExist?: boolean } = {},
) {
  if (!inputPath || !isAbsolute(inputPath)) throw new Error(`${label} must be an absolute server path.`);
  if (process.env.NODE_ENV !== "production") return resolve(inputPath);
  const resolved = resolve(inputPath);
  const canonical = options.mustExist ? await realpath(resolved) : resolved;
  if (!configuredRoots().some((root) => isWithin(canonical, root))) {
    throw new Error(`${label} is outside the configured media storage roots.`);
  }
  return canonical;
}

export function assertTrustedOutputPath(outputPath: string, label = "outputPath") {
  if (!outputPath || !isAbsolute(outputPath)) throw new Error(`${label} must be an absolute server path.`);
  const resolved = resolve(outputPath);
  if (process.env.NODE_ENV === "production" && !configuredRoots().some((root) => isWithin(resolved, root))) {
    throw new Error(`${label} is outside the configured media storage roots.`);
  }
  return resolved;
}
