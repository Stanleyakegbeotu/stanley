/**
 * Branch Billing — one connected transaction across five steps:
 * Patient → Services → Payment → Preview → Receipt.
 *
 *  • Start: "Enter Referral ID" (finds the referred patient and jumps ahead)
 *    or "Start New Patient Billing" (step 1).
 *  • Patient ID is reserved when leaving step 1 (BRANCH-TYPE-NUMBER) and only
 *    becomes a patient record when the bill is saved.
 *  • Auto-saves a draft as you work; leaving asks Save draft / Discard / Stay.
 *  • Completing validates everything, checks for same-day duplicates, saves
 *    the order, removes the draft, then shows the receipt (never before).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Copy, CreditCard, FilePlus2, FileStack, FlaskConical, Hash, Link2, Search, Trash2, TriangleAlert, UserRound, type LucideIcon } from "lucide-react";
import { MoveToTrashDialog } from "@/features/admin/AdminLogs";
import { useApp } from "@/app/AppState";
import { setNavigationGuard } from "@/app/navGuard";
import type { Branch } from "@/data/types";
import { formatMoney, formatRelative, initials } from "@/shared/format";
import { AnimatedPage } from "@/shared/motion";
import { Button } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { DockedBar } from "@/shared/ui/DockedBar";
import { FieldError, focusFirstError } from "@/shared/ui/FieldError";
import { useNetworkStatus } from "@/shared/useNetworkStatus";
import { PageHero } from "@/features/shared/PageHero";
import {

  branchPrefix,
  computeBill,
  draftsForPatient,
  duplicateWarnings,
  hasContent,
  lookupReferral,
  newSession,
  patientSourceType,
  releasePatientId,
  reservePatientId,
  saveDraft,
  submitBilling,
  useBilling,
  validateStep,
  type BillingSession,
  type Order,
} from "@/services/billing";
import { PatientStep, PaymentStep, PreviewStep, ServicesStep } from "./BillingSteps";
import { ReceiptStep } from "./BillingReceipt";

const STEPS = ["Patient", "Services", "Payment", "Preview", "Receipt"] as const;
const EDIT_TITLE: Record<1 | 2 | 3, string> = { 1: "Patient details", 2: "Services", 3: "Payment" };
const EDIT_ICON: Record<1 | 2 | 3, LucideIcon> = { 1: UserRound, 2: FlaskConical, 3: CreditCard };
const NEXT_LABEL = ["Continue to services", "Continue to payment", "Continue to preview", "Complete billing & view receipt"];

export function BillingWorkspace({ branch }: { branch: Branch }) {
  const { user, agents, route, navigate, showToast, moveDraftToTrash } = useApp();
  const store = useBilling();
  const [session, setSession] = useState<BillingSession | null>(null);
  const me = { name: user.name, role: user.role };
  /** "Start new" was pressed while drafts exist — offer them first. */
  const [draftPrompt, setDraftPrompt] = useState(false);
  /** Same-patient drafts the user chose to ignore for this bill. */
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  /** Errors that don't belong to one field (e.g. the save failed). */
  const [errors, setErrors] = useState<string[]>([]);
  /** Field errors from a blocked Continue — shown on the fields themselves. */
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [dupes, setDupes] = useState<Order[] | null>(null);
  const latest = useRef<BillingSession | null>(null);
  const skipSave = useRef(false);
  const guardOff = useRef<(() => void) | null>(null);
  latest.current = session;
  const money = (n: number) => formatMoney(n, branch.currency);
  const drafts = store.drafts.filter((d) => d.branchId === branch.id);

  /* Resume a draft from the Drafts page (?draft=id). */
  const draftParam = route.query.get("draft");
  useEffect(() => {
    if (!draftParam) return;
    const d = store.drafts.find((x) => x.id === draftParam && x.branchId === branch.id);
    // Keep whatever was being worked on before switching to the resumed draft.
    const cur = latest.current;
    if (cur && cur.id !== draftParam && cur.step < 5 && hasContent(cur)) saveDraft(cur);
    if (!d) {
      setSession(null);
      setNotice(null);
      showToast("That draft is no longer available — it was completed or moved to Trash");
      navigate(`/branch/${branch.id}/billing`);
      return;
    }
    if (d) {
      setDismissed([]);
      setSession(d);
      setLastSaved(d.lastSaved);
      setOrder(null);
      setErrors([]);
      setNotice(`Draft resumed — saved ${d.lastSaved ? formatRelative(new Date(d.lastSaved)) : "earlier"}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftParam]);

  /* Auto-save while working (debounced). */
  useEffect(() => {
    if (!session || session.step === 5 || !hasContent(session)) return;
    setPending(true);
    const id = window.setTimeout(() => {
      const saved = saveDraft(session);
      setLastSaved(saved.lastSaved);
      setPending(false);
    }, 900);
    return () => window.clearTimeout(id);
  }, [session]);

  /* Save on leaving the page any other way (e.g. browser back). */
  useEffect(
    () => () => {
      const s = latest.current;
      if (s && !skipSave.current && s.step < 5 && hasContent(s)) saveDraft(s);
    },
    [],
  );

  /* Ask before in-app navigation away from an unfinished bill. */
  useEffect(() => {
    guardOff.current?.();
    guardOff.current = null;
    if (session && session.step < 5 && hasContent(session)) {
      guardOff.current = setNavigationGuard((to) => {
        if (to.startsWith(`/branch/${branch.id}/billing`)) return true;
        setLeaveTo(to);
        return false;
      });
    }
    return () => {
      guardOff.current?.();
      guardOff.current = null;
    };
  }, [session, branch.id]);

  const set = (fn: (s: BillingSession) => BillingSession) => {
    setErrors([]);
    setSession((prev) => (prev ? fn(prev) : prev));
  };

  /* Once errors are showing, update them live: a fixed field clears, a still-wrong one keeps its message. */
  useEffect(() => {
    if (!session || session.step > 3 || !Object.keys(fieldErrs).length) return;
    const now = validateStep(session, session.step as 1 | 2 | 3, agents).fields;
    const kept: Record<string, string> = {};
    for (const k of Object.keys(fieldErrs)) if (now[k]) kept[k] = now[k];
    if (Object.keys(kept).length !== Object.keys(fieldErrs).length || Object.keys(kept).some((k) => kept[k] !== fieldErrs[k])) setFieldErrs(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  const start = (s: BillingSession) => {
    skipSave.current = false;
    setDraftPrompt(false);
    setDismissed([]);
    setOrder(null);
    setErrors([]);
    setFieldErrs({});
    setNotice(null);
    setLastSaved(null);
    setSession(s);
  };
  const reset = () => {
    setSession(null);
    setOrder(null);
    setErrors([]);
    setFieldErrs({});
    setNotice(null);
    setLastSaved(null);
    if (draftParam) navigate(`/branch/${branch.id}/billing`);
  };

  /** Reserve (or re-reserve after a type change) the Patient ID before leaving step 1. */
  const ensureReservation = (s: BillingSession): BillingSession => {
    if (s.patient.uuid) {
      if (s.reservedId) releasePatientId(s.reservedId);
      return { ...s, reservedId: null, reservedType: null };
    }
    const type = patientSourceType(s);
    if (s.reservedId && s.reservedType === type) return s;
    if (s.reservedId) releasePatientId(s.reservedId);
    return { ...s, reservedId: reservePatientId(s.branchId, type, s.id), reservedType: type };
  };

  const goTo = (step: 1 | 2 | 3 | 4) => {
    setFieldErrs({});
    setSession((s) => (s ? { ...s, step } : s));
  };
  /** Show the errors on their fields and bring the first one into view. */
  const showFieldErrors = (fields: Record<string, string>) => {
    setFieldErrs(fields);
    focusFirstError();
  };
  const next = () => {
    if (!session) return;
    if (session.step <= 3) {
      const c = validateStep(session, session.step as 1 | 2 | 3, agents);
      if (!c.ok) {
        showFieldErrors(c.fields);
        return;
      }
      let s = session;
      if (s.step === 1) s = ensureReservation(s);
      setErrors([]);
      setFieldErrs({});
      setNotice(null);
      setSession({ ...s, step: (s.step + 1) as BillingSession["step"] });
      document.getElementById("main")?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (session.step === 4) complete();
  };

  const complete = (confirmed = session?.differentPatientConfirmed ?? false) => {
    if (!session) return;
    // Anything still missing? Go back to that step and show it on the field.
    for (const step of [1, 2, 3] as const) {
      const c = validateStep(session, step, agents);
      if (!c.ok) {
        setSession({ ...session, step });
        showFieldErrors(c.fields);
        return;
      }
    }
    const s = { ...session, differentPatientConfirmed: confirmed };
    if (!confirmed) {
      const d = duplicateWarnings(s);
      if (d.length) {
        setDupes(d);
        return;
      }
    }
    const r = submitBilling(s, agents, user);
    if (!r.ok) {
      setErrors([r.error]);
      return;
    }
    skipSave.current = true;
    guardOff.current?.();
    setOrder(r.order);
    setSession({ ...s, step: 5 });
    setDupes(null);
    showToast(`${r.order.invoiceNo} saved`);
  };

  /* ── Edit an earlier step from the preview, in a pop-up (the user stays on step 4) ── */
  const [editing, setEditing] = useState<1 | 2 | 3 | null>(null);
  const [editDraft, setEditDraft] = useState<BillingSession | null>(null);
  const [editErrs, setEditErrs] = useState<Record<string, string>>({});
  const openEdit = (step: 1 | 2 | 3, from: BillingSession | null = session, errs: Record<string, string> = {}) => {
    if (!from) return;
    setEditDraft({ ...from });
    setEditErrs(errs);
    setEditing(step);
    if (Object.keys(errs).length) focusFirstError();
  };
  const closeEdit = () => {
    setEditing(null);
    setEditDraft(null);
    setEditErrs({});
  };
  const setEdit = (fn: (s: BillingSession) => BillingSession) => setEditDraft((d) => (d ? fn(d) : d));
  /* Errors inside the pop-up update live, like on the page. */
  useEffect(() => {
    if (!editDraft || !editing || !Object.keys(editErrs).length) return;
    const now = validateStep(editDraft, editing, agents).fields;
    const kept: Record<string, string> = {};
    for (const k of Object.keys(editErrs)) if (now[k]) kept[k] = now[k];
    if (Object.keys(kept).length !== Object.keys(editErrs).length || Object.keys(kept).some((k) => kept[k] !== editErrs[k])) setEditErrs(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDraft]);
  const applyEdit = () => {
    if (!editDraft || !editing) return;
    const c = validateStep(editDraft, editing, agents);
    if (!c.ok) {
      setEditErrs(c.fields);
      focusFirstError();
      return;
    }
    // A walk-in/referred change re-reserves the right Patient ID type.
    const next: BillingSession = { ...(editing === 1 ? ensureReservation(editDraft) : editDraft), step: 4 };
    setSession(next);
    // Did this change make another step invalid (e.g. fewer tests → part payment now too big)? Open that one.
    for (const st of [1, 2, 3] as const) {
      if (st === editing) continue;
      const v = validateStep(next, st, agents);
      if (!v.ok) {
        showToast(`${EDIT_TITLE[editing]} updated — please check ${EDIT_TITLE[st].toLowerCase()} too`);
        openEdit(st, next, v.fields);
        return;
      }
    }
    closeEdit();
    showToast(`${EDIT_TITLE[editing]} updated`);
  };

  const t = session ? computeBill(session) : null;
  const shownId = session ? (session.patient.existingId ?? session.reservedId) : null;

  return (
    <AnimatedPage>
      <PageHero
        eyebrow={`Branch operations · ${branch.name} · Billing`}
        title="Billing & collections"
        period={false}
        actions={
          <span className="bl-proc">
            <span className="bl-avatar is-solid">{initials(user.name)}</span>
            <span>
              <small>Processing this bill</small>
              <b>{user.name}</b>
              <em>{user.role}</em>
            </span>
          </span>
        }
      />

      {!session ? (
        <Landing branch={branch} drafts={drafts} onNew={() => (drafts.length ? setDraftPrompt(true) : start(newSession(branch.id, "new", me)))} onReferral={() => setRefOpen(true)} onResume={(d) => start(d)} />
      ) : (
        <>
          <nav className="bl-stepper" aria-label="Billing steps">
            <ol>
              {STEPS.map((label, i) => {
                const n = (i + 1) as BillingSession["step"];
                const done = n < session.step;
                const current = n === session.step;
                const canClick = session.step < 5 && n < session.step;
                return (
                  <li key={label} className={`${done ? "is-done" : ""} ${current ? "is-current" : ""}`}>
                    <button type="button" disabled={!canClick} onClick={() => canClick && goTo(n as 1 | 2 | 3 | 4)} aria-current={current ? "step" : undefined}>
                      <i>{done ? "✓" : n}</i>
                      <span>{label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {session.step < 5 && (
              <span className={`bl-autosave ${lastSaved ? "is-saved" : ""}`}>
                <i aria-hidden="true" />
                <span>
                  <b>{pending ? "Saving billing progress…" : lastSaved ? "Billing progress saved" : "Autosave is ready"}</b>
                  <small>{lastSaved ? `Last saved ${new Date(lastSaved).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Saves as a draft once details are entered"}</small>
                </span>
              </span>
            )}
          </nav>

          {shownId && session.step < 5 && (
            <div className="bl-idstrip">
              <span className="bl-idstrip-icon">
                <Hash size={16} />
              </span>
              <span>
                <small>Patient ID</small>
                <b className="mono">{shownId}</b>
              </span>
              <em className="bl-pill">{session.patient.existingId ? "Existing patient" : "Reserved for this billing"}</em>
              <button
                type="button"
                className="bl-btn is-sm"
                onClick={() => {
                  navigator.clipboard?.writeText(shownId).catch(() => {});
                  showToast(`Copied ${shownId}`);
                }}
              >
                <Copy size={14} /> Copy
              </button>
            </div>
          )}

          {notice && session.step < 5 && (
            <p className="bl-notice">
              <Link2 size={15} /> {notice}
            </p>
          )}

          {session.step < 5 && (
            <SamePatientDrafts
              drafts={draftsForPatient(branch.id, session.patient, session.id).filter((d) => !dismissed.includes(d.id))}
              money={money}
              onResume={(d) => {
                // This new bill duplicates an unfinished one for the same patient: keep it in Trash (recoverable) and continue the earlier draft.
                if (hasContent(session)) {
                  saveDraft(session);
                  moveDraftToTrash(session.id, `Duplicate — continued the earlier draft for ${d.patient.name.trim() || "this patient"}`);
                }
                start(d);
                setLastSaved(d.lastSaved);
                setNotice(`Draft resumed — saved ${d.lastSaved ? formatRelative(new Date(d.lastSaved)) : "earlier"}. The bill you had just started is in Trash if you need it.`);
              }}
              onDismiss={(id) => setDismissed((x) => [...x, id])}
            />
          )}

          {session.step === 1 && <PatientStep s={session} set={set} branch={branch} errors={fieldErrs} />}
          {session.step === 2 && <ServicesStep s={session} set={set} branch={branch} errors={fieldErrs} />}
          {session.step === 3 && <PaymentStep s={session} set={set} branch={branch} errors={fieldErrs} />}
          {session.step === 4 && <PreviewStep s={session} set={set} branch={branch} onEdit={(st) => openEdit(st)} />}
          {session.step === 5 && order && (
            <ReceiptStep
              order={order}
              branch={branch}
              onNew={() => start(newSession(branch.id, "new", me))}
              onDone={() => {
                reset();
              }}
            />
          )}

          {errors.length > 0 && (
            <div className="bl-errors" role="alert">
              <TriangleAlert size={17} />
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {session.step < 5 && (
            <DockedBar>
            <footer className="bl-foot">
              {session.step > 1 && (
                <button type="button" className="bl-btn" onClick={() => goTo((session.step - 1) as 1 | 2 | 3)}>
                  <ArrowLeft size={16} /> Back
                </button>
              )}
              <button
                type="button"
                className="bl-btn"
                disabled={!hasContent(session)}
                onClick={() => {
                  const saved = saveDraft(session);
                  setLastSaved(saved.lastSaved);
                  showToast("Saved to Drafts");
                }}
              >
                Save as Draft
              </button>
              <button type="button" className="bl-btn is-danger" onClick={() => (hasContent(session) ? setConfirmCancel(true) : reset())}>
                Cancel Billing
              </button>
              <span className="bl-foot-total">
                {t && session.step >= 2 && (
                  <>
                    <small>{session.step >= 3 ? "Total payable" : "Subtotal"}</small>
                    <b>{money(session.step >= 3 ? t.total : t.subtotal)}</b>
                  </>
                )}
              </span>
              <button type="button" className="bl-btn is-primary is-lg" onClick={next}>
                {NEXT_LABEL[session.step - 1]} <ArrowRight size={17} />
              </button>
            </footer>
            </DockedBar>
          )}
        </>
      )}

      {/* Referral ID */}
      {refOpen && (
        <ReferralDialog
          branch={branch}
          onClose={() => setRefOpen(false)}
          onFound={(m, referralId) => {
            const s = newSession(branch.id, "referral", me);
            const ready = m.services.length > 0;
            start({
              ...s,
              step: ready ? 3 : 2,
              patient: { uuid: m.patient.uuid, existingId: m.patient.patientId, existingType: m.patient.type, name: m.patient.name, phone: m.patient.phone },
              walkIn: false,
              agentId: m.agentId,
              hospital: m.hospital,
              referralId,
              services: m.services,
            });
            setNotice(ready ? `Referral ${referralId} found — patient, PR agent and requested tests are filled in. Record the payment.` : `Referral ${referralId} found — ${m.patient.name} and their PR agent are filled in. Add the tests for this visit.`);
            setRefOpen(false);
          }}
        />
      )}

      {/* Edit an earlier step from the preview — same forms, in a pop-up */}
      <Modal
        open={!!editing && !!editDraft}
        onClose={closeEdit}
        xl
        icon={editing ? EDIT_ICON[editing] : undefined}
        title={editing ? `Edit ${EDIT_TITLE[editing].toLowerCase()}` : ""}
        description="Make your changes, then select Update — the preview refreshes and you stay on the preview step."
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit}>
              Cancel
            </Button>
            <Button onClick={applyEdit}>Update {editing ? EDIT_TITLE[editing].toLowerCase() : ""}</Button>
          </>
        }
      >
        {editing && editDraft && (
          <div className="bl-edit-pop">
            {editing === 1 && <PatientStep s={editDraft} set={setEdit} branch={branch} errors={editErrs} />}
            {editing === 2 && <ServicesStep s={editDraft} set={setEdit} branch={branch} errors={editErrs} />}
            {editing === 3 && <PaymentStep s={editDraft} set={setEdit} branch={branch} errors={editErrs} />}
          </div>
        )}
      </Modal>

      {/* Leave with an unfinished bill */}
      <Modal
        open={!!leaveTo}
        onClose={() => setLeaveTo(null)}
        title="Leave this bill?"
        description="This bill is not complete. Keep it as a draft to finish later, or discard it (it goes to Trash for 30 days)."
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaveTo(null)}>
              Stay here
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const to = leaveTo!;
                if (session && hasContent(session)) {
                  saveDraft(session);
                  moveDraftToTrash(session.id, "Discarded when leaving billing");
                } else if (session?.reservedId) releasePatientId(session.reservedId);
                skipSave.current = true;
                guardOff.current?.();
                setLeaveTo(null);
                navigate(to);
              }}
            >
              Discard
            </Button>
            <Button
              onClick={() => {
                const to = leaveTo!;
                if (session) saveDraft(session);
                skipSave.current = true;
                guardOff.current?.();
                setLeaveTo(null);
                navigate(to);
              }}
            >
              Save draft &amp; leave
            </Button>
          </>
        }
      >
        <p className="bl-modal-text">Drafts keep the patient, reserved Patient ID, services, prices and payment details. Find them under Drafts.</p>
      </Modal>

      {/* "Start new" while unfinished bills exist: offer them first */}
      <Modal
        open={draftPrompt}
        onClose={() => setDraftPrompt(false)}
        icon={FileStack}
        title={`${drafts.length} unfinished bill${drafts.length === 1 ? " is" : "s are"} waiting`}
        description="If this patient already has a bill in progress, continue it instead of starting again — the details, tests and payment are kept."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraftPrompt(false)}>
              Back
            </Button>
            <Button onClick={() => start(newSession(branch.id, "new", me))}>
              <FilePlus2 size={16} /> Start a new bill
            </Button>
          </>
        }
      >
        <ul className="bl-drafts is-prompt">
          {drafts.slice(0, 6).map((d) => (
            <DraftRow key={d.id} d={d} money={money} onResume={() => start(d)} />
          ))}
        </ul>
        {drafts.length > 6 && <p className="bl-help">+ {drafts.length - 6} more on the Drafts page.</p>}
      </Modal>

      {/* Cancel billing */}
      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this bill?"
        description="The bill is moved to Trash — restore it from there within 30 days if this was a mistake. The reserved Patient ID is released."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              Keep billing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (session) {
                  saveDraft(session);
                  moveDraftToTrash(session.id, "Bill cancelled");
                }
                skipSave.current = true;
                setConfirmCancel(false);
                reset();
                showToast("Bill cancelled — moved to Trash");
              }}
            >
              Cancel bill
            </Button>
          </>
        }
      >
        <p className="bl-modal-text">To finish it later instead, choose Keep billing, then Save as Draft.</p>
      </Modal>

      {/* Possible duplicate */}
      <Modal
        open={!!dupes}
        onClose={() => setDupes(null)}
        icon={TriangleAlert}
        title="Possible duplicate patient"
        description="A bill was already created today for a patient with the same name or phone. Check before saving."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDupes(null);
                goTo(1);
              }}
            >
              Go back and check
            </Button>
            <Button onClick={() => complete(true)}>It's a different patient — save</Button>
          </>
        }
      >
        <ul className="bl-dupes">
          {dupes?.map((o) => (
            <li key={o.uuid}>
              <span className="bl-avatar">{initials(o.patient.name)}</span>
              <span>
                <b>{o.patient.name}</b>
                <small>
                  {o.patient.patientId} · {o.invoiceNo} · {new Date(o.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  {o.patient.phone ? ` · ${o.patient.phone}` : ""}
                </small>
              </span>
              <button
                type="button"
                className="bl-btn is-sm"
                onClick={() => {
                  const p = store.patients.find((x) => x.uuid === o.patient.uuid);
                  if (!p) return;
                  set((x) => ({ ...x, patient: { uuid: p.uuid, existingId: p.patientId, existingType: p.type, name: p.name, phone: x.patient.phone || p.phone } }));
                  if (session?.reservedId) releasePatientId(session.reservedId);
                  setSession((x) => (x ? { ...x, reservedId: null, reservedType: null } : x));
                  setDupes(null);
                }}
              >
                Use this patient
              </button>
            </li>
          ))}
        </ul>
        <p className="bl-modal-text">Patients are never merged automatically.</p>
      </Modal>
    </AnimatedPage>
  );
}

/* ─────────────── Start screen ─────────────── */

function Landing({ branch, drafts, onNew, onReferral, onResume }: { branch: Branch; drafts: BillingSession[]; onNew: () => void; onReferral: () => void; onResume: (d: BillingSession) => void }) {
  const money = (n: number) => formatMoney(n, branch.currency);
  return (
    <>
      {drafts.length > 0 && (
        <div className="bl-draft-alert" role="status">
          <span className="bl-draft-alert-icon" aria-hidden="true">
            <FileStack size={20} />
          </span>
          <span className="bl-draft-alert-text">
            <b>
              {drafts.length} unfinished bill{drafts.length === 1 ? "" : "s"} saved as draft{drafts.length === 1 ? "" : "s"}
            </b>
            <small>
              Latest: {drafts[0].patient.name.trim() || "Unnamed patient"} · step {drafts[0].step} of 5 · {drafts[0].lastSaved ? `saved ${formatRelative(new Date(drafts[0].lastSaved))}` : ""}. If the patient is back, continue their draft instead of starting again.
            </small>
          </span>
          <button type="button" className="bl-btn is-primary" onClick={() => onResume(drafts[0])}>
            Continue latest <ArrowRight size={15} />
          </button>
        </div>
      )}
      <section className="bl-card bl-start">
        <span className="bl-pill">New billing session</span>
        <h2>Start patient billing</h2>
        <p>Choose how you would like to begin.</p>
        <div className="bl-start-grid">
          <button type="button" className="bl-start-card" onClick={onReferral}>
            <Link2 className="cat-mark" size={96} strokeWidth={1.3} aria-hidden="true" />
            <span className="bl-start-icon">
              <Link2 size={24} />
            </span>
            <b>Enter Referral ID</b>
            <small>Find a referred patient and continue their billing — skips the steps already done.</small>
            <em>
              Verify referral <ArrowRight size={15} />
            </em>
          </button>
          <button type="button" className="bl-start-card" onClick={onNew}>
            <FilePlus2 className="cat-mark" size={96} strokeWidth={1.3} aria-hidden="true" />
            <span className="bl-start-icon">
              <FilePlus2 size={24} />
            </span>
            <b>Start New Patient Billing</b>
            <small>Register a new patient (or find an existing one) and start a new bill.</small>
            <em>
              Register patient <ArrowRight size={15} />
            </em>
          </button>
        </div>
      </section>

      {drafts.length > 0 && (
        <section className="bl-card">
          <header className="bl-card-head">
            <span className="bl-card-icon" aria-hidden="true">
              <FileStack size={20} />
            </span>
            <div>
              <h3>Unfinished bills</h3>
              <p>Saved drafts for this branch — continue where you stopped.</p>
            </div>
          </header>
          <ul className="bl-drafts">
            {drafts.map((d) => (
              <DraftRow key={d.id} d={d} money={money} onResume={() => onResume(d)} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function DraftRow({ d, money, onResume, onDelete }: { d: BillingSession; money: (n: number) => string; onResume: () => void; onDelete?: () => void }) {
  const t = computeBill(d);
  return (
    <li>
      <span className="bl-avatar">{d.patient.name.trim() ? initials(d.patient.name) : "?"}</span>
      <span className="bl-draft-text">
        <b>{d.patient.name.trim() || "Unnamed patient"}</b>
        <small>
          {d.patient.existingId ?? d.reservedId ?? "No Patient ID yet"} · step {d.step} of 5 ({STEPS[d.step - 1]}) · {d.services.length} test{d.services.length === 1 ? "" : "s"}
          {d.services.length ? ` · ${money(t.total)}` : ""}
          {d.startedBy ? ` · started by ${d.startedBy.name}` : ""}
        </small>
        <span className="bl-draft-progress" aria-label={`Step ${d.step} of 5`}>
          {[1, 2, 3, 4].map((n) => (
            <i key={n} className={n < d.step ? "is-done" : n === d.step ? "is-current" : ""} />
          ))}
        </span>
      </span>
      <small className="bl-draft-time">{d.lastSaved ? `Saved ${formatRelative(new Date(d.lastSaved))}` : ""}</small>
      {onDelete && (
        <button type="button" className="bl-icon-btn" onClick={onDelete} aria-label="Move draft to trash" title="Move to trash">
          <Trash2 size={15} />
        </button>
      )}
      <button type="button" className="bl-btn is-sm is-primary" onClick={onResume}>
        Resume <ArrowRight size={14} />
      </button>
    </li>
  );
}

/* ─────────────── "A draft already exists for this patient" ─────────────── */

function SamePatientDrafts({ drafts, money, onResume, onDismiss }: { drafts: BillingSession[]; money: (n: number) => string; onResume: (d: BillingSession) => void; onDismiss: (id: string) => void }) {
  if (!drafts.length) return null;
  return (
    <section className="bl-same-draft" role="status" aria-live="polite">
      <header>
        <span className="bl-draft-alert-icon" aria-hidden="true">
          <FileStack size={18} />
        </span>
        <div>
          <b>This patient already has an unfinished bill</b>
          <small>Continue that draft to keep its tests and payment — or keep going with this new bill.</small>
        </div>
      </header>
      <ul className="bl-drafts">
        {drafts.map((d) => (
          <li key={d.id} className="bl-same-row">
            <span className="bl-draft-text">
              <b>{d.patient.name.trim() || "Unnamed patient"}</b>
              <small>
                {d.patient.existingId ?? "New patient"} · step {d.step} of 5 ({STEPS[d.step - 1]}) · {d.services.length} test{d.services.length === 1 ? "" : "s"}
                {d.services.length ? ` · ${money(computeBill(d).total)}` : ""} · {d.lastSaved ? `saved ${formatRelative(new Date(d.lastSaved))}` : ""}
              </small>
            </span>
            <button type="button" className="bl-btn is-sm" onClick={() => onDismiss(d.id)}>
              Keep new bill
            </button>
            <button type="button" className="bl-btn is-sm is-primary" onClick={() => onResume(d)}>
              Continue draft <ArrowRight size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────── Referral ID dialog ─────────────── */

function ReferralDialog({ branch, onClose, onFound }: { branch: Branch; onClose: () => void; onFound: (m: NonNullable<ReturnType<typeof lookupReferral>>, referralId: string) => void }) {
  const prefix = `${branchPrefix(branch.id)}-R`;
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const net = useNetworkStatus();
  const full = `${prefix}${digits.padStart(6, "0")}`;
  const check = () => {
    if (digits.length !== 6) {
      setError("Enter all six digits of the referral ID.");
      focusFirstError();
      return;
    }
    // Referred patients already on this device are found even offline.
    const m = lookupReferral(branch.id, full);
    if (!m) {
      // Referral IDs are created in the PR agents' app and come from the cloud database — that needs internet.
      setError(
        !navigator.onLine
          ? `No internet connection. Referral IDs are fetched from the cloud database, so ${full} can't be checked offline. Check your internet connection and try again.`
          : `Referral ${full} was not found. Check the number is correct — or the referral may not have synced yet (the PR agent's phone needs internet to send it). For a first visit you can use Start New Patient Billing.`,
      );
      focusFirstError();
      return;
    }
    onFound(m, full);
  };
  return (
    <Modal
      open
      onClose={onClose}
      icon={Link2}
      title="Find a referral"
      description={`Enter the six-digit number. The ${branch.name} prefix (${prefix}) is filled in automatically.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back to options
          </Button>
          <Button onClick={check}>Continue</Button>
        </>
      }
    >
      <label className={`bl-field ${error ? "is-error" : ""}`} data-field-error={error ? true : undefined}>
        <span className="bl-label">
          Referral ID <i>*</i>
        </span>
        <span className="bl-refid">
          <b>{prefix}</b>
          <input
            autoFocus
            inputMode="numeric"
            value={digits}
            maxLength={6}
            placeholder="000000"
            onChange={(e) => {
              setDigits(e.target.value.replace(/\D/g, "").slice(0, 6));
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && check()}
            aria-label="Referral ID number"
          />
        </span>
        {error ? <FieldError msg={error} /> : <small className="bl-help">Only the six digits are editable. Example: {prefix}000123.</small>}
      </label>
      <p className={`bl-net ${net.online ? "is-online" : "is-offline"}`}>
        <i aria-hidden="true" />
        {net.online ? "Online — referrals can be checked against the cloud database." : "Offline — referral IDs need an internet connection. Patients already billed on this device can still be found."}
      </p>
      <p className="bl-help">The cloud referral database (fed by the PR agents' app) is not connected in this version yet.</p>
    </Modal>
  );
}

/* ─────────────── Drafts page ─────────────── */

type DraftSort = "recent" | "oldest" | "step" | "value";

/**
 * Unfinished bills for the branch. Drafts are created automatically while
 * billing (and by Save as Draft or leaving the page); Continue reopens the
 * bill at the step where it stopped. Deleting never removes a draft outright —
 * it goes to Trash for 30 days (owner rule).
 */
export function BillingDrafts({ branch }: { branch: Branch }) {
  const { navigate, moveDraftToTrash, showToast } = useApp();
  const store = useBilling();
  const [trashing, setTrashing] = useState<BillingSession | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<DraftSort>("recent");
  const all = store.drafts.filter((d) => d.branchId === branch.id);
  const money = (n: number) => formatMoney(n, branch.currency);
  const when = (d: BillingSession) => d.lastSaved ?? d.startedAt;
  const term = q.trim().toLowerCase();
  const drafts = all
    .filter((d) => !term || `${d.patient.name} ${d.patient.phone} ${d.patient.existingId ?? ""} ${d.reservedId ?? ""} ${d.services.map((s) => s.name).join(" ")} ${d.startedBy?.name ?? ""}`.toLowerCase().includes(term))
    .sort((a, b) => (sort === "recent" ? when(b).localeCompare(when(a)) : sort === "oldest" ? when(a).localeCompare(when(b)) : sort === "step" ? b.step - a.step : computeBill(b).total - computeBill(a).total));
  const resume = (d: BillingSession) => navigate(`/branch/${branch.id}/billing?draft=${d.id}`);

  return (
    <section className="bl-card">
      <header className="bl-card-head">
        <span className="bl-card-icon" aria-hidden="true">
          <FileStack size={20} />
        </span>
        <div>
          <h3>Billing drafts</h3>
          <p>Unfinished bills. Drafts save automatically while billing, and when you choose Save as Draft or leave a bill. Continue picks up at the step where it stopped. Saved on this device.</p>
        </div>
      </header>
      {all.length > 0 && (
        <div className="bl-drafts-tools">
          <label className="bl-drafts-search">
            <Search size={16} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patient, phone, Patient ID, test or staff" aria-label="Search drafts" />
          </label>
          <div className="bl-drafts-sort" role="group" aria-label="Sort drafts">
            {(
              [
                ["recent", "Most recent"],
                ["oldest", "Oldest first"],
                ["step", "Furthest along"],
                ["value", "Highest value"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" className={sort === v ? "is-on" : ""} aria-pressed={sort === v} onClick={() => setSort(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {all.length === 0 ? (
        <div className="bl-selected-empty">
          No unfinished bills. A draft appears here as soon as patient details or tests are entered in Billing, and stays until the bill is completed.
          <div style={{ marginTop: 12 }}>
            <button type="button" className="bl-btn is-primary" onClick={() => navigate(`/branch/${branch.id}/billing`)}>
              <FilePlus2 size={15} /> Start a bill
            </button>
          </div>
        </div>
      ) : drafts.length === 0 ? (
        <div className="bl-selected-empty">No drafts match “{q}”.</div>
      ) : (
        <ul className="bl-drafts">
          {drafts.map((d) => (
            <DraftRow key={d.id} d={d} money={money} onResume={() => resume(d)} onDelete={() => setTrashing(d)} />
          ))}
        </ul>
      )}
      <MoveToTrashDialog
        open={!!trashing}
        name={trashing?.patient.name.trim() || "this draft"}
        what="unfinished bill"
        onClose={() => setTrashing(null)}
        onConfirm={(reason) => {
          if (trashing) {
            moveDraftToTrash(trashing.id, reason || "Deleted from Drafts");
            showToast("Draft moved to Trash — restore it there within 30 days");
          }
          setTrashing(null);
        }}
      />
    </section>
  );
}
