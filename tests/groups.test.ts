import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const c = "33333333-3333-4333-8333-333333333333",
  admin = "44444444-4444-4444-8444-444444444444";
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    ('${a}','a@example.com',now(),'{"role":"admin","full_name":"Creator"}'),
    ('${b}','b@example.com',now(),'{}'),('${c}','c@example.com',null,'{}'),('${admin}','admin@example.com',now(),'{}');`);
  await db.exec(
    await readFile("database/migrations/004_roles_groups.sql", "utf8"),
  );
  await db.query(
    "update cashflow_user_roles set role='admin' where user_id=$1",
    [admin],
  );
  await db.exec(
    await readFile("database/migrations/005_group_finance.sql", "utf8"),
  );
});
after(() => db.close());
async function one(sql: string, params: unknown[] = []) {
  return (await db.query<any>(sql, params)).rows[0];
}
async function act(
  actor: string,
  action: string,
  input: Record<string, unknown>,
) {
  return (
    await one("select cashflow_group_mutate($1,$2,$3::jsonb) id", [
      actor,
      action,
      JSON.stringify(input),
    ])
  ).id as string;
}
async function create() {
  const id = randomUUID();
  await act(a, "create", {
    groupId: id,
    name: "Team",
    description: "Private team",
  });
  return id;
}
async function join(id: string, userId = b, email = "b@example.com") {
  await act(a, "invite", { groupId: id, email });
  const invite = await one(
    "select id from cashflow_group_invitations where group_id=$1 and email=$2",
    [id, email],
  );
  await act(userId, "accept", { invitationId: invite.id });
  return invite.id as string;
}
test("default roles ignore user metadata; signup trigger never bootstraps an admin", async () => {
  assert.equal(
    (await one("select role from cashflow_user_roles where user_id=$1", [a]))
      .role,
    "user",
  );
  const fresh = randomUUID();
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data)values($1,'new@example.com','{\"role\":\"admin\"}')",
    [fresh],
  );
  assert.equal(
    (
      await one("select role from cashflow_user_roles where user_id=$1", [
        fresh,
      ])
    ).role,
    "user",
  );
});
test("creator becomes leader atomically and retrying creation does not reset ownership or content", async () => {
  const id = await create();
  assert.equal(
    (
      await one(
        "select role from cashflow_group_members where group_id=$1 and user_id=$2",
        [id, a],
      )
    ).role,
    "leader",
  );
  await act(a, "create", { groupId: id, name: "Retry" });
  assert.equal(
    (await one("select name from cashflow_groups where id=$1", [id])).name,
    "Team",
  );
  await assert.rejects(
    act(b, "create", { groupId: id, name: "Hijack" }),
    /duplicate_group/,
  );
  await assert.rejects(
    db.query(
      "insert into cashflow_groups(id,name,created_by)values($1,$2,$3)",
      [randomUUID(), "Leaderless", a],
    ),
    /last_leader/,
  );
});
test("outsiders and members cannot manage groups, enumerate invitations, or grant system roles", async () => {
  const id = await create();
  await join(id);
  await assert.rejects(
    db.query("select cashflow_group_detail($1,$2)", [c, id]),
    /group_not_found/,
  );
  for (const actor of [b, c])
    for (const [action, input] of [
      ["rename", { name: "Stolen" }],
      ["invite", { email: "x@example.com" }],
      ["member-role", { userId: actor, role: "leader" }],
      ["remove-member", { userId: a }],
      ["delete", {}],
      ["transfer", { userId: a }],
    ] as const)
      await assert.rejects(
        act(actor, action, { groupId: id, ...input }),
        /forbidden/,
      );
  const detail = (
    await one("select cashflow_group_detail($1,$2) data", [b, id])
  ).data;
  assert.equal(detail.members.length, 2);
  assert.deepEqual(detail.invitations, []);
  assert.deepEqual(detail.activity, []);
  await assert.rejects(
    db.query("select cashflow_groups_snapshot($1,'all',0)", [a]),
    /forbidden/,
  );
  await assert.rejects(
    db.query("select cashflow_set_system_role($1,$1,'admin')", [a]),
    /forbidden/,
  );
  await assert.rejects(
    db.query("select cashflow_admin_accounts($1,'',0)", [a]),
    /forbidden/,
  );
});
test("invitations require recipient consent and confirmed matching email; revocation and expiry are enforced", async () => {
  const id = await create();
  await act(a, "invite", { groupId: id, email: "C@EXAMPLE.COM" });
  const invite = await one(
    "select id from cashflow_group_invitations where group_id=$1",
    [id],
  );
  assert.equal(
    (
      await one(
        "select count(*)::int n from cashflow_group_members where group_id=$1",
        [id],
      )
    ).n,
    1,
  );
  await assert.rejects(
    act(b, "accept", { invitationId: invite.id }),
    /invitation_not_found/,
  );
  await assert.rejects(
    act(c, "accept", { invitationId: invite.id }),
    /verified_email_required/,
  );
  assert.equal(
    (await one("select cashflow_groups_snapshot($1) data", [b])).data
      .invitations.length,
    0,
  );
  await act(a, "revoke-invite", { groupId: id, invitationId: invite.id });
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    c,
  ]);
  await assert.rejects(
    act(c, "accept", { invitationId: invite.id }),
    /invitation_unavailable/,
  );
  await act(a, "invite", { groupId: id, email: "c@example.com" });
  const next = await one(
    "select id from cashflow_group_invitations where group_id=$1",
    [id],
  );
  assert.notEqual(next.id, invite.id);
  await assert.rejects(
    act(c, "accept", { invitationId: invite.id }),
    /invitation_not_found/,
  );
  await db.query(
    "update cashflow_group_invitations set expires_at=now()-interval '1 second' where id=$1",
    [next.id],
  );
  await assert.rejects(
    act(c, "accept", { invitationId: next.id }),
    /invitation_unavailable/,
  );
  await act(a, "invite", { groupId: id, email: "c@example.com" });
  const last = await one(
    "select id from cashflow_group_invitations where group_id=$1",
    [id],
  );
  await act(c, "decline", { invitationId: last.id });
  await assert.rejects(
    act(c, "accept", { invitationId: last.id }),
    /invitation_unavailable/,
  );
});
test("multiple leaders are allowed; transfer promotes target and removes creator privileges in one transaction", async () => {
  const id = await create();
  await join(id);
  await act(a, "member-role", { groupId: id, userId: b, role: "leader" });
  assert.equal(
    (await one("select cashflow_group_detail($1,$2) data", [b, id])).data
      .leaderCount,
    2,
  );
  await act(a, "transfer", { groupId: id, userId: b });
  assert.equal(
    (await one("select cashflow_group_detail($1,$2) data", [a, id])).data
      .myRole,
    "member",
  );
  await assert.rejects(
    act(a, "rename", { groupId: id, name: "Creator override" }),
    /forbidden/,
  );
  await assert.rejects(
    act(b, "transfer", { groupId: id, userId: b }),
    /same_member/,
  );
  await act(b, "member-role", { groupId: id, userId: a, role: "leader" });
  await act(a, "remove-member", { groupId: id, userId: b });
  assert.equal(
    (await one("select cashflow_group_detail($1,$2) data", [a, id])).data
      .leaderCount,
    1,
  );
});
test("last leader cannot leave, be demoted or be kicked even by an admin; deletion is explicit", async () => {
  const id = await create();
  await assert.rejects(act(a, "leave", { groupId: id }), /last_leader/);
  await assert.rejects(
    act(a, "member-role", { groupId: id, userId: a, role: "member" }),
    /last_leader/,
  );
  await assert.rejects(
    act(admin, "remove-member", { groupId: id, userId: a }),
    /last_leader/,
  );
  await assert.rejects(
    db.query("delete from cashflow_group_members where group_id=$1", [id]),
    /last_leader/,
  );
  await assert.rejects(
    act(a, "remove-member", { groupId: id, userId: a }),
    /use_leave/,
  );
  await act(a, "delete", { groupId: id });
  assert.equal(
    (await one("select count(*)::int n from cashflow_groups where id=$1", [id]))
      .n,
    0,
  );
});
test("accepted invitations cannot be replayed to rejoin after removal or leaving", async () => {
  const id = await create();
  const invite = await join(id);
  await act(b, "accept", { invitationId: invite }); // safe retry while still a member
  await act(a, "remove-member", { groupId: id, userId: b });
  await assert.rejects(
    act(b, "accept", { invitationId: invite }),
    /invitation_unavailable/,
  );
  await assert.rejects(
    db.query("select cashflow_group_detail($1,$2)", [b, id]),
    /group_not_found/,
  );
  const renewed = await join(id);
  await act(b, "leave", { groupId: id });
  await assert.rejects(
    act(b, "accept", { invitationId: renewed }),
    /invitation_unavailable/,
  );
});
test("admins can moderate outside groups and manage global roles without inheriting group leadership", async () => {
  const id = await create();
  assert.equal(
    (await one("select cashflow_group_detail($1,$2) data", [admin, id])).data
      .myRole,
    null,
  );
  await act(admin, "rename", { groupId: id, name: "Moderated" });
  await assert.rejects(
    act(admin, "transfer", { groupId: id, userId: a }),
    /forbidden/,
  );
  await assert.rejects(
    db.query("select cashflow_set_system_role($1,$1,'user')", [admin]),
    /last_admin/,
  );
  await db.query("select cashflow_set_system_role($1,$2,'admin')", [admin, b]);
  await db.query("select cashflow_set_system_role($1,$2,'user')", [admin, b]);
  assert.equal(
    (await one("select count(*)::int n from cashflow_role_audit")).n,
    2,
  );
  assert.ok(
    (await one("select cashflow_groups_snapshot($1,'all',0) data", [admin]))
      .data.total > 0,
  );
  assert.equal(
    (
      await one("select cashflow_admin_accounts($1,'b@example.com',0) data", [
        admin,
      ])
    ).data.users[0].role,
    "user",
  );
});
test("anon and authenticated cannot read private tables, mutate roles, or execute privileged group RPCs", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      for (const table of [
        "cashflow_user_roles",
        "cashflow_groups",
        "cashflow_group_members",
        "cashflow_group_invitations",
        "cashflow_group_audit",
        "cashflow_role_audit",
      ]) {
        await assert.rejects(
          db.exec(`select * from ${table}`),
          /permission denied/,
        );
        await assert.rejects(
          db.exec(`delete from ${table}`),
          /permission denied/,
        );
      }
      await assert.rejects(
        db.query("select cashflow_groups_snapshot($1)", [a]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select cashflow_set_system_role($1,$1,'admin')", [a]),
        /permission denied/,
      );
      await assert.rejects(
        act(a, "create", { groupId: randomUUID(), name: "Bypass" }),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
  await db.exec("set role service_role");
  try {
    assert.equal(
      (await one("select cashflow_groups_snapshot($1) data", [a])).data
        .systemRole,
      "user",
    );
  } finally {
    await db.exec("reset role");
  }
});
test("database validation rolls back invalid names, email and group roles without changing members", async () => {
  const id = await create();
  await join(id);
  await assert.rejects(
    act(a, "rename", { groupId: id, name: " ".repeat(5) }),
    /check constraint/,
  );
  await assert.rejects(
    act(a, "invite", { groupId: id, email: "bad email@example.com" }),
    /invalid_email/,
  );
  await assert.rejects(
    act(a, "member-role", { groupId: id, userId: b, role: "admin" }),
    /invalid_role/,
  );
  const detail = (
    await one("select cashflow_group_detail($1,$2) data", [a, id])
  ).data;
  assert.equal(detail.name, "Team");
  assert.equal(detail.members.find((m: any) => m.userId === b).role, "member");
});
test("group quota and pagination enforce the documented maximum and preserve the last successful group", async () => {
  const owner = randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at)values($1,'quota@example.com',now())",
    [owner],
  );
  await db.query(
    `with groups as (
    insert into cashflow_groups(id,name,created_by) select gen_random_uuid(),'Quota team', $1::uuid from generate_series(1,49) returning id
  ) insert into cashflow_group_members(group_id,user_id,role) select id,$1::uuid,'leader' from groups`,
    [owner],
  );
  const last = randomUUID();
  await act(owner, "create", { groupId: last, name: "Last allowed" });
  await assert.rejects(
    act(owner, "create", { groupId: randomUUID(), name: "Over quota" }),
    /group_limit/,
  );
  const first = (
    await one("select cashflow_groups_snapshot($1,$2,$3) data", [
      owner,
      "mine",
      0,
    ])
  ).data;
  const third = (
    await one("select cashflow_groups_snapshot($1,$2,$3) data", [
      owner,
      "mine",
      2,
    ])
  ).data;
  assert.equal(first.total, 50);
  assert.equal(first.groups.length, 20);
  assert.equal(third.groups.length, 10);
  assert.equal(
    (await one("select name from cashflow_groups where id=$1", [last])).name,
    "Last allowed",
  );
});
test("bootstrap SQL requires an explicit confirmed account, creates exactly the first admin, and records an audit", async () => {
  const script = await readFile("database/bootstrap-admin.sql", "utf8");
  const runInvalid = async (sql: string, error: RegExp) => {
    try {
      await assert.rejects(db.exec(sql), error);
    } finally {
      await db.exec("rollback");
    }
  };
  await runInvalid(script, /Replace cashflow.bootstrap_admin_id/);
  await db.exec("update cashflow_user_roles set role='user'");
  const unverified = randomUUID();
  await db.query(
    "insert into auth.users(id,email)values($1,'unverified@example.com')",
    [unverified],
  );
  await runInvalid(
    script.replace("00000000-0000-0000-0000-000000000000", unverified),
    /unconfirmed/,
  );
  const approved = script.replace(
    "00000000-0000-0000-0000-000000000000",
    admin,
  );
  await db.exec(approved);
  assert.equal(
    (
      await one(
        "select count(*)::int n from cashflow_user_roles where role='admin'",
      )
    ).n,
    1,
  );
  assert.equal(
    (
      await one("select role from cashflow_user_roles where user_id=$1", [
        admin,
      ])
    ).role,
    "admin",
  );
  assert.equal(
    (
      await one(
        "select count(*)::int n from cashflow_role_audit where actor_id is null and target_id=$1",
        [admin],
      )
    ).n,
    1,
  );
  await runInvalid(approved, /An admin already exists/);
});

async function financeSnapshot(actor: string, id: string) {
  return (
    await one("select cashflow_group_finance_snapshot($1,$2) result", [
      actor,
      id,
    ])
  ).result;
}
async function financeWrite(actor: string, id: string, changes: unknown[]) {
  await db.query("select cashflow_group_finance_apply($1,$2,$3::jsonb)", [
    actor,
    id,
    JSON.stringify(changes),
  ]);
}
const financeExpense = (
  id = "shared",
  amount = 100,
  version: number | null = null,
) => ({
  table: "cashflow_expenses",
  id,
  op: "set",
  version,
  data: {
    id,
    name: "Shared expense",
    amount,
    category: "Travel",
    date: "2026-09-18",
  },
});
test("group finance is shared with members, isolated across groups, and hidden from outside admins", async () => {
  const first = await create(),
    second = await create();
  await join(first);
  await financeWrite(a, first, [financeExpense()]);
  assert.equal(
    (await financeSnapshot(b, first)).snapshot.expenses[0].amount,
    100,
  );
  await financeWrite(b, first, [financeExpense("shared", 200, 1)]);
  assert.equal(
    (await financeSnapshot(a, first)).snapshot.expenses[0].amount,
    200,
  );
  assert.deepEqual((await financeSnapshot(a, second)).snapshot.expenses, []);
  for (const outsider of [c, admin]) {
    await assert.rejects(
      financeSnapshot(outsider, first),
      /group_finance_forbidden/,
    );
    await assert.rejects(
      financeWrite(outsider, first, [financeExpense("intruder")]),
      /group_finance_forbidden/,
    );
  }
});
test("removal and leaving immediately revoke group finance; transfer preserves shared ownership", async () => {
  const id = await create();
  await join(id);
  await financeWrite(b, id, [financeExpense()]);
  await act(a, "transfer", { groupId: id, userId: b });
  assert.equal((await financeSnapshot(a, id)).snapshot.expenses.length, 1);
  await act(b, "remove-member", { groupId: id, userId: a });
  await assert.rejects(financeSnapshot(a, id), /group_finance_forbidden/);
  await assert.rejects(
    financeWrite(a, id, [financeExpense("old-leader")]),
    /group_finance_forbidden/,
  );
  assert.equal((await financeSnapshot(b, id)).snapshot.expenses.length, 1);
  await act(b, "delete", { groupId: id });
  assert.equal(
    (
      await one(
        "select count(*)::int n from cashflow_group_finance where group_id=$1",
        [id],
      )
    ).n,
    0,
  );
});
test("group finance stale versions roll back the whole batch and cannot overwrite another member", async () => {
  const id = await create();
  await join(id);
  await financeWrite(a, id, [financeExpense()]);
  await financeWrite(b, id, [financeExpense("shared", 300, 1)]);
  await assert.rejects(
    financeWrite(a, id, [
      financeExpense("rollback"),
      financeExpense("shared", 400, 1),
    ]),
    /version_conflict/,
  );
  const result = await financeSnapshot(a, id);
  assert.equal(result.snapshot.expenses.length, 1);
  assert.equal(result.snapshot.expenses[0].amount, 300);
  assert.equal(result.versions.cashflow_expenses.shared, 2);
});
test("group finance supports independent settings, goals, jobs, invoices and issuer profiles", async () => {
  const id = await create();
  await join(id);
  const changes = [
    ...["jobs", "goals", "invoices"].map((name) => ({
      table: "cashflow_" + name,
      id: "same-id",
      op: "set",
      version: null,
      data: { id: "same-id", name },
    })),
    {
      table: "cashflow_documents",
      id: "settings",
      op: "set",
      version: null,
      data: { monthlyExpense: 250 },
    },
    {
      table: "cashflow_documents",
      id: "issuer_profile",
      op: "set",
      version: null,
      data: { name: "Team Ltd" },
    },
    {
      table: "cashflow_documents",
      id: "statuses",
      op: "set",
      version: null,
      data: [],
    },
  ];
  await financeWrite(b, id, changes);
  const result = await financeSnapshot(a, id);
  for (const field of ["jobs", "goals", "invoices"])
    assert.equal(result.snapshot[field][0].id, "same-id");
  assert.equal(result.snapshot.settings.monthlyExpense, 250);
  assert.equal(result.snapshot.issuer_profile.name, "Team Ltd");
  assert.equal(result.snapshot.notif_settings.lineUserId, undefined);
  await assert.rejects(
    financeWrite(a, id, [
      {
        table: "cashflow_documents",
        id: "avatar_data_url",
        op: "set",
        version: null,
        data: null,
      },
    ]),
    /invalid_table_or_document/,
  );
  await assert.rejects(
    financeWrite(a, id, [financeExpense(), financeExpense()]),
    /duplicate_changes/,
  );
});
test("browser database roles cannot read or mutate shared finance or execute finance RPCs", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    try {
      await assert.rejects(
        db.exec("select * from cashflow_group_finance"),
        /permission denied/,
      );
      await assert.rejects(
        db.exec(`select cashflow_group_finance_snapshot('${a}','${a}')`),
        /permission denied/,
      );
      await assert.rejects(
        db.exec(`select cashflow_group_finance_apply('${a}','${a}','[]')`),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
});

test("group finance size quota rolls back an overflowing batch while retaining the last successful save", async () => {
  const id = await create();
  const batch = (start: number, count: number) =>
    Array.from({ length: count }, (_, offset) => {
      const record = financeExpense("quota-" + (start + offset));
      return { ...record, data: { ...record.data, note: "x".repeat(10000) } };
    });
  await financeWrite(a, id, batch(0, 300));
  await assert.rejects(
    financeWrite(a, id, batch(300, 150)),
    /group_finance_quota/,
  );
  const snapshot = await financeSnapshot(a, id);
  assert.equal(snapshot.snapshot.expenses.length, 300);
  assert.equal(
    (
      await one(
        "select count(*)::int n from cashflow_group_finance where group_id=$1",
        [id],
      )
    ).n,
    300,
  );
});
