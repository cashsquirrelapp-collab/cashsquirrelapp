import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@example.com",
  role: "user",
  created_at: "2026-01-01T00:00:00Z",
  user_metadata: {},
};
const group = "55555555-5555-4555-8555-555555555555";
const other = "66666666-6666-4666-8666-666666666666";
const prefs = {
  enabled: true,
  alertEmail: user.email,
  serviceType: "mailto",
  emailjsServiceId: "",
  emailjsTemplateId: "",
  emailjsPublicKey: "",
  pendingQueue: [],
};
function data(label: string) {
  const profile = {
    name: label + " issuer",
    address: "Bangkok",
    phone: "",
    email: "",
    taxId: "",
    bankName: "",
    bankAccount: "",
    bankAccountName: "",
  };
  const snapshot: any = {
    jobs: [
      {
        id: "same-id",
        name: label + " job",
        value: 100,
        received: 0,
        pending: 100,
        client: label + " client",
        type: "Design",
        status: "pending",
        creditTerm: 0,
        note: "",
        payDate: null,
        isPosted: true,
        monthKey: "2026-09",
      },
    ],
    expenses: [],
    goals: [],
    invoices: [
      {
        id: "same-id",
        documentType: "invoice",
        documentNo: label + "-001",
        createdDate: "2026-09-18",
        issuer: profile,
        client: {
          name: label + " client",
          address: "",
          phone: "",
          email: "",
          taxId: "",
        },
        items: [],
        vatRate: 0,
        whtRate: 0,
      },
    ],
    settings: {
      monthlyExpense: 0,
      monthlyRevenueGoal: 20000,
      savingsPercentage: 40,
      profileSetupCompleted: true,
      userPersona: "freelance",
    },
    statuses: [
      { id: "done", label: "จ่ายเงินครบแล้ว", behavior: "done" },
      { id: "partial", label: "มัดจำแล้ว", behavior: "partial" },
      { id: "pending", label: "ยังไม่จ่าย", behavior: "pending" },
    ],
    job_types: ["Design"],
    notif_settings: prefs,
    issuer_profile: profile,
    avatar_data_url: null,
  };
  const versions: any = {
    cashflow_jobs: { "same-id": 1 },
    cashflow_expenses: {},
    cashflow_goals: {},
    cashflow_invoices: { "same-id": 1 },
    cashflow_documents: {
      settings: 1,
      statuses: 1,
      job_types: 1,
      notif_settings: 1,
      issuer_profile: 1,
    },
  };
  return {
    snapshot,
    versions,
    subscription: {
      status: "active",
      plan: "pro_monthly",
      current_period_end: "2027-01-01T00:00:00Z",
    },
  };
}
async function setup(page: Page) {
  const stores: Record<string, ReturnType<typeof data>> = {
    "": data("Personal"),
    [group]: data("Team"),
    [other]: data("Other"),
  };
  const writes: { scope: string; changes: any[] }[] = [];
  let denied = false,
    failed = false;
  await page.route("**/api/auth", (route) =>
    route.fulfill({ json: { session: { user } } }),
  );
  await page.route("**/api/groups?*", (route) =>
    route.fulfill({
      json: {
        systemRole: "user",
        groups: [group, other].map((id, i) => ({
          id,
          name: i ? "Other team" : "Design team",
          description: "",
          myRole: "member",
          memberCount: 2,
          leaderCount: 1,
          createdAt: "2026-09-18",
        })),
        total: 2,
        page: 0,
        invitations: [],
      },
    }),
  );
  await page.route("**/api/data", (route) => {
    const request = route.request(),
      scope = request.headers()["x-finance-group"] || "";
    expect(request.headers()["x-account-id"]).toBe(user.id);
    if (denied && scope === group)
      return route.fulfill({
        status: 403,
        json: { error: "คุณไม่ได้เป็นสมาชิกกลุ่มนี้แล้ว" },
      });
    if (request.method() === "POST") {
      if (failed)
        return route.fulfill({
          status: 409,
          json: { error: "รายการถูกแก้ไขจากสมาชิกอื่น" },
        });
      const changes = request.postDataJSON().changes;
      writes.push({ scope, changes });
      const store = stores[scope];
      for (const c of changes) {
        const field = c.table.replace("cashflow_", "");
        if (field === "documents") store.snapshot[c.id] = c.data;
        else {
          const rows = store.snapshot[field];
          const index = rows.findIndex((row: any) => row.id === c.id);
          if (c.op === "delete") {
            if (index >= 0) rows.splice(index, 1);
          } else if (index >= 0) rows[index] = c.data;
          else rows.push(c.data);
        }
        if (c.op === "delete") delete store.versions[c.table][c.id];
        else store.versions[c.table][c.id] = (c.version || 0) + 1;
      }
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: stores[scope] });
  });
  await page.goto("/");
  await expect(page.getByLabel("บัญชีการเงิน", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "วางแผนวันนี้ ให้เงินเติบโตทุกวัน" }),
  ).toBeVisible();
  return {
    stores,
    writes,
    deny: () => {
      denied = true;
    },
    fail: () => {
      failed = true;
    },
  };
}
async function settings(page: Page) {
  await page
    .locator("aside nav")
    .getByRole("button", { name: "ตั้งค่า" })
    .click();
}
async function invoices(page: Page) {
  const sidebar = page.locator("aside");
  const button = sidebar.getByRole("button", { name: "ออกบิล & ใบเสร็จ" });
  if (!(await button.isVisible()))
    await sidebar.getByRole("button", { name: "เครื่องมือเพิ่มเติม" }).click();
  await button.click();
}
test("members edit a shared workspace and switching saves to the old scope without touching personal finance", async ({
  page,
}) => {
  const state = await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption(group);
  await expect(
    page.getByText("สมาชิกทุกคนดูและแก้ไขได้", { exact: true }),
  ).toBeVisible();
  await settings(page);
  await expect(
    page.getByText("รายงานและไฟล์สำรองใช้ข้อมูลของกลุ่มที่เลือก", {
      exact: false,
    }),
  ).toBeVisible();
  await page.locator("#main-content input").first().fill("Group office");
  // Fixed expense item editor: add a real finance change then switch before debounce.
  await page.locator("#main-content input").nth(1).fill("700");
  await page
    .locator("#main-content")
    .getByRole("button", { name: "เพิ่มรายการ", exact: true })
    .click();
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption("");
  await expect(page.getByLabel("บัญชีการเงิน", { exact: true })).toHaveValue(
    "",
  );
  expect(state.stores[group].snapshot.settings.monthlyExpense).toBe(700);
  expect(state.stores[""].snapshot.settings.monthlyExpense).toBe(0);
  expect(
    state.writes.some(
      (w) =>
        w.scope === group &&
        w.changes.some(
          (c) => c.id === "settings" && c.data.monthlyExpense === 700,
        ),
    ),
  ).toBe(true);
  expect(
    state.writes.some(
      (w) =>
        w.scope === "" &&
        w.changes.some(
          (c) => c.id === "settings" && c.data.monthlyExpense === 700,
        ),
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
test("invoices, issuer profiles and exports follow the selected group and reset when switching", async ({
  page,
}) => {
  await setup(page);
  await invoices(page);
  await expect(page.getByText("Personal-001", { exact: true })).toBeVisible();
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption(group);
  await expect(page.getByText("Team-001", { exact: true })).toBeVisible();
  await expect(page.getByText("Personal-001", { exact: true })).toHaveCount(0);
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption(other);
  await expect(page.getByText("Other-001", { exact: true })).toBeVisible();
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption(group);
  await settings(page);
  // Export from summary uses the same scoped invoice snapshot.
  const sidebar = page.locator("aside");
  await sidebar.getByRole("button", { name: "สรุปยอดรายรับ" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .locator("#main-content")
    .getByRole("button", { name: /ส่งออก|สำรอง/ })
    .first()
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("group-" + group);
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.workspace.groupId).toBe(group);
  expect(backup.invoices[0].documentNo).toBe("Team-001");
  expect(backup.jobs[0].name).toBe("Team job");
  await page.screenshot({path:'artifacts/group-finance-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/group-finance-mobile.png',fullPage:true});

});
test("failed saves block switching and keep the selected workspace and unsaved data", async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption(group);
  await settings(page);
  await expect(
    page.getByText("รายงานและไฟล์สำรองใช้ข้อมูลของกลุ่มที่เลือก", {
      exact: false,
    }),
  ).toBeVisible();
  await page.locator("#main-content input").first().fill("Unsaved office");
  await page.locator("#main-content input").nth(1).fill("999");
  await page
    .locator("#main-content")
    .getByRole("button", { name: "เพิ่มรายการ", exact: true })
    .click();
  await expect(page.getByText("Unsaved office", { exact: true })).toBeVisible();
  state.fail();
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption("");
  await expect(
    page.getByText("เปลี่ยนบัญชีการเงินไม่สำเร็จ", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("บัญชีการเงิน", { exact: true })).toHaveValue(
    group,
  );
  await expect(page.getByText("Unsaved office", { exact: true })).toBeVisible();
});
test("removed membership rejects reload and permits returning to personal finance without leaking group data", async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption(group);
  await invoices(page);
  await expect(page.getByText("Team-001", { exact: true })).toBeVisible();
  state.deny();
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption(other);
  await expect(page.getByText("Other-001", { exact: true })).toBeVisible();
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption(group);
  await expect(
    page.getByText("โหลดบัญชีการเงินไม่สำเร็จ", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Team-001", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Other-001", { exact: true })).toHaveCount(0);
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption("");
  await expect(page.getByText("Personal-001", { exact: true })).toBeVisible();
});

test("a delayed response from the previous group cannot populate the next workspace", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route("**/api/data", async (route) => {
    if (
      route.request().method() === "GET" &&
      route.request().headers()["x-finance-group"] === group
    ) {
      started = true;
      await held;
      await route.fulfill({ json: data("Late team") });
      return;
    }
    await route.fallback();
  });
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption(group);
  await expect.poll(() => started).toBe(true);
  await page.getByLabel("บัญชีการเงิน", { exact: true }).selectOption(other);
  await expect(
    page.getByRole("heading", { name: "วางแผนวันนี้ ให้เงินเติบโตทุกวัน" }),
  ).toBeVisible();
  release();
  await invoices(page);
  await expect(page.getByText("Other-001", { exact: true })).toBeVisible();
  await expect(page.getByText("Late team-001", { exact: true })).toHaveCount(0);
  await page.waitForTimeout(1800);
  await expect(page.getByLabel("บัญชีการเงิน", { exact: true })).toHaveValue(
    other,
  );
});
