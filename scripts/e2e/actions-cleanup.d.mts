export interface ActionsCleanupRecord { id: number; name: string; userId: number; tenantId: number; executionId: string; createHttp: number; status?: "pending" | "verified"; deleteAttempted?: boolean; deleteHttp?: number; followUpReadHttp?: number; }
export interface ActionsCleanupManifest { schemaVersion: 1; status: "pending" | "verified"; records: ActionsCleanupRecord[]; }
export function readActionsCleanupManifest(path: string): Promise<{ status: "clear" | "pending" | "invalid"; manifest: ActionsCleanupManifest | null }>;
export function beginOwnedActionCreate(path: string, record: { name: string; userId: number; tenantId: number; executionId: string }): Promise<void>;
export function registerOwnedAction(path: string, record: ActionsCleanupRecord): Promise<ActionsCleanupRecord>;
export function markOwnedActionDeleteAttempted(path: string, id: number): Promise<void>;
export function cleanupOwnedActions(options: {
  path: string; ids: number[];
  refreshSession: () => Promise<{ accessToken: string; refreshToken: string; userId: number; tenantId: number }>;
  api: (method: "GET" | "DELETE", id: number, accessToken: string) => Promise<{ status: number; body?: unknown }>;
}): Promise<ActionsCleanupManifest>;
