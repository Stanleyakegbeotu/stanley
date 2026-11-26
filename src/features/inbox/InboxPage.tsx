/**
 * Inbox (owner, 2026-11-26): messages between the Company Admin, the
 * branches (manager and the front desk on duty) and the PR agents, in the
 * same chat design as STANLEY AI (header, chat card, bubbles, composer). The
 * conversation list sits on the left; the open conversation on the right.
 *
 * Opened from the inbox icon in the header (with the unread count).
 * Routes: "/messages" (Company Admin), "/branch/<id>/messages" (branch).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, Handshake, Inbox, MessagesSquare, Search, ShieldCheck, UserRound, Users } from "lucide-react";
import { useApp } from "@/app/AppState";
import { branchRoute } from "@/app/router";
import { ACTIVE_BRANCHES, getBranch } from "@/data/company";
import { hospitalKey } from "@/data/legacy";
import { isManager } from "@/data/userRecords";
import { markRead, sendMessage, threadOf, unreadIn, useInboxStore, type ChatKind, type ChatThread, type Party } from "@/services/inbox";
import { AnimatedPage } from "@/shared/motion";
import { initials } from "@/shared/format";

export interface Conversation {
  me: Party;
  them: Party;
  kind: ChatKind;
  title: string;
  subtitle: string;
  thread: ChatThread;
}

const KIND_LABEL: Record<ChatKind, string> = { admin: "Company Admin", manager: "Branch Manager", frontdesk: "Front desk", agent: "PR agent" };
const KIND_ICON = { admin: ShieldCheck, manager: UserRound, frontdesk: Building2, agent: Handshake };
const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** Who this workspace talks to, newest conversation first. */
export function useConversations(): { me: Party; myName: string; list: Conversation[]; unread: number } {
  const { user, route, agents, staff } = useApp();
  const store = useInboxStore();
  const br = branchRoute(route);
  return useMemo(() => {
    const branchId = br?.branchId ?? null;
    const me: Party = !branchId ? "admin" : user.kind === "staff" ? `fd:${branchId}` : `mgr:${branchId}`;
    const myName = user.name;
    const managerOf = (id: string) => staff.find((s) => s.branchId === id && isManager(s) && s.status === "Active")?.name ?? "Branch Manager";
    const raw: Omit<Conversation, "thread">[] = [];
    if (!branchId) {
      for (const b of ACTIVE_BRANCHES) {
        raw.push({ me, them: `fd:${b.id}`, kind: "frontdesk", title: `Front desk · ${b.name}`, subtitle: "Shared inbox, answered by whoever is on duty" });
        raw.push({ me, them: `mgr:${b.id}`, kind: "manager", title: managerOf(b.id), subtitle: `Branch Manager · ${b.name} branch` });
      }
    } else {
      const b = getBranch(branchId);
      raw.push({ me, them: "admin", kind: "admin", title: "Company Admin", subtitle: "Company administration" });
      if (me.startsWith("mgr:")) raw.push({ me, them: `fd:${branchId}`, kind: "frontdesk", title: `Front desk · ${b?.name ?? ""}`, subtitle: "Shared inbox, answered by whoever is on duty" });
      else raw.push({ me, them: `mgr:${branchId}`, kind: "manager", title: managerOf(branchId), subtitle: `Branch Manager · ${b?.name ?? ""} branch` });
    }
    for (const a of agents) raw.push({ me, them: `pr:${a.id}`, kind: "agent", title: a.name, subtitle: `PR agent${hospitalKey(a.hospital) ? ` · ${hospitalKey(a.hospital)}` : ""}` });
    // Staff conversations and the first three PR agents open with a short sample; the rest start empty.
    let samples = 0;
    const list = raw.map((c) => {
      const seed = c.kind !== "agent" || samples++ < 3;
      const t = threadOf(store, c.me, c.them, myName, c.title, c.kind);
      return { ...c, thread: seed || store[t.id] ? t : { ...t, messages: [] } };
    });
    list.sort((x, y) => {
      const lx = x.thread.messages[x.thread.messages.length - 1]?.at ?? "";
      const ly = y.thread.messages[y.thread.messages.length - 1]?.at ?? "";
      return ly.localeCompare(lx) || x.title.localeCompare(y.title);
    });
    return { me, myName, list, unread: list.reduce((n, c) => n + unreadIn(c.thread, me), 0) };
  }, [br?.branchId, user.kind, user.name, agents, staff, store]);
}

/* ─────────────── header button ─────────────── */

export function InboxButton() {
  const { route, navigate } = useApp();
  const br = branchRoute(route);
  const { unread } = useConversations();
  const to = br ? `/branch/${br.branchId}/messages` : "/messages";
  const on = br ? br.page === "messages" : route.segments[0] === "messages";
  return (
    <button type="button" className={`hdr-control hdr-icon-btn hdr-inbox ${on ? "is-on" : ""}`} aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"} title="Inbox" onClick={() => navigate(to)}>
      <MessagesSquare size={21} />
      {unread > 0 && <span className="hdr-badge">{unread > 99 ? "99+" : unread}</span>}
    </button>
  );
}

/* ─────────────── page ─────────────── */

type Filter = "all" | "unread" | "staff" | "agents";

export function InboxPage() {
  const { me, myName, list, unread } = useConversations();
  const { user } = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const t = q.trim().toLowerCase();
  const shown = list.filter(
    (c) =>
      (filter === "all" || (filter === "unread" && unreadIn(c.thread, me) > 0) || (filter === "staff" && c.kind !== "agent") || (filter === "agents" && c.kind === "agent")) &&
      (!t || `${c.title} ${c.subtitle}`.toLowerCase().includes(t)),
  );
  const current = list.find((c) => c.thread.id === openId) ?? list[0] ?? null;
  const staffN = list.filter((c) => c.kind !== "agent").length;

  return (
    <AnimatedPage>
      <section className="ai-workspace ib-workspace">
        <header className="ai-head">
          <span className="ai-mark" aria-hidden="true">
            <MessagesSquare size={26} />
          </span>
          <div className="ai-title">
            <div>
              <h1>Inbox</h1>
              <span className="ai-badge">{user.role}</span>
            </div>
            <span className="ai-status is-ready">
              <i /> {unread ? `${unread} unread` : "All read"} · saved on this computer, sent when the cloud is connected
            </span>
          </div>
        </header>

        <div className="ib-body">
          <aside className="ib-list">
            <label className="ib-search">
              <Search size={17} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people and branches" aria-label="Search conversations" />
            </label>
            <div className="ib-tabs" role="tablist">
              {(
                [
                  ["all", "All", list.length],
                  ["unread", "Unread", list.filter((c) => unreadIn(c.thread, me) > 0).length],
                  ["staff", "Staff", staffN],
                  ["agents", "PR agents", list.length - staffN],
                ] as const
              ).map(([k, l, n]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? "is-on" : ""} onClick={() => setFilter(k)}>
                  {l} <em>{n}</em>
                </button>
              ))}
            </div>
            <ul className="ib-items thin-scroll">
              {shown.map((c) => {
                const last = c.thread.messages[c.thread.messages.length - 1];
                const n = unreadIn(c.thread, me);
                const Icon = KIND_ICON[c.kind];
                return (
                  <li key={c.thread.id}>
                    <button type="button" className={`ib-item ${current?.thread.id === c.thread.id ? "is-on" : ""} ${n ? "has-unread" : ""}`} onClick={() => setOpenId(c.thread.id)}>
                      <span className={`ib-avatar is-${c.kind}`}>
                        {c.kind === "frontdesk" || c.kind === "admin" ? <Icon size={18} /> : initials(c.title)}
                      </span>
                      <span className="ib-item-text">
                        <span className="ib-item-top">
                          <b>{c.title}</b>
                          {last && <small>{when(last.at)}</small>}
                        </span>
                        <span className="ib-item-sub">
                          <small>{last ? `${last.by === me ? "You: " : ""}${last.text}` : c.subtitle}</small>
                          {n > 0 && <em>{n}</em>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {!shown.length && <li className="ib-none">No conversation matches.</li>}
            </ul>
          </aside>

          {current ? <ChatPane key={current.thread.id} c={current} me={me} myName={myName} /> : <div className="ai-chat ib-empty">No conversations yet.</div>}
        </div>
      </section>
    </AnimatedPage>
  );
}

function ChatPane({ c, me, myName }: { c: Conversation; me: Party; myName: string }) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const Icon = KIND_ICON[c.kind];
  useEffect(() => {
    markRead(c.thread, me);
    end.current?.scrollIntoView({ block: "end" });
  }, [c.thread, me]);
  const submit = () => {
    if (!text.trim()) return;
    sendMessage(c.thread, me, myName, text.trim());
    setText("");
    box.current?.focus();
  };
  let lastDay = "";
  return (
    <div className="ai-chat ib-chat">
      <header className="ib-chat-head">
        <span className={`ib-avatar is-${c.kind} is-lg`}>{c.kind === "frontdesk" || c.kind === "admin" ? <Icon size={20} /> : initials(c.title)}</span>
        <span className="ib-chat-title">
          <b>{c.title}</b>
          <small>{c.subtitle}</small>
        </span>
        <span className="ai-badge">{KIND_LABEL[c.kind]}</span>
      </header>
      {c.kind === "agent" && (
        <p className="ib-note">
          <Handshake size={15} /> For referrals and logistics only. Patient details stay in the referral, and nothing about money is sent to PR agents.
        </p>
      )}
      <div className="ai-scroll thin-scroll">
        {c.thread.messages.length ? (
          <ol className="ai-thread ib-thread">
            {c.thread.messages.map((m) => {
              const day = new Date(m.at).toDateString();
              const sep = day !== lastDay;
              lastDay = day;
              const mine = m.by === me;
              return (
                <li key={m.id} className="ib-li">
                  {sep && <span className="ib-day">{new Date(m.at).toDateString() === new Date().toDateString() ? "Today" : new Date(m.at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</span>}
                  <div className={`ai-msg ${mine ? "is-user" : "is-assistant"}`}>
                    <span className="ai-avatar" aria-hidden="true">
                      {mine ? <UserRound size={14} /> : <span className="ib-av-txt">{initials(m.name)}</span>}
                    </span>
                    <div className="ai-bubble">
                      <div className="ai-text">
                        {!mine && <b className="ib-from">{m.name}</b>}
                        {m.text.split("\n").map((line, i) => (
                          <p key={i}>{line}</p>
                        ))}
                        <small className="ai-meta">{new Date(m.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</small>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            <div ref={end} />
          </ol>
        ) : (
          <div className="ib-start">
            <span className="ai-mark">
              <Inbox size={26} />
            </span>
            <b>Start the conversation with {c.title}</b>
            <small>Messages are saved on this computer and reach {c.kind === "agent" ? "their app" : "them"} once the cloud is connected.</small>
          </div>
        )}
      </div>
      <div className="ai-composer">
        <span className="ai-round ib-who" aria-hidden="true" title={c.title}>
          <Users size={18} />
        </span>
        <textarea
          ref={box}
          rows={1}
          value={text}
          maxLength={1000}
          placeholder={`Message ${c.title}`}
          aria-label={`Message ${c.title}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="ai-send" aria-label="Send" disabled={!text.trim()} onClick={submit}>
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
