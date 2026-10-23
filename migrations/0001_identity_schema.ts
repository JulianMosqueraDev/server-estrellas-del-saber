import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create table users (
    id uuid primary key,
    email varchar(254) not null,
    password_hash text not null,
    full_name varchar(160) not null,
    status varchar(16) not null default 'active' check (status in ('active', 'disabled')),
    created_at timestamptz not null,
    updated_at timestamptz not null,
    last_login_at timestamptz null,
    password_changed_at timestamptz not null,
    constraint users_email_normalized check (email = lower(btrim(email))),
    constraint users_email_unique unique (email)
  )`.execute(db);

  await sql`create table roles (
    id uuid primary key,
    code varchar(80) not null unique,
    name varchar(120) not null,
    description varchar(500) null,
    created_at timestamptz not null,
    updated_at timestamptz not null
  )`.execute(db);

  await sql`create table permissions (
    id uuid primary key,
    code varchar(100) not null unique,
    description varchar(500) not null,
    created_at timestamptz not null
  )`.execute(db);

  await sql`create table user_roles (
    user_id uuid not null references users(id) on delete cascade,
    role_id uuid not null references roles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, role_id)
  )`.execute(db);
  await sql`create index user_roles_role_id_idx on user_roles(role_id)`.execute(db);

  await sql`create table role_permissions (
    role_id uuid not null references roles(id) on delete cascade,
    permission_id uuid not null references permissions(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (role_id, permission_id)
  )`.execute(db);
  await sql`create index role_permissions_permission_id_idx on role_permissions(permission_id)`.execute(
    db,
  );

  await sql`create table auth_sessions (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    refresh_token_hash char(64) not null unique,
    created_at timestamptz not null,
    expires_at timestamptz not null,
    last_used_at timestamptz not null,
    revoked_at timestamptz null,
    ip_address inet null,
    user_agent varchar(512) null,
    constraint auth_sessions_expiry_after_creation check (expires_at > created_at)
  )`.execute(db);
  await sql`create index auth_sessions_user_id_idx on auth_sessions(user_id)`.execute(db);
  await sql`create index auth_sessions_expiry_idx on auth_sessions(expires_at)`.execute(db);

  await sql`create table auth_refresh_token_history (
    id uuid primary key,
    session_id uuid not null references auth_sessions(id) on delete cascade,
    token_hash char(64) not null unique,
    replacement_hash char(64) not null,
    used_at timestamptz not null
  )`.execute(db);
  await sql`create index auth_refresh_token_history_session_id_idx on auth_refresh_token_history(session_id)`.execute(
    db,
  );

  await sql`create table security_audit_logs (
    id uuid primary key,
    user_id uuid null references users(id) on delete set null,
    event_type varchar(100) not null,
    occurred_at timestamptz not null,
    ip_address inet null,
    user_agent varchar(512) null,
    metadata jsonb not null default '{}'::jsonb
  )`.execute(db);
  await sql`create index security_audit_logs_occurred_at_idx on security_audit_logs(occurred_at)`.execute(
    db,
  );
  await sql`create index security_audit_logs_user_id_idx on security_audit_logs(user_id)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const state = await sql<{ has_identity_data: boolean }>`
    select
      exists (select 1 from users)
      or exists (select 1 from auth_sessions)
      or exists (select 1 from security_audit_logs) as has_identity_data
  `.execute(db);
  if (state.rows[0]?.has_identity_data) {
    throw new Error("Identity schema rollback is blocked while identity data exists.");
  }

  await sql`drop table security_audit_logs`.execute(db);
  await sql`drop table auth_refresh_token_history`.execute(db);
  await sql`drop table auth_sessions`.execute(db);
  await sql`drop table role_permissions`.execute(db);
  await sql`drop table user_roles`.execute(db);
  await sql`drop table permissions`.execute(db);
  await sql`drop table roles`.execute(db);
  await sql`drop table users`.execute(db);
}
