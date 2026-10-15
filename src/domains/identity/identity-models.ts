"use client";

/* ---------- Identity / Access Types ---------- */

export interface Tenant {
  id: string;
  name: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  userName: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phoneNumber: string | null;
  isActive: boolean;
  isEmailConfirmed: boolean;
  isPhoneConfirmed: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  displayName: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface Permission {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  category: string;
  isActive: boolean;
  createdAt: string;
}

export interface UserRole {
  userId: string;
  roleId: string;
  tenantId: string;
  assignedAt: string;
  assignedBy: string | null;
}

export interface RolePermission {
  roleId: string;
  permissionId: string;
  tenantId: string;
  assignedAt: string;
}

export interface UserWithRoles extends User {
  roles: Role[];
  permissions: Permission[];
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export interface TenantWithUsers extends Tenant {
  users: User[];
  roles: Role[];
}

/* ---------- DTOs for Create/Update ---------- */

export interface CreateTenantDto {
  name: string;
  displayName: string;
}

export interface UpdateTenantDto {
  displayName?: string;
  isActive?: boolean;
}

export interface CreateUserDto {
  tenantId: string;
  email: string;
  userName: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  password: string;
  roleIds?: string[];
}

export interface UpdateUserDto {
  email?: string;
  userName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string | null;
  isActive?: boolean;
  roleIds?: string[];
}

export interface CreateRoleDto {
  tenantId: string;
  name: string;
  displayName: string;
  description?: string;
  permissionIds?: string[];
}

export interface UpdateRoleDto {
  displayName?: string;
  description?: string | null;
  isActive?: boolean;
  permissionIds?: string[];
}

export interface AssignUserRolesDto {
  userId: string;
  roleIds: string[];
}

export interface AssignRolePermissionsDto {
  roleId: string;
  permissionIds: string[];
}

/* ---------- Query / Filter Types ---------- */

export interface UserQueryParams {
  tenantId?: string;
  search?: string;
  isActive?: boolean;
  roleId?: string;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: UserSortColumn;
  sortDirection?: "asc" | "desc";
}

export interface RoleQueryParams {
  tenantId?: string;
  search?: string;
  isActive?: boolean;
  isSystem?: boolean;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: RoleSortColumn;
  sortDirection?: "asc" | "desc";
}

export interface TenantQueryParams {
  search?: string;
  isActive?: boolean;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: TenantSortColumn;
  sortDirection?: "asc" | "desc";
}

export interface PermissionQueryParams {
  search?: string;
  category?: string;
  isActive?: boolean;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: PermissionSortColumn;
  sortDirection?: "asc" | "desc";
}

export type UserSortColumn = "email" | "userName" | "firstName" | "lastName" | "createdAt" | "lastLoginAt" | "isActive";
export type RoleSortColumn = "name" | "displayName" | "createdAt" | "isActive" | "isSystem";
export type TenantSortColumn = "name" | "displayName" | "createdAt" | "isActive";
export type PermissionSortColumn = "name" | "displayName" | "category" | "isActive";

export type UserStatusFilter = "active" | "inactive" | "all";
export type RoleStatusFilter = "active" | "inactive" | "all";
export type TenantStatusFilter = "active" | "inactive" | "all";

/* ---------- Paginated Response ---------- */

export interface PagedResult<T> {
  items: T[];
  totalItems: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

/* ---------- Auth / Session Types ---------- */

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  user: UserWithRoles;
  tokens: AuthTokens;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UserSession {
  id: string;
  userId: string;
  tenantId: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: string | null;
  isActive: boolean;
  startedAt: string;
  lastActivityAt: string;
  endedAt: string | null;
}