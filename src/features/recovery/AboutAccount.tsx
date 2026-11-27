/**
 * Settings → About my account (every account). Owner, 2026-11-22: not a
 * permissions table — a plain document, like an "About" page, telling each
 * person who they are in STANLEY, what their job is, their daily tasks, what
 * they can and can't do (and who does it instead), the company's rules, and
 * who to ask. Permissions are read live from Roles & permissions, so the page
 * is always true.
 */
import { BookOpenText, Check, Minus, Printer } from "lucide-react";
import { useApp } from "@/app/AppState";
import { getBranch } from "@/data/company";
import { MANAGER_ROLE, managerOf } from "@/data/userRecords";
import { PERMISSION_GROUPS, can, usePermissions } from "@/services/permissions";
import { useHealth } from "@/services/recovery/health";
import { useCompanyName } from "@/shell/BrandLogo";
import { Button } from "@/shared/ui/controls";

type Kind = "admin" | "manager" | "staff";

const JOB: Record<Kind, { summary: string; tasks: string[] }> = {
  admin: {
    summary: "You are the Company Admin — the owner's account. You oversee every branch, set how the company works (prices, payment rules, roles, branding) and see the full financial picture, including net profit. You don't register patients or create bills: that is the branches' work.",
    tasks: [
      "Check the company dashboard each morning — money in, outstanding balances, branch activity.",
      "Approve anything waiting in Settings → Approvals.",
      "Keep branches, managers and staff accounts up to date.",
      "Review Finance & Expenses and the monthly PR commission payout.",
      "Make and share reports (print, PDF or spreadsheet).",
      "Look at System health now and then — backups, problems, reported issues.",
    ],
  },
  manager: {
    summary: "You are the Branch Manager — head of the branch and of all its front-desk staff. You make sure every patient is billed correctly, approve balances, discounts and expenses, look after the PR agents and hospitals that send patients, and keep the branch's records and reports in order.",
    tasks: [
      "Open the dashboard: today's payments by Cash / POS / Transfer, and patients who still owe.",
      "Approve or reject expenses waiting for you; approve balances when a patient can't pay in full.",
      "Check Drafts for unfinished bills and make sure they are completed.",
      "Follow up outstanding balances and promised payment dates.",
      "Keep PR agents' and hospitals' details correct; review referrals.",
      "At the end of the day, review the day's money in and print the reports you need.",
      "Manage your front-desk team in Staff Management.",
    ],
  },
  staff: {
    summary: "You are Front Desk — the first person every patient meets. You register patients, create their bills, take payment, print receipts and keep unfinished bills moving. Your Branch Manager approves balances, discounts and expenses.",
    tasks: [
      "Bill each patient on the Billing page: patient → services → payment → preview → receipt.",
      "Take payment by Cash, POS or Transfer and print the receipt.",
      "If a patient can't pay in full, record the balance with the reason and who approved it.",
      "Finish or continue unfinished bills from Drafts.",
      "Give price quotes with the Price calculator (it never creates a bill).",
      "Record expenses you make for the branch (your manager approves them).",
    ],
  },
};

const RULES = [
  ["Nothing is ever deleted outright.", "Anything removed goes to Trash for 30 days and can be restored by a manager or the Company Admin."],
  ["Every change is recorded.", "The Audit log keeps who did what and when. It can't be edited or deleted — by anyone."],
  ["Balances need a reason and an approver.", "A bill that isn't fully paid must say why and who approved it (usually the Branch Manager)."],
  ["Expenses need an approver.", "Only approved expenses count as money spent."],
  ["Prices come from the price list.", "Only managers and the Company Admin change a price or give a discount — and it is recorded."],
  ["Net profit is for the Company Admin only.", "Managers and front desk see money in and expenses, never profit or margin."],
  ["STANLEY works offline.", "Everything is saved on this computer as you go; bills wait here until the cloud database is connected."],
  ["Your work is backed up every day.", "Automatically, keeping the last 7 days. Damaged data is repaired from backups by itself."],
] as const;

export function AboutAccountSection() {
  usePermissions();
  const { user, staff } = useApp();
  const company = useCompanyName();
  const { support } = useHealth();
  const kind = user.kind as Kind;
  const branch = user.branchId ? getBranch(user.branchId) : undefined;
  const me = user.staffId ? staff.find((s) => s.id === user.staffId) : undefined;
  const manager = user.branchId ? managerOf(staff, user.branchId) : undefined;
  const job = JOB[kind];

  const perms = PERMISSION_GROUPS.flatMap((g) => g.perms.map((p) => ({ ...p, group: g.label })));
  const yes = perms.filter((p) => can(user.role, p.id));
  const no = perms.filter((p) => !can(user.role, p.id));
  const whoDoes = (p: (typeof perms)[number]) => (p.adminOnly ? "Company Admin only" : p.managersOnly ? `${MANAGER_ROLE} and Company Admin only` : kind === "staff" ? `Your ${MANAGER_ROLE} (or the Company Admin)` : "The Company Admin can give this to your role");

  return (
    <article className="ab-doc" id="about-account">
      <header className="ab-head">
        <span className="ab-icon" aria-hidden="true">
          <BookOpenText size={22} />
        </span>
        <div>
          <span className="ab-eyebrow">About my account · {company}</span>
          <h3>{user.name}</h3>
          <p>
            {user.role}
            {branch ? ` · ${branch.name} branch (${branch.code})` : " · whole company"}
            {me?.startDate ? ` · since ${new Date(me.startDate).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}` : ""}
            {me?.status && me.status !== "Active" ? ` · ${me.status}` : ""}
          </p>
        </div>
        <Button variant="secondary" size="sm" className="ab-print" onClick={() => printDoc()}>
          <Printer size={14} /> Print
        </Button>
      </header>

      <section>
        <h4>Your job in STANLEY</h4>
        <p>{job.summary}</p>
      </section>

      <section>
        <h4>Your everyday tasks</h4>
        <ol className="ab-tasks">
          {job.tasks.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </section>

      <section>
        <h4>What you can do</h4>
        <p className="ab-muted">
          {yes.length} things, set in Roles &amp; permissions{kind === "admin" ? " — the Company Admin always has every permission and can't be locked out." : " by the Company Admin."}
        </p>
        <ul className="ab-list is-yes">
          {yes.map((p) => (
            <li key={p.id}>
              <Check size={14} />
              <span>
                <b>{p.label}</b> — {p.description}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {no.length > 0 && (
        <section>
          <h4>What you can't do — and who does it</h4>
          <p className="ab-muted">These aren't part of your role. If you need one for your work, ask {kind === "staff" ? `your ${MANAGER_ROLE}` : "the Company Admin"}.</p>
          <ul className="ab-list is-no">
            {no.map((p) => (
              <li key={p.id}>
                <Minus size={14} />
                <span>
                  <b>{p.label}</b> — {p.description} <em>{whoDoes(p)}</em>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4>Rules everyone follows</h4>
        <dl className="ab-rules">
          {RULES.map(([t, d]) => (
            <div key={t}>
              <dt>{t}</dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h4>Who to ask</h4>
        <ul className="ab-who">
          {kind === "staff" && <li>For work questions, approvals and access: {manager ? <b>{manager.name}</b> : `your ${MANAGER_ROLE}`} ({MANAGER_ROLE}).</li>}
          {kind !== "admin" && <li>For company rules, prices and permissions: the Company Admin.</li>}
          <li>
            When STANLEY shows a problem: Settings → <b>System health</b> → “Scan for errors”, or <b>Report an issue</b> and describe it in your own words.
          </li>
          <li>
            For problems STANLEY can't fix by itself: {support.name || support.phone ? <b>{[support.name, support.phone, support.email].filter(Boolean).join(" · ")}</b> : "your developer (the Company Admin can add the contact in System health)"}.
          </li>
        </ul>
      </section>
    </article>
  );
}

/** Print just this document (not the whole app). */
function printDoc() {
  const el = document.getElementById("about-account");
  if (!el) return;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelector(".ab-print")?.remove();
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>About my account</title><style>
    body{font:13px/1.55 system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:24px}
    h3{font-size:20px;margin:0}h4{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
    .ab-head{display:flex;gap:12px}.ab-icon,svg{display:none}.ab-eyebrow{font-size:11px;text-transform:uppercase;color:#555}
    ul,ol{padding-left:18px;margin:4px 0}li{margin:2px 0}em{font-style:normal;color:#666;font-size:11px;margin-left:6px}
    dl div{margin:4px 0}dt{font-weight:600}dd{margin:0 0 0 0;color:#333}.ab-muted{color:#555;margin:0 0 4px}
    @page{size:A4;margin:14mm}
  </style></head><body>${clone.outerHTML}</body></html>`);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 150);
}
