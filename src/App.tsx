import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  animate as animateValue,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  PanelLeftClose,
  Search,
  Settings,
  UserRoundPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  barContainer,
  barVariants,
  cardVariants,
  contentContainer,
  contentItem,
  interactiveCard,
  pageVariants,
  popContainer,
  popItem,
  premiumEase,
  sidebarVariants,
  staggerContainer,
  tapButton,
  wakeContainer,
} from "./motion";

type Theme = "a" | "b" | "c";
type Page =
  | "Dashboard"
  | "Branches"
  | "Staff Management"
  | "Patients"
  | "Billing & Payments"
  | "Reports"
  | "Settings"
  | "Audit Log";

const navItems: { label: Page; icon: LucideIcon }[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Branches", icon: Building2 },
  { label: "Staff Management", icon: Users },
  { label: "Patients", icon: UserRoundPlus },
  { label: "Billing & Payments", icon: CreditCard },
  { label: "Reports", icon: BarChart3 },
  { label: "Settings", icon: Settings },
  { label: "Audit Log", icon: ClipboardList },
];

const branches = [
  {
    name: "Victoria Island",
    place: "Lagos, Nigeria",
    status: "Active",
    staff: 34,
    patients: 86,
    revenue: "₦1,284,500",
    expense: "₦164,000",
    hospital: "Lagoon Hospital",
    doctor: "Dr. Ifeoma Eze",
    service: "Full Blood Count",
  },
  {
    name: "Wuse II",
    place: "Abuja, Nigeria",
    status: "Active",
    staff: 27,
    patients: 64,
    revenue: "₦975,000",
    expense: "₦118,500",
    hospital: "Nisa Premier",
    doctor: "Dr. Ahmed Bello",
    service: "X-ray",
  },
  {
    name: "GRA",
    place: "Port Harcourt, Nigeria",
    status: "Active",
    staff: 21,
    patients: 53,
    revenue: "₦742,500",
    expense: "₦96,000",
    hospital: "Prime Medical",
    doctor: "Dr. Tamuno Briggs",
    service: "Ultrasound",
  },
  {
    name: "Lokoja Central",
    place: "Kogi, Nigeria",
    status: "Active",
    staff: 15,
    patients: 38,
    revenue: "₦486,000",
    expense: "₦71,500",
    hospital: "Kogi Specialist",
    doctor: "Dr. Mary Ocholi",
    service: "Malaria Screen",
  },
];

const services = [
  {
    name: "X-ray",
    category: "Radiology",
    price: "₦20,000",
    previous: "₦18,000",
    changed: "12 Jun 2025",
  },
  {
    name: "Full Blood Count",
    category: "Haematology",
    price: "₦8,500",
    previous: "₦8,500",
    changed: "04 Mar 2025",
  },
  {
    name: "Abdominal Ultrasound",
    category: "Imaging",
    price: "₦24,000",
    previous: "₦22,500",
    changed: "28 May 2025",
  },
  {
    name: "Lipid Profile",
    category: "Chemical Pathology",
    price: "₦16,500",
    previous: "₦15,000",
    changed: "16 Apr 2025",
  },
];

const patients = [
  {
    id: "ABC-001982",
    name: "Adaobi Nwosu",
    sex: "Female, 34",
    branch: "Victoria Island",
    last: "Today, 09:42",
    orders: 8,
  },
  {
    id: "ABC-001647",
    name: "Musa Abdullahi",
    sex: "Male, 52",
    branch: "Wuse II",
    last: "Today, 08:15",
    orders: 12,
  },
  {
    id: "ABC-001521",
    name: "Tonye Amadi",
    sex: "Male, 41",
    branch: "GRA",
    last: "Yesterday, 16:20",
    orders: 5,
  },
  {
    id: "ABC-001408",
    name: "Blessing Okafor",
    sex: "Female, 29",
    branch: "Victoria Island",
    last: "11 Jun 2025",
    orders: 4,
  },
  {
    id: "ABC-001177",
    name: "Esther Omale",
    sex: "Female, 47",
    branch: "Lokoja Central",
    last: "10 Jun 2025",
    orders: 9,
  },
];

const staff = [
  {
    name: "Dr. Sarah Adeyemi",
    role: "Branch Manager",
    status: "Active",
    added: "12 Jan 2024",
    activity: "Today, 08:04",
    initials: "SA",
  },
  {
    name: "Chinedu Okoro",
    role: "Senior Lab Scientist",
    status: "Active",
    added: "03 Feb 2024",
    activity: "Today, 09:18",
    initials: "CO",
  },
  {
    name: "Mariama Yusuf",
    role: "Billing Officer",
    status: "Active",
    added: "18 Mar 2024",
    activity: "Yesterday, 17:44",
    initials: "MY",
  },
  {
    name: "Temilade George",
    role: "Radiographer",
    status: "Active",
    added: "22 Apr 2024",
    activity: "Today, 07:52",
    initials: "TG",
  },
];

const transactions = [
  {
    id: "TXN-84291",
    patient: "Adaobi Nwosu",
    branch: "Victoria Island",
    billed: "₦32,500",
    collected: "₦32,500",
    balance: "₦0",
    method: "POS",
    time: "Today, 09:48",
  },
  {
    id: "TXN-84290",
    patient: "Musa Abdullahi",
    branch: "Wuse II",
    billed: "₦68,000",
    collected: "₦50,000",
    balance: "₦18,000",
    method: "Transfer",
    time: "Today, 09:31",
  },
  {
    id: "TXN-84289",
    patient: "Tonye Amadi",
    branch: "GRA",
    billed: "₦24,000",
    collected: "₦24,000",
    balance: "₦0",
    method: "Cash",
    time: "Today, 09:12",
  },
  {
    id: "TXN-84288",
    patient: "Femi Lawal",
    branch: "Lokoja Central",
    billed: "₦15,500",
    collected: "₦10,000",
    balance: "₦5,500",
    method: "POS",
    time: "Today, 08:54",
  },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    building: (
      <>
        <path d="M4 21V5a2 2 0 0 1 2-2h9v18" />
        <path d="M15 9h3a2 2 0 0 1 2 2v10M8 7h3M8 11h3M8 15h3M3 21h19" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    patient: (
      <>
        <circle cx="9" cy="7" r="4" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v6M16 11h6" />
      </>
    ),
    card: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="m7 16 4-5 4 3 5-7" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.6.67 1.03 1.28 1.03H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
    audit: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h6" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    down: <path d="m6 9 6 6 6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    filter: <path d="M4 5h16M7 12h10M10 19h4" />,
    download: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    external: (
      <path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    ),
    upload: (
      <>
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M4 16v4h16v-4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-mark" aria-label="ABC Diagnostic Centre">
      <span>ABC</span>
      {!compact && <strong>ABC Diagnostic Centre</strong>}
    </div>
  );
}

function Badge({
  children,
  tone = "success",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "neutral";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Button({
  children,
  secondary = false,
  onClick,
}: {
  children: ReactNode;
  secondary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`button ${secondary ? "secondary" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Filters() {
  return (
    <div className="date-filters">
      {["Today", "Yesterday", "This week", "This month", "This year"].map((item, i) => (
        <button className={i === 3 ? "selected" : ""} key={item}>
          {item}
        </button>
      ))}
      <button>
        <Icon name="filter" size={15} /> Custom
      </button>
    </div>
  );
}

function PageTitle({
  title,
  eyebrow,
  actions,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
      </div>
      <div className="title-actions">{actions}</div>
    </div>
  );
}

const metrics = [
  ["Total registered patients", "18,492", "+6.4%", "All time"],
  ["Today's attendance", "241", "+12.8%", "vs. yesterday"],
  ["Orders processed today", "198", "+8.2%", "186 completed"],
  ["Revenue collected today", "₦3.49m", "+9.6%", "₦3.86m billed"],
  ["Today's expenses", "₦450k", "-3.1%", "Across 4 branches"],
  ["Outstanding payments", "₦6.82m", "+2.4%", "428 open bills"],
  ["Year-to-date revenue", "₦284.6m", "+18.3%", "₦301.2m billed"],
  ["Year-to-date expenses", "₦72.4m", "+7.2%", "25.4% of collected"],
  ["Active branches", "4", "100%", "All operational"],
];

function MetricCard({ item, index }: { item: string[]; index: number }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{item[0]}</div>
      <div className="metric-main">
        <strong>{item[1]}</strong>
        <span className={item[2].startsWith("-") ? "down-value" : ""}>{item[2]}</span>
      </div>
      <div className="metric-note">{item[3]}</div>
      {index === 3 && (
        <div className="collection-track">
          <i style={{ width: "90%" }} />
        </div>
      )}
    </div>
  );
}

function AnimatedMetric({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const reduced = Boolean(useReducedMotion());
  const progress = useMotionValue(reduced ? value : 0);
  const display = useTransform(
    progress,
    (latest) =>
      `${prefix}${latest.toLocaleString("en-NG", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`,
  );

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      progress.set(value);
      return;
    }
    const controls = animateValue(progress, value, {
      duration: 1.2,
      ease: premiumEase,
    });
    return controls.stop;
  }, [inView, progress, reduced, value]);

  return <motion.span ref={ref}>{display}</motion.span>;
}

function AnimatedGauge({
  value,
  tone,
  label,
}: {
  value: number;
  tone: "green" | "blue";
  label: string;
}) {
  const reduced = Boolean(useReducedMotion());

  return (
    <div className="gauge">
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <path className="gauge-track" d="M10 60 A50 50 0 0 1 110 60" pathLength="1" />
        <motion.path
          className={`gauge-value ${tone}`}
          d="M10 60 A50 50 0 0 1 110 60"
          pathLength="1"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: value / 100 }}
          transition={{ duration: reduced ? 0 : 1.1, delay: 0.35, ease: premiumEase }}
        />
      </svg>
      <div>
        <strong>
          <AnimatedMetric value={value} suffix="%" decimals={1} />
        </strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function TrendChart() {
  const reduced = Boolean(useReducedMotion());

  return (
    <div className="chart-card wide">
      <div className="card-heading">
        <div>
          <h3>Revenue & expense trend</h3>
          <p>Collected revenue compared with operating expenses</p>
        </div>
        <div className="legend">
          <span>
            <i className="rev" />
            Revenue
          </span>
          <span>
            <i className="exp" />
            Expenses
          </span>
        </div>
      </div>
      <div className="chart-layout">
        <div className="y-labels">
          <span>₦12m</span>
          <span>₦9m</span>
          <span>₦6m</span>
          <span>₦3m</span>
          <span>₦0</span>
        </div>
        <svg className="line-chart" viewBox="0 0 700 220" preserveAspectRatio="none">
          <g className="grid-lines">
            <line x1="0" y1="12" x2="700" y2="12" />
            <line x1="0" y1="60" x2="700" y2="60" />
            <line x1="0" y1="108" x2="700" y2="108" />
            <line x1="0" y1="156" x2="700" y2="156" />
            <line x1="0" y1="204" x2="700" y2="204" />
          </g>
          <motion.path
            className="revenue-line"
            d="M0 162 C55 154 73 126 118 135 S194 111 234 119 S309 74 350 86 S426 62 468 69 S540 35 585 49 S655 20 700 28"
            initial={reduced ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.9, ease: premiumEase }}
          />
          <motion.path
            className="expense-line"
            d="M0 185 C60 177 78 180 118 172 S194 174 234 160 S309 167 350 151 S426 156 468 142 S540 147 585 131 S655 137 700 122"
            initial={reduced ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              duration: reduced ? 0 : 0.9,
              delay: reduced ? 0 : 0.12,
              ease: premiumEase,
            }}
          />
        </svg>
      </div>
      <div className="x-labels">
        <span>Jan</span>
        <span>Feb</span>
        <span>Mar</span>
        <span>Apr</span>
        <span>May</span>
        <span>Jun</span>
        <span>Jul</span>
        <span>Aug</span>
        <span>Sep</span>
        <span>Oct</span>
        <span>Nov</span>
        <span>Dec</span>
      </div>
    </div>
  );
}

function AttendanceChart() {
  const vals = [56, 68, 63, 81, 73, 91, 84];
  return (
    <div className="chart-card">
      <div className="card-heading">
        <div>
          <h3>Patient attendance</h3>
          <p>1,426 visits this week</p>
        </div>
        <strong className="positive">+11.6%</strong>
      </div>
      <div className="bar-chart">
        {vals.map((v, i) => (
          <div className="bar-item" key={i}>
            <div className="bar" style={{ height: `${v}%` }} />
            <span>{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerformanceTable() {
  return (
    <div className="chart-card">
      <div className="card-heading">
        <div>
          <h3>Branch performance</h3>
          <p>Collected revenue this month</p>
        </div>
        <button className="text-button">View report</button>
      </div>
      <div className="performance-list">
        {branches.map((b, i) => (
          <div className="performance-row" key={b.name}>
            <span>{i + 1}</span>
            <div>
              <strong>{b.name}</strong>
              <small>{b.place}</small>
            </div>
            <div className="mini-track">
              <i style={{ width: `${94 - i * 13}%` }} />
            </div>
            <strong>{["₦28.4m", "₦22.7m", "₦18.9m", "₦12.6m"][i]}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function Referrals() {
  return (
    <div className="chart-card referrals">
      <div className="card-heading">
        <div>
          <h3>Referral & service performance</h3>
          <p>Company-wide, this month</p>
        </div>
        <button className="select-button">
          All branches <Icon name="down" size={14} />
        </button>
      </div>
      <div className="referral-columns">
        <div>
          <h4>Leading hospitals</h4>
          {[
            ["Lagoon Hospital", "286"],
            ["Nisa Premier", "214"],
            ["Prime Medical", "178"],
          ].map((r, i) => (
            <div className="rank-row" key={r[0]}>
              <span>{i + 1}</span>
              <strong>{r[0]}</strong>
              <b>{r[1]}</b>
            </div>
          ))}
        </div>
        <div>
          <h4>Leading doctors</h4>
          {[
            ["Dr. Ifeoma Eze", "142"],
            ["Dr. Ahmed Bello", "119"],
            ["Dr. Tamuno Briggs", "96"],
          ].map((r, i) => (
            <div className="rank-row" key={r[0]}>
              <span>{i + 1}</span>
              <strong>{r[0]}</strong>
              <b>{r[1]}</b>
            </div>
          ))}
        </div>
        <div>
          <h4>Top diagnostic services</h4>
          {[
            ["Full Blood Count", "486"],
            ["X-ray", "371"],
            ["Ultrasound", "298"],
          ].map((r, i) => (
            <div className="rank-row" key={r[0]}>
              <span>{i + 1}</span>
              <strong>{r[0]}</strong>
              <b>{r[1]}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Activity() {
  const items = [
    ["Price updated", "Wuse II updated X-ray from ₦18,000 to ₦20,000", "12 min"],
    ["Staff account created", "Chinwe Eze added to Victoria Island", "38 min"],
    ["Manager assigned", "Dr. Sarah Adeyemi assigned to Victoria Island", "2 hrs"],
    ["Service added", "Thyroid Function Test added at GRA", "Yesterday"],
    ["Branch registered", "Lokoja Central branch was registered", "2 days"],
  ];
  return (
    <div className="chart-card activity-card">
      <div className="card-heading">
        <div>
          <h3>Recent company activity</h3>
          <p>Administrative events across branches</p>
        </div>
        <button className="text-button">View audit log</button>
      </div>
      <div>
        {items.map((it, i) => (
          <div className="activity-row" key={it[0]}>
            <span className="activity-icon">
              <Icon
                name={i === 0 ? "card" : i === 1 ? "users" : i === 4 ? "building" : "audit"}
                size={16}
              />
            </span>
            <div>
              <strong>{it[0]}</strong>
              <p>{it[1]}</p>
            </div>
            <time>{it[2]}</time>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard() {
  const weeklyPatients = [54, 68, 61, 78, 88, 73, 92];
  const reduced = Boolean(useReducedMotion());

  return (
    <motion.div
      className="dashboard"
      variants={wakeContainer}
      initial="hidden"
      animate="visible"
      custom={reduced}
    >
      <motion.div className="dashboard-title" variants={cardVariants}>
        <div>
          <span className="dashboard-kicker">Company administration · All branches</span>
          <h1>Dashboard</h1>
          <p>Good morning, Amina. Here is today’s diagnostic centre performance.</p>
        </div>
        <motion.button className="dashboard-customize" whileTap={tapButton}>
          <Icon name="plus" size={14} />
          Customize dashboard
        </motion.button>
      </motion.div>

      <motion.section
        className="dashboard-kpis"
        aria-label="Key performance indicators"
        variants={staggerContainer}
      >
        {[
          {
            label: "Revenue collected today",
            value: 3.49,
            prefix: "₦",
            suffix: "m",
            decimals: 2,
            note: "₦3.86m billed · 90.4% collected",
            tone: "green",
            values: [34, 51, 43, 72, 57, 81, 65],
          },
          {
            label: "Patients attended today",
            value: 241,
            note: "12.8% more than yesterday",
            tone: "blue",
            values: [42, 67, 51, 76, 61, 88, 70],
          },
          {
            label: "Outstanding payments",
            value: 6.82,
            prefix: "₦",
            suffix: "m",
            decimals: 2,
            note: "428 open patient bills",
            tone: "coral",
            values: [28, 47, 39, 65, 49, 79, 58],
          },
        ].map((item) => (
          <motion.article
            className={`dashboard-kpi ${item.tone}`}
            key={item.label}
            variants={cardVariants}
            whileHover={reduced ? undefined : interactiveCard}
          >
            <motion.div variants={contentContainer}>
              <motion.span variants={contentItem}>{item.label}</motion.span>
              <motion.strong variants={contentItem}>
                <AnimatedMetric
                  value={item.value}
                  prefix={item.prefix}
                  suffix={item.suffix}
                  decimals={item.decimals}
                />
              </motion.strong>
              <motion.small variants={contentItem}>{item.note}</motion.small>
            </motion.div>
            <motion.div
              className="kpi-spark"
              aria-hidden="true"
              variants={barContainer}
              initial="hidden"
              animate="visible"
            >
              {item.values.map((value, index) => (
                <motion.i
                  key={index}
                  style={{ height: `${value}%`, transformOrigin: "bottom" }}
                  variants={barVariants}
                  custom={reduced}
                />
              ))}
            </motion.div>
          </motion.article>
        ))}
      </motion.section>

      <motion.section className="dashboard-focus" variants={staggerContainer}>
        <motion.article
          className="dashboard-card gauge-card"
          variants={cardVariants}
          whileHover={reduced ? undefined : interactiveCard}
        >
          <div className="dashboard-card-heading">
            <div>
              <span>Collection performance</span>
              <small>Payments received against billing</small>
            </div>
            <motion.button
              className="card-more"
              aria-label="More collection options"
              whileTap={tapButton}
            >
              <Icon name="more" size={17} />
            </motion.button>
          </div>
          <div className="gauge-wrap">
            <AnimatedGauge value={90.4} tone="green" label="collection rate" />
            <div className="gauge-legend">
              <span>
                <i className="received" /> Received <b>₦3.49m</b>
              </span>
              <span>
                <i className="pending" /> Pending <b>₦370k</b>
              </span>
            </div>
          </div>
          <motion.button className="dashboard-outline" whileTap={tapButton}>
            View payment details
          </motion.button>
        </motion.article>

        <motion.article
          className="dashboard-card gauge-card"
          variants={cardVariants}
          whileHover={reduced ? undefined : interactiveCard}
        >
          <div className="dashboard-card-heading">
            <div>
              <span>Order completion</span>
              <small>Diagnostics processed across branches</small>
            </div>
            <motion.button
              className="card-more"
              aria-label="More order options"
              whileTap={tapButton}
            >
              <Icon name="more" size={17} />
            </motion.button>
          </div>
          <div className="gauge-wrap">
            <AnimatedGauge value={93.9} tone="blue" label="completion rate" />
            <div className="gauge-legend">
              <span>
                <i className="completed" /> Completed <b>186</b>
              </span>
              <span>
                <i className="pending" /> In progress <b>12</b>
              </span>
            </div>
          </div>
          <motion.button className="dashboard-outline" whileTap={tapButton}>
            View diagnostic orders
          </motion.button>
        </motion.article>

        <motion.article
          className="dashboard-card branch-map-card"
          variants={cardVariants}
          whileHover={reduced ? undefined : interactiveCard}
        >
          <div className="dashboard-card-heading">
            <div>
              <span>Branch performance today</span>
              <small>Patient volume by location</small>
            </div>
            <motion.button className="text-button" whileTap={tapButton}>
              View all
            </motion.button>
          </div>
          <div className="branch-visual">
            <div className="branch-ranking">
              {branches.map((item, index) => (
                <div key={item.name}>
                  <span>
                    <i
                      style={{ background: ["#27aa76", "#62b9a2", "#9ad5c3", "#d6ece4"][index] }}
                    />
                    {item.name}
                  </span>
                  <strong>{item.patients}</strong>
                </div>
              ))}
            </div>
            <div className="branch-map" aria-hidden="true">
              <span className="map-shape shape-one" />
              <span className="map-shape shape-two" />
              <span className="map-shape shape-three" />
              <span className="map-pin pin-one">86</span>
              <span className="map-pin pin-two">64</span>
              <span className="map-pin pin-three">53</span>
            </div>
          </div>
        </motion.article>
      </motion.section>

      <motion.section className="dashboard-lower" variants={staggerContainer}>
        <motion.article
          className="dashboard-insight"
          variants={cardVariants}
          whileHover={reduced ? undefined : interactiveCard}
        >
          <div className="insight-ring">
            <span>+18%</span>
          </div>
          <div>
            <span>Company performance</span>
            <strong>Revenue is ahead of plan</strong>
            <p>Victoria Island leads today with ₦1.28m collected.</p>
          </div>
          <Icon name="external" size={18} />
        </motion.article>

        <motion.article
          className="dashboard-attendance"
          variants={cardVariants}
          whileHover={reduced ? undefined : interactiveCard}
        >
          <div>
            <span className="dashboard-kicker">Patient activity</span>
            <h2>1,426 visits this week</h2>
            <p>Patient attendance is up 11.6% across all branches.</p>
            <motion.div
              className="attendance-people"
              variants={popContainer}
              initial="hidden"
              animate="visible"
            >
              {["AN", "MA", "TO", "BO"].map((person) => (
                <motion.i key={person} variants={popItem} custom={reduced}>
                  {person}
                </motion.i>
              ))}
              <span>+1,422 patients</span>
            </motion.div>
          </div>
          <motion.div
            className="attendance-bars"
            aria-label="Weekly patient attendance"
            variants={barContainer}
            initial="hidden"
            animate="visible"
          >
            {weeklyPatients.map((value, index) => (
              <span key={index}>
                <motion.i
                  style={{ height: `${value}%`, transformOrigin: "bottom" }}
                  variants={barVariants}
                  custom={reduced}
                />
                <small>{["M", "T", "W", "T", "F", "S", "S"][index]}</small>
              </span>
            ))}
          </motion.div>
        </motion.article>
      </motion.section>

      <motion.section
        className="dashboard-status"
        variants={cardVariants}
        whileHover={reduced ? undefined : interactiveCard}
      >
        <div className="status-ring">4</div>
        <div>
          <strong>All branches are operational</strong>
          <span>97 staff members active across 4 locations</span>
        </div>
        <span className="live-dot">Live</span>
        <time>Updated 10:24 AM</time>
      </motion.section>
    </motion.div>
  );
}

function BranchesPage({ onOpen, onAdd }: { onOpen: (b: string) => void; onAdd: () => void }) {
  return (
    <>
      <PageTitle
        eyebrow="Company structure"
        title="Branches"
        actions={
          <>
            <Button secondary>
              <Icon name="download" size={16} /> Export
            </Button>
            <Button onClick={onAdd}>
              <Icon name="plus" size={16} /> Add branch
            </Button>
          </>
        }
      />
      <div className="summary-strip">
        <div>
          <strong>4</strong>
          <span>Active branches</span>
        </div>
        <div>
          <strong>97</strong>
          <span>Total staff</span>
        </div>
        <div>
          <strong>241</strong>
          <span>Patients today</span>
        </div>
        <div>
          <strong>₦3.49m</strong>
          <span>Collected today</span>
        </div>
      </div>
      <div className="branch-grid">
        {branches.map((b) => (
          <button className="branch-card" onClick={() => onOpen(b.name)} key={b.name}>
            <div className="branch-top">
              <span className="branch-symbol">
                <Icon name="building" size={20} />
              </span>
              <Badge>{b.status}</Badge>
            </div>
            <h3>{b.name}</h3>
            <p className="branch-place">{b.place}</p>
            <div className="branch-stat-grid">
              <div>
                <span>Staff</span>
                <strong>{b.staff}</strong>
              </div>
              <div>
                <span>Patients today</span>
                <strong>{b.patients}</strong>
              </div>
              <div>
                <span>Revenue today</span>
                <strong>{b.revenue}</strong>
              </div>
              <div>
                <span>Expenses today</span>
                <strong>{b.expense}</strong>
              </div>
            </div>
            <div className="branch-details">
              <div>
                <span>Leading hospital</span>
                <strong>{b.hospital}</strong>
              </div>
              <div>
                <span>Leading doctor</span>
                <strong>{b.doctor}</strong>
              </div>
              <div>
                <span>Top service</span>
                <strong>{b.service}</strong>
              </div>
            </div>
            <div className="card-link">
              Open branch workspace <Icon name="chevron" size={15} />
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function BranchWorkspace({ branch, onBack }: { branch: string; onBack: () => void }) {
  const [tab, setTab] = useState("Overview");
  const [editing, setEditing] = useState<string | null>(null);
  const tabs = [
    "Overview",
    "Patients",
    "Diagnostic orders",
    "Services & prices",
    "Billing",
    "Expenses",
    "Staff",
    "Reports",
    "Activity",
  ];
  return (
    <>
      <button className="back-link" onClick={onBack}>
        ‹ Back to all branches
      </button>
      <PageTitle
        eyebrow="Branch workspace"
        title={`${branch} Branch`}
        actions={
          <>
            <Badge>Active</Badge>
            <Button secondary>
              <Icon name="settings" size={16} /> Branch settings
            </Button>
          </>
        }
      />
      <div className="branch-context-warning">
        <div>
          <Icon name="building" size={18} />
          <span>
            <strong>You are managing {branch} Branch</strong>
            <small>Changes made here apply only to this branch.</small>
          </span>
        </div>
        <button>
          Switch branch <Icon name="down" size={14} />
        </button>
      </div>
      <div className="tabs">
        {tabs.map((t) => (
          <button className={tab === t ? "active" : ""} onClick={() => setTab(t)} key={t}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Services & prices" ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Diagnostic services & branch pricing</h3>
              <p>Prices are independent and apply only to {branch} Branch.</p>
            </div>
            <Button>
              <Icon name="plus" size={16} /> Add service
            </Button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th>Current price</th>
                  <th>Previous price</th>
                  <th>Last changed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.name}>
                    <td>
                      <strong>{s.name}</strong>
                    </td>
                    <td>{s.category}</td>
                    <td>
                      <strong>{s.price}</strong>
                    </td>
                    <td>{s.previous}</td>
                    <td>{s.changed}</td>
                    <td>
                      <button className="table-action" onClick={() => setEditing(s.name)}>
                        Edit price
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="notice">
            <Icon name="audit" size={18} />
            <p>
              <strong>Price changes are branch-specific and fully audited.</strong>
              <br />
              Company administrators will be notified. Prices at other branches will remain
              unchanged.
            </p>
          </div>
        </div>
      ) : (
        <BranchOverview branch={branch} />
      )}
      {editing && (
        <Modal title={`Edit ${editing} price`} onClose={() => setEditing(null)}>
          <div className="selected-branch">
            <Icon name="building" />
            <div>
              <span>Selected branch</span>
              <strong>{branch} Branch</strong>
            </div>
          </div>
          <label>
            Current price
            <input value={services.find((s) => s.name === editing)?.price || ""} readOnly />
          </label>
          <label>
            New price
            <input placeholder="₦ Enter new price" />
          </label>
          <label>
            Reason for change
            <textarea placeholder="Add a brief reason for the audit record" />
          </label>
          <p className="form-hint">
            This change will only affect {branch} Branch. Other branch prices remain unchanged.
          </p>
          <div className="modal-actions">
            <Button secondary onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => setEditing(null)}>Save branch price</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function BranchOverview({ branch }: { branch: string }) {
  return (
    <>
      <div className="mini-metrics">
        <div>
          <span>Patients today</span>
          <strong>64</strong>
          <small>+8.5% vs yesterday</small>
        </div>
        <div>
          <span>Orders processed</span>
          <strong>51</strong>
          <small>47 completed</small>
        </div>
        <div>
          <span>Revenue collected</span>
          <strong>₦975,000</strong>
          <small>₦1.12m billed</small>
        </div>
        <div>
          <span>Outstanding</span>
          <strong>₦148,500</strong>
          <small>16 open bills</small>
        </div>
      </div>
      <div className="two-column">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>{branch} performance</h3>
              <p>Current month</p>
            </div>
          </div>
          <div className="simple-bars">
            {[72, 84, 66, 91, 78, 88].map((v, i) => (
              <div key={i}>
                <i style={{ height: `${v}%` }} />
                <span>W{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
        <Activity />
      </div>
    </>
  );
}

function StaffPage({
  selected,
  setSelected,
}: {
  selected: string | null;
  setSelected: (v: string | null) => void;
}) {
  if (!selected)
    return (
      <>
        <PageTitle
          eyebrow="Company-wide access"
          title="Staff management"
          actions={
            <Button secondary>
              <Icon name="download" size={16} /> Export summary
            </Button>
          }
        />
        <div className="info-banner">
          <Icon name="users" />
          <div>
            <strong>Branch-first staff management</strong>
            <p>Select a branch to manage its manager, staff accounts, roles and permissions.</p>
          </div>
        </div>
        <div className="staff-branch-grid">
          {branches.map((b, i) => (
            <button className="staff-branch-card" onClick={() => setSelected(b.name)} key={b.name}>
              <div className="branch-top">
                <span className="branch-symbol">
                  <Icon name="building" />
                </span>
                <Badge>{b.status}</Badge>
              </div>
              <h3>{b.name}</h3>
              <p>{b.place}</p>
              <div className="staff-count">
                <strong>{b.staff}</strong>
                <span>Total staff</span>
              </div>
              <div className="staff-split">
                <span>
                  <b>{[2, 2, 1, 1][i]}</b> Managers
                </span>
                <span>
                  <b>{b.staff - [2, 2, 1, 1][i]}</b> Staff
                </span>
              </div>
              <div className="card-link">
                Manage branch staff <Icon name="chevron" size={15} />
              </div>
            </button>
          ))}
        </div>
      </>
    );
  return (
    <>
      <button className="back-link" onClick={() => setSelected(null)}>
        ‹ Back to branch selection
      </button>
      <PageTitle
        eyebrow={`${selected} Branch`}
        title="Staff management"
        actions={
          <>
            <Button secondary>Add manager</Button>
            <Button>
              <Icon name="plus" size={16} /> Add staff
            </Button>
          </>
        }
      />
      <div className="manager-card">
        <div className="avatar large">SA</div>
        <div>
          <span>Branch manager</span>
          <h3>Dr. Sarah Adeyemi</h3>
          <p>sarah.adeyemi@abcdiagnostics.com · Active since 12 Jan 2024</p>
        </div>
        <Badge>Active</Badge>
        <button>
          <Icon name="more" />
        </button>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Branch staff</h3>
            <p>{staff.length} accounts shown</p>
          </div>
          <SearchBox placeholder="Search staff" />
        </div>
        <DataTable headers={["Staff member", "Role", "Status", "Date added", "Last activity", ""]}>
          {staff.map((s) => (
            <tr key={s.name}>
              <td>
                <div className="person-cell">
                  <span className="avatar">{s.initials}</span>
                  <strong>{s.name}</strong>
                </div>
              </td>
              <td>{s.role}</td>
              <td>
                <Badge>{s.status}</Badge>
              </td>
              <td>{s.added}</td>
              <td>{s.activity}</td>
              <td>
                <button className="icon-button">
                  <Icon name="more" />
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </>
  );
}

function SearchBox({ placeholder }: { placeholder: string }) {
  return (
    <div className="search-box">
      <Icon name="search" size={17} />
      <input placeholder={placeholder} />
    </div>
  );
}

function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function PatientsPage() {
  return (
    <>
      <PageTitle
        eyebrow="Company-wide directory"
        title="Patients"
        actions={
          <Button>
            <Icon name="plus" size={16} /> Register patient
          </Button>
        }
      />
      <div className="directory-search">
        <Icon name="search" />
        <input placeholder="Search by patient name, ID, phone number or other identifier" />
        <button>Search all branches</button>
      </div>
      <div className="info-banner compact">
        <Icon name="patient" />
        <p>
          Patient discovery covers <strong>all ABC Diagnostic Centre branches</strong>, regardless
          of the branch currently in view.
        </p>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Patient directory</h3>
            <p>18,492 registered patients across 4 branches</p>
          </div>
          <button className="select-button">
            <Icon name="filter" size={15} /> All branches
          </button>
        </div>
        <DataTable
          headers={[
            "Patient",
            "Patient ID",
            "Registration branch",
            "Last visit",
            "Diagnostic orders",
            "",
          ]}
        >
          {patients.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="patient-name">
                  <span className="avatar">
                    {p.name
                      .split(" ")
                      .map((x) => x[0])
                      .join("")}
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.sex}</small>
                  </div>
                </div>
              </td>
              <td>
                <span className="mono">{p.id}</span>
              </td>
              <td>
                <span className="branch-pill">
                  <Icon name="building" size={14} />
                  {p.branch}
                </span>
              </td>
              <td>{p.last}</td>
              <td>{p.orders}</td>
              <td>
                <button className="table-action">View history</button>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </>
  );
}

function BillingPage() {
  return (
    <>
      <PageTitle eyebrow="Financial oversight" title="Billing & payments" actions={<Filters />} />
      <div className="financial-cards">
        <div>
          <span>Total billed</span>
          <strong>₦301.2m</strong>
          <small>Year to date</small>
        </div>
        <div>
          <span>Total collected</span>
          <strong>₦284.6m</strong>
          <small>94.5% collection rate</small>
        </div>
        <div>
          <span>Outstanding payments</span>
          <strong>₦16.6m</strong>
          <small>428 open balances</small>
        </div>
        <div>
          <span>Expenses</span>
          <strong>₦72.4m</strong>
          <small>Year to date</small>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Payment transactions</h3>
            <p>Company-wide financial history</p>
          </div>
          <div className="inline-tools">
            <SearchBox placeholder="Search transactions" />
            <button className="select-button">
              All branches <Icon name="down" size={14} />
            </button>
          </div>
        </div>
        <DataTable
          headers={[
            "Transaction",
            "Patient",
            "Branch",
            "Amount billed",
            "Collected",
            "Outstanding",
            "Method",
            "Date",
          ]}
        >
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>
                <strong className="mono">{t.id}</strong>
              </td>
              <td>{t.patient}</td>
              <td>{t.branch}</td>
              <td>{t.billed}</td>
              <td>
                <strong>{t.collected}</strong>
              </td>
              <td>
                <span className={t.balance !== "₦0" ? "amount-due" : ""}>{t.balance}</span>
              </td>
              <td>{t.method}</td>
              <td>{t.time}</td>
            </tr>
          ))}
        </DataTable>
      </div>
    </>
  );
}

function ReportsPage() {
  const reports = [
    ["Revenue reports", "Collected revenue, billed amounts and trends", "card"],
    ["Expense reports", "Operating expenses by category and branch", "chart"],
    ["Patient attendance", "Visit volumes and attendance trends", "patient"],
    ["Diagnostic services", "Service volumes and performance", "audit"],
    ["Branch performance", "Comparative operational overview", "building"],
    ["Referral reports", "Hospitals, doctors and referral sources", "users"],
    ["Payments & balances", "Transactions and outstanding balances", "card"],
  ];
  return (
    <>
      <PageTitle
        eyebrow="Business intelligence"
        title="Reports"
        actions={
          <>
            <button className="select-button">
              All branches <Icon name="down" size={14} />
            </button>
            <button className="select-button">
              This month <Icon name="down" size={14} />
            </button>
          </>
        }
      />
      <div className="report-grid">
        {reports.map((r) => (
          <button className="report-card" key={r[0]}>
            <span>
              <Icon name={r[2]} />
            </span>
            <div>
              <h3>{r[0]}</h3>
              <p>{r[1]}</p>
            </div>
            <Icon name="chevron" size={17} />
          </button>
        ))}
      </div>
      <div className="panel report-preview">
        <div className="panel-head">
          <div>
            <h3>Revenue report preview</h3>
            <p>All branches · 1–30 June 2025</p>
          </div>
          <div className="title-actions">
            <Button secondary>
              <Icon name="download" size={16} /> PDF
            </Button>
            <Button secondary>
              <Icon name="download" size={16} /> CSV
            </Button>
          </div>
        </div>
        <TrendChart />
      </div>
    </>
  );
}

function SettingsPage({
  openSetup,
  openReceipt,
}: {
  openSetup: () => void;
  openReceipt: () => void;
}) {
  const menu = [
    "Company profile",
    "Logo & branding",
    "Company owner",
    "Branch configuration",
    "Users & permissions",
    "Application preferences",
  ];
  const [section, setSection] = useState("Company profile");
  return (
    <>
      <PageTitle eyebrow="Company configuration" title="Settings" />
      <div className="settings-layout">
        <div className="settings-nav">
          {menu.map((m) => (
            <button className={m === section ? "active" : ""} onClick={() => setSection(m)} key={m}>
              {m}
              <Icon name="chevron" size={14} />
            </button>
          ))}
        </div>
        <div className="settings-content">
          <div className="panel-head">
            <div>
              <h3>{section}</h3>
              <p>Manage company-level identity and operational preferences.</p>
            </div>
            <Button>Save changes</Button>
          </div>
          {section === "Logo & branding" ? (
            <div className="branding-section">
              <div className="upload-card">
                <div className="logo-preview">
                  <Logo compact />
                </div>
                <div>
                  <h3>Official company logo</h3>
                  <p>PNG · Used across all branches, receipts and company documents.</p>
                  <div className="title-actions">
                    <Button secondary>
                      <Icon name="upload" size={16} /> Replace logo
                    </Button>
                    <button className="text-button" onClick={openSetup}>
                      View setup flow
                    </button>
                  </div>
                </div>
              </div>
              <div className="receipt-setting">
                <div>
                  <h3>Automatic receipt branding</h3>
                  <p>Preview how company and branch information appears on generated receipts.</p>
                </div>
                <Button secondary onClick={openReceipt}>
                  Preview receipt
                </Button>
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <label>
                Company name
                <input value="ABC Diagnostic Centre" readOnly />
              </label>
              <label>
                Company owner
                <input value="Amina Bello" readOnly />
              </label>
              <label>
                Primary country
                <input value="Nigeria" readOnly />
              </label>
              <label>
                Company status
                <input value="Active" readOnly />
              </label>
              <label className="full">
                Registered address
                <textarea value="14 Adeola Odeku Street, Victoria Island, Lagos" readOnly />
              </label>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function AuditPage() {
  const rows = [
    [
      "Tunde Afolabi",
      "Branch Manager",
      "Wuse II",
      "Price changed",
      "X-ray service",
      "₦18,000 → ₦20,000",
      "Today, 10:12",
    ],
    [
      "Amina Bello",
      "Company Admin",
      "Victoria Island",
      "Staff created",
      "Chinwe Eze",
      "Radiography staff account",
      "Today, 09:46",
    ],
    [
      "Sarah Adeyemi",
      "Branch Manager",
      "Victoria Island",
      "Payment recorded",
      "TXN-84291",
      "₦32,500 via POS",
      "Today, 09:48",
    ],
    [
      "Amina Bello",
      "Company Admin",
      "Lokoja Central",
      "Branch registered",
      "Lokoja Central",
      "New active branch",
      "10 Jun, 14:32",
    ],
    [
      "Tamuno Briggs",
      "Branch Manager",
      "GRA",
      "Service added",
      "Thyroid Function Test",
      "Initial price ₦19,500",
      "09 Jun, 11:18",
    ],
  ];
  return (
    <>
      <PageTitle
        eyebrow="Read-only record"
        title="Audit log"
        actions={
          <Button secondary>
            <Icon name="download" size={16} /> Export log
          </Button>
        }
      />
      <div className="audit-filters">
        <SearchBox placeholder="Search user or record" />
        {["All branches", "All users", "All actions", "Date range"].map((x) => (
          <button className="select-button" key={x}>
            {x}
            <Icon name="down" size={14} />
          </button>
        ))}
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Company activity records</h3>
            <p>Read-only history across all branches</p>
          </div>
          <Badge tone="neutral">12,438 records</Badge>
        </div>
        <DataTable
          headers={[
            "User",
            "Role",
            "Branch",
            "Action",
            "Affected record",
            "Change details",
            "Date & time",
          ]}
        >
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>
                  {j === 0 ? <strong>{c}</strong> : j === 3 ? <Badge tone="neutral">{c}</Badge> : c}
                </td>
              ))}
            </tr>
          ))}
        </DataTable>
      </div>
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="modal-layer" onMouseDown={onClose}>
      <div className={`modal ${wide ? "wide-modal" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function AddBranch({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Add new branch" onClose={onClose} wide>
      <div className="inherited-brand">
        <Logo />
        <span>
          <Icon name="check" size={15} /> Official company branding inherited
        </span>
      </div>
      <div className="form-grid">
        <label>
          Branch name
          <input placeholder="e.g. Ikeja Branch" />
        </label>
        <label>
          Country
          <select>
            <option>Nigeria</option>
            <option>Ghana</option>
            <option>Kenya</option>
          </select>
        </label>
        <label>
          State / Region / Province
          <select>
            <option>Select state</option>
            <option>Lagos</option>
            <option>Abuja FCT</option>
          </select>
        </label>
        <label>
          Branch phone number
          <input placeholder="+234" />
        </label>
        <label className="full">
          Complete physical branch address
          <textarea placeholder="Street, building, area and other relevant location details" />
        </label>
      </div>
      <div className="optional-section">
        <div>
          <span>Optional</span>
          <h3>Initial staffing</h3>
          <p>You can create this branch now and assign staff later.</p>
        </div>
        <label className="check-row">
          <input type="checkbox" /> Assign a branch manager after creation
        </label>
        <label className="check-row">
          <input type="checkbox" /> Begin branch staffing setup
        </label>
      </div>
      <div className="modal-actions">
        <Button secondary onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onClose}>Create branch</Button>
      </div>
    </Modal>
  );
}

function SetupFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  return (
    <Modal title="Company setup" onClose={onClose} wide>
      <div className="setup-progress">
        <span className={step >= 1 ? "done" : ""}>1</span>
        <i />
        <span className={step >= 2 ? "done" : ""}>2</span>
        <div>
          <b>{step === 1 ? "Register company" : "Upload company logo"}</b>
          <small>Step {step} of 2</small>
        </div>
      </div>
      {step === 1 ? (
        <div className="setup-content">
          <div className="setup-copy">
            <span>STANLEY</span>
            <h2>Establish your company workspace</h2>
            <p>Start with the two essential details. Branding and branch setup follow next.</p>
          </div>
          <div className="form-stack">
            <label>
              Company name
              <input defaultValue="ABC Diagnostic Centre" />
            </label>
            <label>
              Company owner's full name
              <input defaultValue="Amina Bello" />
            </label>
          </div>
        </div>
      ) : (
        <div className="setup-content">
          <div className="setup-copy">
            <span>OFFICIAL BRANDING</span>
            <h2>Upload your company logo</h2>
            <p>
              This PNG becomes the official identity across all branches, receipts and documents.
            </p>
          </div>
          <div className="logo-drop">
            <Icon name="upload" size={28} />
            <strong>Drop company logo here</strong>
            <p>PNG only · Recommended 512 × 512px</p>
            <Button secondary>Choose PNG file</Button>
          </div>
        </div>
      )}
      <div className="modal-actions">
        <small className="powered">Powered by Stanley</small>
        {step === 2 && (
          <Button secondary onClick={() => setStep(1)}>
            Back
          </Button>
        )}
        <Button onClick={() => (step === 1 ? setStep(2) : onClose())}>
          {step === 1 ? "Continue to branding" : "Complete setup"}
        </Button>
      </div>
    </Modal>
  );
}

function ReceiptPreview({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Receipt branding preview" onClose={onClose} wide>
      <div className="receipt-shell">
        <div className="receipt">
          <div className="receipt-head">
            <Logo />
            <div>
              <strong>Victoria Island Branch</strong>
              <span>Lagos, Nigeria</span>
              <span>14 Adeola Odeku Street, Victoria Island</span>
              <span>+234 802 555 0194</span>
            </div>
          </div>
          <div className="receipt-title">
            <h2>Payment Receipt</h2>
            <span>RECEIPT NO. RC-2025-084291</span>
          </div>
          <div className="receipt-meta">
            <div>
              <span>Patient</span>
              <strong>Adaobi Nwosu</strong>
            </div>
            <div>
              <span>Patient ID</span>
              <strong>ABC-001982</strong>
            </div>
            <div>
              <span>Date</span>
              <strong>12 Jun 2025, 09:48</strong>
            </div>
            <div>
              <span>Payment method</span>
              <strong>POS</strong>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Diagnostic service</th>
                <th>Qty</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Full Blood Count</td>
                <td>1</td>
                <td>₦8,500</td>
              </tr>
              <tr>
                <td>Abdominal Ultrasound</td>
                <td>1</td>
                <td>₦24,000</td>
              </tr>
            </tbody>
          </table>
          <div className="receipt-total">
            <span>Total paid</span>
            <strong>₦32,500</strong>
          </div>
          <div className="receipt-foot">
            Thank you for choosing ABC Diagnostic Centre.
            <br />
            This is a computer-generated receipt.
          </div>
        </div>
      </div>
      <div className="modal-actions">
        <Button secondary>
          <Icon name="download" size={16} /> Download PDF
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

function Notifications({ onClose, openBranch }: { onClose: () => void; openBranch: () => void }) {
  return (
    <div className="drawer-layer" onMouseDown={onClose}>
      <aside className="notification-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h2>Notifications</h2>
            <p>4 unread administrative updates</p>
          </div>
          <button onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer-tabs">
          <button className="active">All</button>
          <button>Unread</button>
          <button>Requests</button>
        </div>
        <button className="notification important" onClick={openBranch}>
          <span className="notification-icon">
            <Icon name="card" />
          </span>
          <div>
            <div>
              <strong>Service price updated</strong>
              <time>12 min ago</time>
            </div>
            <p>Wuse II Branch updated the X-ray service price.</p>
            <dl>
              <div>
                <dt>Previous</dt>
                <dd>₦18,000</dd>
              </div>
              <div>
                <dt>New price</dt>
                <dd>₦20,000</dd>
              </div>
              <div>
                <dt>Changed by</dt>
                <dd>Tunde Afolabi</dd>
              </div>
              <div>
                <dt>Date & time</dt>
                <dd>12 Jun, 10:12</dd>
              </div>
            </dl>
            <span className="inspect-link">
              Inspect branch price history <Icon name="chevron" size={14} />
            </span>
          </div>
        </button>
        {[
          "New service added at GRA Branch",
          "New manager assigned at Lokoja Central",
          "Staff account deactivated at Victoria Island",
        ].map((n, i) => (
          <button className="notification" key={n}>
            <span className="notification-icon">
              <Icon name={i === 1 ? "users" : "audit"} />
            </span>
            <div>
              <div>
                <strong>{n}</strong>
                <time>{i + 2} hrs ago</time>
              </div>
              <p>
                {i === 0
                  ? "Thyroid Function Test is now available."
                  : i === 1
                    ? "Esther Omale assigned by Company Admin."
                    : "Michael Ekanem account was deactivated."}
              </p>
            </div>
          </button>
        ))}
      </aside>
    </div>
  );
}

function AppShell({ theme }: { theme: Theme }) {
  const [page, setPage] = useState<Page>("Dashboard");
  const [collapsed, setCollapsed] = useState(true);
  const [notifications, setNotifications] = useState(false);
  const [branch, setBranch] = useState<string | null>(null);
  const [staffBranch, setStaffBranch] = useState<string | null>(null);
  const [addBranch, setAddBranch] = useState(false);
  const [setup, setSetup] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const reduced = Boolean(useReducedMotion());

  function navigate(p: Page) {
    setPage(p);
    setBranch(null);
    setStaffBranch(null);
  }
  let content: ReactNode;
  if (branch) content = <BranchWorkspace branch={branch} onBack={() => setBranch(null)} />;
  else if (page === "Dashboard") content = <Dashboard />;
  else if (page === "Branches")
    content = <BranchesPage onOpen={setBranch} onAdd={() => setAddBranch(true)} />;
  else if (page === "Staff Management")
    content = <StaffPage selected={staffBranch} setSelected={setStaffBranch} />;
  else if (page === "Patients") content = <PatientsPage />;
  else if (page === "Billing & Payments") content = <BillingPage />;
  else if (page === "Reports") content = <ReportsPage />;
  else if (page === "Settings")
    content = (
      <SettingsPage openSetup={() => setSetup(true)} openReceipt={() => setReceipt(true)} />
    );
  else content = <AuditPage />;
  const pageKey = branch ? `branch-${branch}` : staffBranch ? `staff-${staffBranch}` : page;

  return (
    <div className={`app theme-${theme} ${collapsed ? "sidebar-collapsed" : ""}`}>
      <motion.aside
        className="sidebar"
        variants={sidebarVariants}
        initial="hidden"
        animate="visible"
        custom={reduced}
      >
        <div className="sidebar-brand">
          <Logo compact={collapsed} />
          <motion.button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            whileTap={tapButton}
          >
            <PanelLeftClose size={18} />
          </motion.button>
        </div>
        <nav>
          {navItems.map((item) => {
            const NavIcon = item.icon;
            const active = page === item.label && !branch;
            return (
              <motion.button
                className={active ? "active" : ""}
                onClick={() => navigate(item.label)}
                key={item.label}
                whileTap={tapButton}
                aria-label={item.label}
              >
                <NavIcon size={18} strokeWidth={1.8} />
                {!collapsed && <span>{item.label}</span>}
                <AnimatePresence>
                  {collapsed && active && (
                    <motion.em
                      className="nav-active-pill"
                      initial={reduced ? { opacity: 0 } : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                      transition={{ duration: 0.24, ease: premiumEase }}
                    >
                      {item.label}
                    </motion.em>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-box">
            <span>Need assistance?</span>
            <strong>Stanley Support</strong>
            <button>Contact support</button>
          </div>
          <div className="powered-mark">
            Powered by <b>STANLEY</b>
          </div>
        </div>
      </motion.aside>
      <div className="workspace">
        <header>
          <div className="header-company">
            <button
              className="context-button"
              onClick={() => {
                setPage("Branches");
                setBranch(null);
              }}
              title="Choose company or branch context"
            >
              <span>{branch ? "Branch context" : "Company context"}</span>
              <strong>{branch ? `${branch} Branch` : "All branches"}</strong>
              <Icon name="down" size={14} />
            </button>
          </div>
          <div className="header-actions">
            <div className="global-search">
              <Search size={17} />
              <input placeholder="Search patients across all branches" />
              <kbd>⌘ K</kbd>
            </div>
            <motion.button
              className="icon-button notification-button"
              onClick={() => setNotifications(true)}
              whileTap={tapButton}
            >
              <Bell size={18} />
              <i />
            </motion.button>
            <span className="divider" />
            <button className="profile-button">
              <span className="avatar">AB</span>
              <span>
                <strong>Amina Bello</strong>
                <small>Company Admin</small>
              </span>
              <Icon name="down" size={14} />
            </button>
          </div>
        </header>
        <main>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className="page-motion-shell"
              key={pageKey}
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              custom={reduced}
            >
              {content}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {notifications && (
        <Notifications
          onClose={() => setNotifications(false)}
          openBranch={() => {
            setNotifications(false);
            setPage("Branches");
            setBranch("Wuse II");
          }}
        />
      )}
      {addBranch && <AddBranch onClose={() => setAddBranch(false)} />}
      {setup && <SetupFlow onClose={() => setSetup(false)} />}
      {receipt && <ReceiptPreview onClose={() => setReceipt(false)} />}
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>("c");
  return (
    <>
      <div className="design-switcher">
        <div>
          <span>STANLEY</span>
          <strong>Company Admin Dashboard — Visual Directions</strong>
        </div>
        <div className="design-options">
          <button className={theme === "a" ? "active" : ""} onClick={() => setTheme("a")}>
            <i className="swatch blue" />
            Design A <span>Clinical Blue</span>
          </button>
          <button className={theme === "b" ? "active" : ""} onClick={() => setTheme("b")}>
            <i className="swatch teal" />
            Design B <span>Minimal Neutral</span>
          </button>
          <button className={theme === "c" ? "active" : ""} onClick={() => setTheme("c")}>
            <i className="swatch green" />
            Design C <span>Medical Green</span>
          </button>
        </div>
      </div>
      <AppShell key={theme} theme={theme} />
    </>
  );
}
