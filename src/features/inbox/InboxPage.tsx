/**
 * Inbox (owner, 2026-11-26): messages between the Company Admin, the
 * branches (manager and the front desk on duty) and the PR agents. Full page
 * (no card around it): conversations on the left, the open chat on the right.
 *
 * Same chat rules as the mobile app:
 *  • Enter starts a new line; the Send button sends.
 *  • Emoji, attachments (photos, videos, documents) with a caption, and
 *    voice notes (record, pause, resume, delete or send).
 *  • Slide a message to the right to reply (or use Reply), and each message
 *    has options: Reply, Copy text, Download (files), Delete.
 *  • Photos open full size.
 *
 * Opened from the sidebar and the inbox icon in the header (with the unread
 * count). Routes: "/messages" (Company Admin), "/branch/<id>/messages".
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Building2, Copy, Download, FileText, Handshake, Image as ImageIcon, Inbox, MessagesSquare, Mic, MoreVertical, Paperclip, Pause, Play, Reply, Search, Send, ShieldCheck, Smile, Trash2, UserRound, X } from "lucide-react";
import { useApp } from "@/app/AppState";
import { branchRoute } from "@/app/router";
import { ACTIVE_BRANCHES, getBranch } from "@/data/company";
import { hospitalKey } from "@/data/legacy";
import { ASSISTANT_MANAGER_ROLE, isManager } from "@/data/userRecords";
import { deleteMessage, getFile, markRead, previewOf, sendMessage, threadOf, unreadIn, useFileUrl, useInboxStore, type ChatKind, type ChatMessage, type ChatThread, type Outgoing, type Party, type ReplyRef } from "@/services/inbox";
import { AnimatedPage } from "@/shared/motion";
import { initials } from "@/shared/format";
import { Popover } from "@/shared/ui/Popover";
import { useVoiceRecorder } from "./useVoiceRecorder";

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
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const fmtSize = (n?: number) => (!n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const MAX_FILE_MB = 25;

const EMOJI: { label: string; list: string[] }[] = [
  { label: "😀", list: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 😉 😍 🥰 😘 😋 😎 🤩 🥳 🤗 🤔 🤭 😐 😴 😌 😔 😢 😭 😤 😡 😱 😷 🤒 🤕 🥴 😇 🙏".split(" ") },
  { label: "👍", list: "👍 👎 👌 ✌️ 🤞 👏 🙌 👋 🤝 💪 🙏 👀 ✋ ☝️ 👉 👈 🫡 🤲".split(" ") },
  { label: "❤️", list: "❤️ 🧡 💛 💚 💙 💜 🤍 💯 ✅ ❌ ⭐ 🔥 🎉 🎊 ✨ 💡 ⏰ 📌".split(" ") },
  { label: "🩺", list: "🩺 💊 💉 🩸 🧪 🔬 🏥 🚑 🩻 🦴 🧠 🫀 🫁 👨🏾‍⚕️ 👩🏾‍⚕️ 📋 📄 🧾 📞 📍 🗓️".split(" ") },
];

/** Who this workspace talks to, newest conversation first. */
export function useConversations(): { me: Party; myName: string; list: Conversation[]; unread: number } {
  const { user, route, agents, staff } = useApp();
  const store = useInboxStore();
  const br = branchRoute(route);
  return useMemo(() => {
    const branchId = br?.branchId ?? null;
    const assistantParty = (id: string) => `assistant_manager:${id}`;
    const assistantsOf = (id: string) => staff.filter((s) => s.branchId === id && s.role === ASSISTANT_MANAGER_ROLE && s.status === "Active");
    const me: Party = !branchId ? "admin" : user.role === ASSISTANT_MANAGER_ROLE ? assistantParty(user.staffId ?? user.key) : user.kind === "staff" ? `fd:${branchId}` : `mgr:${branchId}`;
    const myName = user.name;
    const managerOf = (id: string) => staff.find((s) => s.branchId === id && isManager(s) && s.status === "Active")?.name ?? "Branch Manager";
    const raw: Omit<Conversation, "thread">[] = [];
    if (!branchId) {
      for (const b of ACTIVE_BRANCHES) {
        raw.push({ me, them: `fd:${b.id}`, kind: "frontdesk", title: `Front desk · ${b.name}`, subtitle: "Shared inbox, answered by whoever is on duty" });
        raw.push({ me, them: `mgr:${b.id}`, kind: "manager", title: managerOf(b.id), subtitle: `Branch Manager · ${b.name} branch` });
        for (const assistant of assistantsOf(b.id)) raw.push({ me, them: assistantParty(assistant.id), kind: "manager", title: assistant.name, subtitle: `Assistant Manager · ${b.name} branch` });
      }
    } else {
      const b = getBranch(branchId);
      raw.push({ me, them: "admin", kind: "admin", title: "Company Admin", subtitle: "Company administration" });
      if (user.role === ASSISTANT_MANAGER_ROLE) {
        raw.push({ me, them: `mgr:${branchId}`, kind: "manager", title: managerOf(branchId), subtitle: `Branch Manager · ${b?.name ?? ""} branch` });
        raw.push({ me, them: `fd:${branchId}`, kind: "frontdesk", title: `Front desk · ${b?.name ?? ""}`, subtitle: "Shared inbox, answered by whoever is on duty" });
      } else if (me.startsWith("mgr:")) {
        raw.push({ me, them: `fd:${branchId}`, kind: "frontdesk", title: `Front desk · ${b?.name ?? ""}`, subtitle: "Shared inbox, answered by whoever is on duty" });
        for (const assistant of assistantsOf(branchId)) raw.push({ me, them: assistantParty(assistant.id), kind: "manager", title: assistant.name, subtitle: `Assistant Manager · ${b?.name ?? ""} branch` });
      } else {
        raw.push({ me, them: `mgr:${branchId}`, kind: "manager", title: managerOf(branchId), subtitle: `Branch Manager · ${b?.name ?? ""} branch` });
        for (const assistant of assistantsOf(branchId)) raw.push({ me, them: assistantParty(assistant.id), kind: "manager", title: assistant.name, subtitle: `Assistant Manager · ${b?.name ?? ""} branch` });
      }
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
  }, [br?.branchId, user.kind, user.role, user.key, user.staffId, user.name, agents, staff, store]);
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
      <section className="ib-page">
        <aside className="ib-list">
          <header className="ib-list-head">
            <span className="ib-list-mark" aria-hidden="true">
              <MessagesSquare size={22} />
            </span>
            <span>
              <h1>Inbox</h1>
              <small>
                {user.role} · {unread ? `${unread} unread` : "all read"}
              </small>
            </span>
          </header>
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
              return (
                <li key={c.thread.id}>
                  <button type="button" className={`ib-item ${current?.thread.id === c.thread.id ? "is-on" : ""} ${n ? "has-unread" : ""}`} onClick={() => setOpenId(c.thread.id)}>
                    <Avatar c={c} />
                    <span className="ib-item-text">
                      <span className="ib-item-top">
                        <b>{c.title}</b>
                        {last && <small>{when(last.at)}</small>}
                      </span>
                      <span className="ib-item-sub">
                        <small>{last ? `${last.by === me ? "You: " : ""}${previewOf(last)}` : c.subtitle}</small>
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

        {current ? <ChatPane key={current.thread.id} c={current} me={me} myName={myName} /> : <div className="ib-chat ib-empty">No conversations yet.</div>}
      </section>
    </AnimatedPage>
  );
}

function Avatar({ c, lg }: { c: Conversation; lg?: boolean }) {
  const Icon = KIND_ICON[c.kind];
  return <span className={`ib-avatar is-${c.kind} ${lg ? "is-lg" : ""}`}>{c.kind === "frontdesk" || c.kind === "admin" ? <Icon size={lg ? 20 : 18} /> : initials(c.title)}</span>;
}

/* ─────────────── one conversation ─────────────── */

function ChatPane({ c, me, myName }: { c: Conversation; me: Party; myName: string }) {
  const { showToast } = useApp();
  const end = useRef<HTMLDivElement>(null);
  const [reply, setReply] = useState<ReplyRef | null>(null);
  const [viewer, setViewer] = useState<ChatMessage | null>(null);
  const [confirm, setConfirm] = useState<ChatMessage | null>(null);
  useEffect(() => {
    markRead(c.thread, me);
  }, [c.thread, me]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [c.thread.messages.length]);
  const refOf = (m: ChatMessage): ReplyRef => ({ id: m.id, by: m.by, name: m.by === me ? "You" : m.name, preview: previewOf(m).slice(0, 140), kind: m.kind ?? "text" });
  const download = async (m: ChatMessage) => {
    const b = await getFile(m.id);
    if (!b) return showToast("That file is no longer on this computer");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = m.fileName ?? (m.kind === "audio" ? "voice-note.webm" : m.kind === "image" ? "photo" : "file");
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  let lastDay = "";
  return (
    <div className="ib-chat">
      <header className="ib-chat-head">
        <Avatar c={c} lg />
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
      <div className="ib-scroll thin-scroll">
        {c.thread.messages.length ? (
          <ol className="ib-thread">
            {c.thread.messages.map((m) => {
              const day = new Date(m.at).toDateString();
              const sep = day !== lastDay;
              lastDay = day;
              return (
                <li key={m.id}>
                  {sep && <span className="ib-day">{day === new Date().toDateString() ? "Today" : new Date(m.at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</span>}
                  <Bubble m={m} mine={m.by === me} onReply={() => setReply(refOf(m))} onCopy={() => void navigator.clipboard?.writeText(m.text).then(() => showToast("Message copied"))} onDownload={() => void download(m)} onDelete={() => setConfirm(m)} onOpenImage={() => setViewer(m)} />
                </li>
              );
            })}
            <div ref={end} />
          </ol>
        ) : (
          <div className="ib-start">
            <span className="ib-list-mark">
              <Inbox size={26} />
            </span>
            <b>Start the conversation with {c.title}</b>
            <small>Messages are saved on this computer and reach {c.kind === "agent" ? "their app" : "them"} once the cloud is connected.</small>
          </div>
        )}
      </div>
      <Composer
        name={c.title}
        reply={reply}
        onCancelReply={() => setReply(null)}
        onError={showToast}
        onSend={async (out) => {
          await sendMessage(c.thread, me, myName, { ...out, replyTo: reply ?? undefined });
          setReply(null);
        }}
      />
      {viewer && <ImageViewer m={viewer} onClose={() => setViewer(null)} />}
      {confirm && (
        <ConfirmDelete
          onCancel={() => setConfirm(null)}
          onDelete={() => {
            deleteMessage(c.thread, confirm.id);
            setConfirm(null);
            showToast("Message deleted");
          }}
        />
      )}
    </div>
  );
}

/* ─────────────── a message ─────────────── */

function Bubble({ m, mine, onReply, onCopy, onDownload, onDelete, onOpenImage }: { m: ChatMessage; mine: boolean; onReply: () => void; onCopy: () => void; onDownload: () => void; onDelete: () => void; onOpenImage: () => void }) {
  const [dx, setDxState] = useState(0);
  const dxRef = useRef(0);
  const setDx = (v: number) => {
    dxRef.current = v;
    setDxState(v);
  };
  const [menu, setMenu] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const sliding = useRef(false);
  const kind = m.kind ?? "text";
  // Slide to the right to reply (mouse or touch), like the mobile app.
  const down = (e: RPointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, audio, video, a")) return;
    start.current = { x: e.clientX, y: e.clientY };
    sliding.current = false;
  };
  const move = (e: RPointerEvent) => {
    if (!start.current) return;
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    if (!sliding.current && x > 10 && Math.abs(x) > Math.abs(y) * 1.4) {
      sliding.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (sliding.current) setDx(Math.max(0, Math.min(90, x)));
  };
  const up = () => {
    if (sliding.current && dxRef.current > 56 && !m.deleted) onReply();
    start.current = null;
    sliding.current = false;
    setDx(0);
  };
  return (
    <div className={`ib-msg ${mine ? "is-mine" : "is-theirs"}`}>
      <span className="ib-swipe-icon" style={{ opacity: Math.min(1, dx / 56), transform: `translateY(-50%) scale(${0.6 + Math.min(0.4, dx / 140)})` }} aria-hidden="true">
        <Reply size={16} />
      </span>
      <div
        className={`ib-bubble ${kind !== "text" && !m.deleted ? `is-${kind}` : ""}`}
        style={{ transform: `translateX(${dx}px)`, transition: dx ? "none" : "transform 0.2s var(--ease)" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(true);
        }}
      >
        {!mine && <b className="ib-from">{m.name}</b>}
        {m.replyTo && !m.deleted && (
          <span className="ib-quote">
            <b>{m.replyTo.name}</b>
            <span>{m.replyTo.preview}</span>
          </span>
        )}
        {m.deleted ? <p className="ib-deleted">🚫 {mine ? "You deleted this message" : "This message was deleted"}</p> : <Body m={m} onOpenImage={onOpenImage} />}
        <small className="ib-time">{timeOf(m.at)}</small>
      </div>
      <span className="ib-acts">
        {!m.deleted && (
          <button type="button" aria-label="Reply" title="Reply" onClick={onReply}>
            <Reply size={15} />
          </button>
        )}
        <button ref={more} type="button" aria-label="Message options" title="Options" onClick={() => setMenu((o) => !o)}>
          <MoreVertical size={15} />
        </button>
      </span>
      <Popover anchor={more} open={menu} onClose={() => setMenu(false)} placement={mine ? "bottom-end" : "bottom-start"} width={200} role="menu" label="Message options">
        {!m.deleted && (
          <button type="button" className="menu-item" role="menuitem" onClick={() => (setMenu(false), onReply())}>
            <span className="mi-icon">
              <Reply size={15} />
            </span>
            <span className="mi-text">Reply</span>
          </button>
        )}
        {!m.deleted && m.text && (
          <button type="button" className="menu-item" role="menuitem" onClick={() => (setMenu(false), onCopy())}>
            <span className="mi-icon">
              <Copy size={15} />
            </span>
            <span className="mi-text">Copy text</span>
          </button>
        )}
        {!m.deleted && kind !== "text" && (
          <button type="button" className="menu-item" role="menuitem" onClick={() => (setMenu(false), onDownload())}>
            <span className="mi-icon">
              <Download size={15} />
            </span>
            <span className="mi-text">Download</span>
          </button>
        )}
        <button type="button" className="menu-item is-danger" role="menuitem" onClick={() => (setMenu(false), onDelete())}>
          <span className="mi-icon">
            <Trash2 size={15} />
          </span>
          <span className="mi-text">Delete</span>
        </button>
      </Popover>
    </div>
  );
}

function Body({ m, onOpenImage }: { m: ChatMessage; onOpenImage: () => void }) {
  const kind = m.kind ?? "text";
  const url = useFileUrl(m.id, kind !== "text");
  const caption = m.text ? (
    <p className="ib-text">
      {m.text.split("\n").map((l, i) => (
        <span key={i}>
          {l}
          <br />
        </span>
      ))}
    </p>
  ) : null;
  if (kind === "image")
    return (
      <>
        <button type="button" className="ib-photo" onClick={onOpenImage}>
          {url ? <img src={url} alt="" /> : <span className="ib-photo-wait" />}
        </button>
        {caption}
      </>
    );
  if (kind === "video")
    return (
      <>
        {url ? <video src={url} controls preload="metadata" className="ib-video" /> : <span className="ib-photo-wait" />}
        {caption}
      </>
    );
  if (kind === "file")
    return (
      <>
        <span className="ib-file">
          <span className="ib-file-icon">
            <FileText size={20} />
          </span>
          <span>
            <b>{m.fileName}</b>
            <small>{fmtSize(m.size)}</small>
          </span>
        </span>
        {caption}
      </>
    );
  if (kind === "audio") return url ? <VoicePlayer url={url} seed={m.id} duration={m.duration ?? 0} /> : <span className="ib-photo-wait is-audio" />;
  return caption;
}

const bars = (seed: string, n = 36) => {
  let h = [...seed].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7);
  return Array.from({ length: n }, () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 0.25 + ((h >>> 8) % 100) / 133;
  });
};

/** Voice-note player: play/pause, waveform progress (click to jump), time and speed. */
function VoicePlayer({ url, seed, duration }: { url: string; seed: string; duration: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [rate, setRate] = useState(1);
  const wave = useMemo(() => bars(seed), [seed]);
  const total = duration || audio.current?.duration || 0;
  const progress = total ? Math.min(1, t / total) : 0;
  return (
    <span className="ib-voice">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          setT(0);
        }}
      />
      <button
        type="button"
        className="ib-voice-play"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        onClick={() => {
          const a = audio.current!;
          if (playing) a.pause();
          else void a.play();
          setPlaying(!playing);
        }}
      >
        {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
      </button>
      <span className="ib-voice-main">
        <span
          className="ib-wave"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            if (audio.current && total) audio.current.currentTime = ((e.clientX - r.left) / r.width) * total;
          }}
        >
          {wave.map((h, i) => (
            <i key={i} className={i / wave.length <= progress ? "is-on" : ""} style={{ height: `${Math.round(h * 24)}px` }} />
          ))}
        </span>
        <small>{fmtDur(playing || t ? t : total)}</small>
      </span>
      <button
        type="button"
        className="ib-voice-rate"
        aria-label="Playback speed"
        onClick={() => {
          const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
          setRate(next);
          if (audio.current) audio.current.playbackRate = next;
        }}
      >
        {rate}×
      </button>
    </span>
  );
}

/* ─────────────── typing bar ─────────────── */

function Composer({ name, reply, onCancelReply, onSend, onError }: { name: string; reply: ReplyRef | null; onCancelReply: () => void; onSend: (o: Omit<Outgoing, "replyTo">) => Promise<void>; onError: (t: string) => void }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [emoji, setEmoji] = useState(false);
  const [tab, setTab] = useState(0);
  const [attach, setAttach] = useState(false);
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const emojiBtn = useRef<HTMLButtonElement>(null);
  const attachBtn = useRef<HTMLButtonElement>(null);
  const media = useRef<HTMLInputElement>(null);
  const docs = useRef<HTMLInputElement>(null);
  const rec = useVoiceRecorder();
  // The box grows with the text (Enter makes a new line).
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    b.style.height = "auto";
    b.style.height = `${Math.min(160, b.scrollHeight)}px`;
  }, [text]);
  useEffect(() => {
    if (reply) box.current?.focus();
  }, [reply]);
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok = [...list].filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    if (ok.length < list.length) onError(`Files over ${MAX_FILE_MB} MB can't be sent.`);
    setFiles((f) => [...f, ...ok].slice(0, 10));
    setAttach(false);
  };
  const insert = (e: string) => {
    const b = box.current;
    const at = b ? b.selectionStart : text.length;
    setText((t) => t.slice(0, at) + e + t.slice(at));
    window.requestAnimationFrame(() => {
      b?.focus();
      b?.setSelectionRange(at + e.length, at + e.length);
    });
  };
  const send = async () => {
    if (sending || (!text.trim() && !files.length)) return;
    setSending(true);
    try {
      if (files.length) {
        for (const [i, f] of files.entries()) {
          const kind = f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "file";
          await onSend({ kind, text: i === files.length - 1 ? text.trim() : "", blob: f, fileName: f.name, mime: f.type, size: f.size });
        }
      } else await onSend({ kind: "text", text: text.trim() });
      setText("");
      setFiles([]);
    } catch {
      onError("The message could not be saved. Try again.");
    } finally {
      setSending(false);
    }
  };
  const sendVoice = async () => {
    const r = await rec.finish();
    if (r) await onSend({ kind: "audio", text: "", blob: r.blob, mime: r.blob.type, size: r.blob.size, duration: r.duration });
  };

  return (
    <div className="ib-composer">
      {reply && (
        <div className="ib-replying">
          <Reply size={16} />
          <span>
            <b>Replying to {reply.name}</b>
            <small>{reply.preview}</small>
          </span>
          <button type="button" aria-label="Cancel reply" onClick={onCancelReply}>
            <X size={16} />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <div className="ib-files">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="ib-chip">
              {f.type.startsWith("image/") ? <ImageIcon size={15} /> : <FileText size={15} />}
              <span>
                <b>{f.name}</b>
                <small>{fmtSize(f.size)}</small>
              </span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      {rec.state !== "idle" ? (
        <div className="ib-recbar">
          <button type="button" className="ib-round is-danger" aria-label="Delete the recording" onClick={rec.cancel}>
            <Trash2 size={18} />
          </button>
          <span className={`ib-rec-dot ${rec.state === "recording" ? "is-on" : ""}`} />
          <b className="ib-rec-time">{fmtDur(rec.seconds)}</b>
          <span className="ib-rec-wave" aria-hidden="true">
            {rec.levels.map((l, i) => (
              <i key={i} style={{ height: `${4 + Math.round(l * 26)}px` }} />
            ))}
          </span>
          <button type="button" className="ib-round" aria-label={rec.state === "recording" ? "Pause" : "Resume"} onClick={rec.state === "recording" ? rec.pause : rec.resume}>
            {rec.state === "recording" ? <Pause size={18} /> : <Mic size={18} />}
          </button>
          <button type="button" className="ib-send" aria-label="Send the voice note" onClick={() => void sendVoice()}>
            <Send size={19} />
          </button>
        </div>
      ) : (
        <div className="ib-bar">
          <button ref={emojiBtn} type="button" className="ib-round" aria-label="Emoji" aria-expanded={emoji} onClick={() => setEmoji((o) => !o)}>
            <Smile size={20} />
          </button>
          <button ref={attachBtn} type="button" className="ib-round" aria-label="Attach" aria-expanded={attach} onClick={() => setAttach((o) => !o)}>
            <Paperclip size={19} />
          </button>
          <textarea ref={box} rows={1} value={text} maxLength={2000} placeholder={`Message ${name}`} aria-label={`Message ${name}`} onChange={(e) => setText(e.target.value)} />
          {text.trim() || files.length ? (
            <button type="button" className="ib-send" aria-label="Send" disabled={sending} onClick={() => void send()}>
              <Send size={19} />
            </button>
          ) : (
            <button type="button" className="ib-send" aria-label="Record a voice note" title="Record a voice note" onClick={() => rec.start().catch((e: Error) => onError(e.message))}>
              <Mic size={20} />
            </button>
          )}
        </div>
      )}
      <p className="ib-hint">Enter starts a new line. Use the send button to send.</p>

      <Popover anchor={emojiBtn} open={emoji} onClose={() => setEmoji(false)} placement="top-end" width={330} label="Emoji">
        <div className="ib-emoji">
          <div className="ib-emoji-tabs">
            {EMOJI.map((g, i) => (
              <button key={g.label} type="button" className={tab === i ? "is-on" : ""} onClick={() => setTab(i)}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="ib-emoji-grid">
            {EMOJI[tab]!.list.map((e) => (
              <button key={e} type="button" onClick={() => insert(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>
      </Popover>
      <Popover anchor={attachBtn} open={attach} onClose={() => setAttach(false)} placement="top-end" width={230} role="menu" label="Attach">
        <button type="button" className="menu-item" role="menuitem" onClick={() => media.current?.click()}>
          <span className="mi-icon">
            <ImageIcon size={15} />
          </span>
          <span className="mi-text">
            Photos and videos<small>From this computer</small>
          </span>
        </button>
        <button type="button" className="menu-item" role="menuitem" onClick={() => docs.current?.click()}>
          <span className="mi-icon">
            <FileText size={15} />
          </span>
          <span className="mi-text">
            Document<small>PDF, Word, Excel, text</small>
          </span>
        </button>
      </Popover>
      <input ref={media} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
      <input ref={docs} type="file" accept="application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
    </div>
  );
}

/* ─────────────── photo viewer and delete ─────────────── */

function ImageViewer({ m, onClose }: { m: ChatMessage; onClose: () => void }) {
  const url = useFileUrl(m.id, true);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="modal-layer ib-viewer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <button type="button" className="ib-viewer-close" aria-label="Close" onClick={onClose}>
        <X size={22} />
      </button>
      {url && <img src={url} alt="" />}
      {m.text && <p>{m.text}</p>}
    </div>,
    document.body,
  );
}

function ConfirmDelete({ onCancel, onDelete }: { onCancel: () => void; onDelete: () => void }) {
  return createPortal(
    <div className="modal-layer" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal ib-confirm" role="alertdialog" aria-label="Delete this message?">
        <div className="modal-head">
          <div className="modal-titles">
            <h2>Delete this message?</h2>
            <p>It shows as “This message was deleted” in the conversation.</p>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="bl-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="bl-btn is-danger" onClick={onDelete}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
