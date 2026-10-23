import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "../src/shared/infrastructure/persistence/postgresql/database-schema";

const PERMISSIONS = [
  ["admin.access", "Access the protected administration area."],
  ["users.read", "Read user accounts."],
  ["users.create", "Create user accounts."],
  ["users.update", "Update user accounts."],
  ["users.disable", "Disable user accounts."],
  ["roles.read", "Read roles and permission assignments."],
  ["roles.assign", "Assign roles to user accounts."],
] as const;

const SUPER_ADMIN_ROLE_ID = "00000000-0000-4000-8000-000000000001";

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    insert into roles (id, code, name, description, created_at, updated_at)
    values (${SUPER_ADMIN_ROLE_ID}::uuid, 'super_admin', 'Super administrator', 'Initial system administrator role.', now(), now())
    on conflict (code) do update set name = excluded.name, description = excluded.description, updated_at = now()
  `.execute(db);

  for (const [index, [code, description]] of PERMISSIONS.entries()) {
    const id = `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`;
    await sql`
      insert into permissions (id, code, description, created_at)
      values (${id}::uuid, ${code}, ${description}, now())
      on conflict (code) do update set description = excluded.description
    `.execute(db);
  }

  await sql`
    insert into role_permissions (role_id, permission_id)
    select roles.id, permissions.id
    from roles cross join permissions
    where roles.code = 'super_admin'
      and permissions.code in (${sql.join(PERMISSIONS.map(([code]) => sql`${code}`))})
    on conflict (role_id, permission_id) do nothing
  `.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  const administrator = await sql`
    select user_roles.user_id
    from user_roles
    inner join roles on roles.id = user_roles.role_id
    where roles.code = 'super_admin'
    limit 1
  `.execute(db);
  if (administrator.rows.length > 0) {
    throw new Error("RBAC seed rollback is blocked while a super administrator is assigned.");
  }

  await sql`delete from roles where code = 'super_admin'`.execute(db);
  await sql`
    delete from permissions
    where code in (${sql.join(PERMISSIONS.map(([code]) => sql`${code}`))})
      and not exists (
        select 1 from role_permissions where role_permissions.permission_id = permissions.id
      )
  `.execute(db);
}
