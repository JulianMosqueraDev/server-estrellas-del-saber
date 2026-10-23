import type { ColumnType, Generated } from "kysely";

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface UsersTable {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  status: "active" | "disabled";
  created_at: Timestamp;
  updated_at: Timestamp;
  last_login_at: Timestamp | null;
  password_changed_at: Timestamp;
}

export interface RolesTable {
  id: string;
  code: string;
  name: string;
  description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PermissionsTable {
  id: string;
  code: string;
  description: string;
  created_at: Timestamp;
}

export interface UserRolesTable {
  user_id: string;
  role_id: string;
  created_at: Generated<Timestamp>;
}

export interface RolePermissionsTable {
  role_id: string;
  permission_id: string;
  created_at: Generated<Timestamp>;
}

export interface AuthSessionsTable {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  created_at: Timestamp;
  expires_at: Timestamp;
  last_used_at: Timestamp;
  revoked_at: Timestamp | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface AuthRefreshTokenHistoryTable {
  id: string;
  session_id: string;
  token_hash: string;
  replacement_hash: string;
  used_at: Timestamp;
}

export interface SecurityAuditLogsTable {
  id: string;
  user_id: string | null;
  event_type: string;
  occurred_at: Timestamp;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface DatabaseSchema {
  users: UsersTable;
  roles: RolesTable;
  permissions: PermissionsTable;
  user_roles: UserRolesTable;
  role_permissions: RolePermissionsTable;
  auth_sessions: AuthSessionsTable;
  auth_refresh_token_history: AuthRefreshTokenHistoryTable;
  security_audit_logs: SecurityAuditLogsTable;
}
