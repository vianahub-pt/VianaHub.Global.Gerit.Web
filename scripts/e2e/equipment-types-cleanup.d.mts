export interface EquipmentTypesCleanupRecord {
  id: number | null;
  name: string;
  userId: number;
  tenantId: number;
  executionId: string;
  operation: "create" | "bulk-upload";
  createAttempted: boolean;
  status: "pending" | "verified";
  deleteAttempted: boolean;
  createHttp?: number;
  reconciled?: boolean;
  noRecordConfirmed?: boolean;
  expectedExistingId?: number;
  deleteHttp?: number;
  followUpReadHttp?: number;
}
export function readEquipmentTypesCleanupManifest(path: string): Promise<{ status: "clear" | "pending" | "invalid"; manifest: { schemaVersion: 1; status: "pending" | "verified"; records: EquipmentTypesCleanupRecord[] } | null }>;
export function beginEquipmentTypesCreate(path: string, record: Omit<EquipmentTypesCleanupRecord, "id" | "createAttempted" | "status" | "deleteAttempted">): Promise<void>;
export function registerOwnedEquipmentType(path: string, record: Omit<EquipmentTypesCleanupRecord, "createAttempted" | "status" | "deleteAttempted" | "reconciled" | "noRecordConfirmed" | "expectedExistingId" | "deleteHttp" | "followUpReadHttp">): Promise<EquipmentTypesCleanupRecord>;
export function resolveEquipmentTypeRejectedCreate(path: string, input: { name: string; executionId: string; expectedExistingId: number }): Promise<void>;
export function reconcileEquipmentTypesCreate(path: string, input: { executionId: string; list: (name: string) => Promise<{ status: number; body: { items?: Array<{ id: number; name: string }> } | null }>; get: (id: number) => Promise<{ status: number; body: { id?: number; name?: string; tenantId?: number } | null }> }): Promise<EquipmentTypesCleanupRecord[]>;
export function cleanupOwnedEquipmentTypes(input: { path: string; executionId: string; session: { userId: number; tenantId: number; accessToken: string }; api: (method: "GET" | "DELETE", id: number, token: string) => Promise<{ status: number; body?: { id?: number; name?: string; tenantId?: number } | null }>; reconcile?: () => Promise<unknown> }): Promise<{ status: "verified" | "pending"; records: EquipmentTypesCleanupRecord[] }>;
export function markEquipmentTypeDeleteAttempted(path: string, id: number): Promise<void>;
export function confirmEquipmentTypeDelete(path: string, input: { id: number; executionId: string; deleteHttp: number; followUpReadHttp: number }): Promise<EquipmentTypesCleanupRecord>;
export function reconcileEquipmentTypeConflictAlias(path: string, input: { name: string; executionId: string; tenantId: number; existingId: number; observedHttp: number }): Promise<unknown>;
