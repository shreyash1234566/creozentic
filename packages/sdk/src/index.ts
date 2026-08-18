import type {
  ApiEnvelope,
  EditorPlanContract,
  MediaJobContract,
  TenantScope,
} from "@creozentic/contracts";

export class CreozenticClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  private async get<T>(path: string, scope: TenantScope): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      headers: {
        authorization: this.token ? `Bearer ${this.token}` : "",
        "x-workspace-id": scope.workspaceId,
      },
    });
    if (!response.ok) throw new Error(`Creozentic API ${response.status}`);
    const payload = (await response.json()) as ApiEnvelope<T>;
    return payload.data;
  }

  health(scope: TenantScope) {
    return this.get<{ status: string }>("/api/v1/health/ready", scope);
  }
  editorProject(projectId: string, scope: TenantScope) {
    return this.get<EditorPlanContract>(`/api/v1/editor/${projectId}`, scope);
  }
  mediaJob(jobId: string, scope: TenantScope) {
    return this.get<MediaJobContract>(`/api/v1/media-jobs/${jobId}`, scope);
  }
}
