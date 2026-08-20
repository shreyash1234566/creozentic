import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";
import { writeObject, readObject } from "./storage";

const execFileAsync = promisify(execFile);
function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

export async function createBackup(context: RequestContext, kind: "METADATA" | "DATABASE") {
  requireRole(context, "ADMIN");
  const workspace = await db.workspace.findUnique({
    where: { id: context.workspaceId },
    select: { region: true, retentionDays: true },
  });
  if (!workspace) throw new ApiError(404, "WORKSPACE_NOT_FOUND", "The workspace was not found.");
  const run = await db.backupRun.create({
    data: {
      workspaceId: context.workspaceId,
      kind,
      region: workspace.region,
      status: "RUNNING",
      createdBy: context.userId,
    },
  });
  try {
    const counts = await Promise.all([
      db.asset.count({ where: { workspaceId: context.workspaceId } }),
      db.workflowRun.count({ where: { workspaceId: context.workspaceId } }),
      db.auditEvent.count({ where: { workspaceId: context.workspaceId } }),
      db.billingEvent.count({ where: { workspaceId: context.workspaceId } }),
    ]);
    const manifest: Record<string, unknown> = {
      schemaVersion: 1,
      backupId: run.id,
      workspaceId: context.workspaceId,
      region: workspace.region,
      createdAt: new Date().toISOString(),
      retentionDays: workspace.retentionDays,
      counts: {
        assets: counts[0],
        runs: counts[1],
        auditEvents: counts[2],
        billingEvents: counts[3],
      },
    };
    let objectKey: string | undefined;
    let artifactChecksum: string;
    if (kind === "DATABASE" && process.env.PG_DUMP_PATH && process.env.DATABASE_URL) {
      const output = `${process.cwd()}\\.data\\backup-${run.id}.sql`;
      await execFileAsync(process.env.PG_DUMP_PATH, [process.env.DATABASE_URL, "--file", output], {
        timeout: 300_000,
        windowsHide: true,
      });
      objectKey = `workspaces/${context.workspaceId}/backups/${run.id}.sql`;
      const { readFile, rm } = await import("node:fs/promises");
      const body = await readFile(output);
      await writeObject(objectKey, body, "application/sql");
      await rm(output, { force: true });
      artifactChecksum = createHash("sha256").update(body).digest("hex");
      manifest.databaseDumpSha256 = artifactChecksum;
    } else {
      objectKey = `workspaces/${context.workspaceId}/backups/${run.id}.json`;
      const body = Buffer.from(JSON.stringify(manifest, null, 2));
      await writeObject(objectKey, body, "application/json");
      artifactChecksum = createHash("sha256").update(body).digest("hex");
    }
    return db.backupRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        objectKey,
        checksum: artifactChecksum,
        manifest: json(manifest),
        completedAt: new Date(),
      },
    });
  } catch (error) {
    return db.backupRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: json({ message: error instanceof Error ? error.message : "Backup failed." }),
        completedAt: new Date(),
      },
    });
  }
}

export async function verifyBackup(context: RequestContext, backupId: string) {
  requireRole(context, "ADMIN");
  const backup = await db.backupRun.findFirst({
    where: { id: backupId, workspaceId: context.workspaceId, status: "COMPLETED" },
  });
  if (!backup?.objectKey)
    throw new ApiError(404, "BACKUP_NOT_FOUND", "A completed backup artifact was not found.");
  try {
    const object = await readObject(backup.objectKey);
    const expected = backup.checksum;
    const actual = createHash("sha256").update(object.body).digest("hex");
    const verified = Boolean(expected) && expected === actual;
    const updated = await db.backupRun.update({
      where: { id: backup.id },
      data: {
        status: verified ? "VERIFIED" : "CORRUPTED",
        error: verified ? undefined : json({ expected, actual }),
      },
    });
    if (!verified)
      throw new ApiError(
        422,
        "BACKUP_CHECKSUM_FAILED",
        "The backup artifact checksum does not match its manifest.",
        { backupId: backup.id },
      );
    return { backup: updated, verified: true, byteSize: object.body.byteLength };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    await db.backupRun.update({
      where: { id: backup.id },
      data: {
        status: "VERIFY_FAILED",
        error: json({
          message: error instanceof Error ? error.message : "Backup verification failed.",
        }),
      },
    });
    throw new ApiError(503, "BACKUP_VERIFY_FAILED", "The backup artifact could not be verified.", {
      backupId: backup.id,
    });
  }
}

export async function runRestoreDrill(context: RequestContext, backupId: string) {
  requireRole(context, "ADMIN");
  const verification = await verifyBackup(context, backupId);
  const backup = await db.backupRun.findFirst({
    where: { id: backupId, workspaceId: context.workspaceId },
  });
  if (!backup?.objectKey)
    throw new ApiError(404, "BACKUP_NOT_FOUND", "A verified backup artifact was not found.");
  const artifact = await readObject(backup.objectKey);
  let manifest: Record<string, unknown> | undefined;
  if (backup.kind === "METADATA") {
    try {
      manifest = JSON.parse(artifact.body.toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new ApiError(
        422,
        "RESTORE_DRILL_INVALID",
        "The metadata backup cannot be parsed for a restore drill.",
      );
    }
    if (manifest.workspaceId !== context.workspaceId)
      throw new ApiError(
        422,
        "RESTORE_DRILL_INVALID",
        "The backup does not belong to this workspace.",
      );
  }
  const evidence = await db.launchEvidence.create({
    data: {
      workspaceId: context.workspaceId,
      kind: "DISASTER_RECOVERY_RESTORE_DRILL",
      title: `Restore drill for backup ${backup.id}`,
      status: "VERIFIED",
      payload: json({
        backupId: backup.id,
        kind: backup.kind,
        checksumVerified: verification.verified,
        byteSize: verification.byteSize,
        dryRun: true,
        manifest: manifest ?? backup.manifest,
      }),
      createdBy: context.userId,
    },
  });
  return { backupId: backup.id, dryRun: true, verification, evidence };
}

export async function listBackups(context: RequestContext) {
  requireRole(context, "ADMIN");
  return db.backupRun.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function createLaunchEvidence(
  context: RequestContext,
  input: {
    kind: string;
    title: string;
    payload: Record<string, unknown>;
    observedBy?: string;
    status?: string;
  },
) {
  requireRole(context, "EDITOR");
  return db.launchEvidence.create({
    data: {
      workspaceId: context.workspaceId,
      kind: input.kind.trim(),
      title: input.title.trim(),
      payload: json(input.payload),
      observedBy: input.observedBy?.trim(),
      status: input.status ?? "PENDING",
      createdBy: context.userId,
    },
  });
}
export async function listLaunchEvidence(context: RequestContext) {
  requireRole(context, "VIEWER");
  return db.launchEvidence.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
