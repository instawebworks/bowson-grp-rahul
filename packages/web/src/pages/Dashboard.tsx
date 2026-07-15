import { useNavigate } from "react-router-dom";
import { STAGE_SHORT, GRP_STAGES } from "@bowson/shared";
import { useDashboard, useSchedule } from "../lib/hooks";
import {
  Card,
  Content,
  Metric,
  PageHeader,
  ProgressBar,
  Table,
} from "../components/ui";
import { fmtDate } from "../lib/format";
import { ItemBadges } from "../components/ItemBadges";
import { useOpenOrder } from "../lib/useOpenOrder";

const stageShort = (s: string) => {
  const i = (GRP_STAGES as readonly string[]).indexOf(s);
  return i >= 0 ? STAGE_SHORT[i] : s.replace(/^\d+\.\s*/, "");
};

export function Dashboard() {
  const { data, isLoading } = useDashboard();
  const { data: sched } = useSchedule();
  const navigate = useNavigate();
  const openOrder = useOpenOrder();
  const f = (n: number | undefined) =>
    isLoading || n === undefined ? "…" : String(n);

  return (
    <>
      <PageHeader title="Dashboard" />
      <Content>
        {/* ── Metrics row ── */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6">
          <Metric
            label="Active Orders"
            value={f(data?.orders.active)}
            sub={`${data?.orders.overdue ?? 0} overdue`}
            tone={data && data.orders.overdue > 0 ? "red" : "default"}
          />
          <Metric
            label="Orders Pending"
            value={f(data?.orders.pending)}
            sub="awaiting release"
            tone={data && data.orders.pending > 0 ? "amber" : "default"}
          />
          <Metric
            label="Slides in Production"
            value={f(data?.tickets.slidesInProduction)}
            sub="MADE & assembly tickets live"
            tone="green"
          />
          <Metric
            label="Parts in Production"
            value={f(data?.tickets.partsInProduction)}
            sub="PART tickets live"
            tone="blue"
          />
          <div
            className="cursor-pointer"
            title="Open Mould Planner"
            onClick={() => navigate("/moulds")}
          >
            <Metric
              label="Moulds in Use"
              value={data ? `${data.moulds.inUse}/${data.moulds.total}` : "…"}
              sub={`${data?.moulds.utilisation ?? 0}% utilisation`}
              tone={data && data.moulds.utilisation >= 80 ? "amber" : "default"}
            />
          </div>
          <Metric
            label="Total Man Hours"
            value={data ? data.tickets.manHours.toFixed(2) : "…"}
            sub="hrs remaining"
            tone="amber"
          />
        </div>

        {/* ── Production blockers (ported from the prototype dashboard) ── */}
        {(data?.blockers.maintenance.length ?? 0) > 0 && (
          <BlockerPanel
            tone="red"
            title="⚠ Cannot Produce — Mould in Maintenance"
            sub={`${data!.blockers.maintenance.length} ticket${data!.blockers.maintenance.length !== 1 ? "s" : ""} assigned to a mould that's currently out of action. Wait for repair, or reassign to another mould.`}
            rows={data!.blockers.maintenance.map((b) => ({
              ...b,
              badge: b.mouldRef,
              note: b.mouldNotes || "In maintenance",
            }))}
            onOpenPlanner={() => navigate("/moulds")}
            onOpenOrder={(oid) => openOrder(oid)}
          />
        )}
        {(data?.blockers.noMould.length ?? 0) > 0 && (
          <BlockerPanel
            tone="amber"
            title="⚠ Cannot Produce — No Mould Assigned"
            sub={`${data!.blockers.noMould.length} ticket${data!.blockers.noMould.length !== 1 ? "s" : ""} without a mould. Link the catalogue part to a mould (recommended), or assign one to this ticket directly.`}
            rows={data!.blockers.noMould.map((b) => ({
              ...b,
              badge: "— No mould —",
              note: "Assign a mould",
            }))}
            onOpenPlanner={() => navigate("/moulds")}
            onOpenOrder={(oid) => openOrder(oid)}
          />
        )}

        {/* ── Overdue orders ── */}
        {(data?.overdueOrders.length ?? 0) > 0 && (
          <div className="mb-4">
            <div className="mb-1.5 text-[11px] font-bold text-red">
              ⚠ Overdue Orders
            </div>
            <Card>
              <Table head={["Order", "Customer", "Status", "Deadline", "Over"]}>
                {data!.overdueOrders.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40"
                    onClick={() => openOrder(o.id)}
                  >
                    <td className="px-3 py-2 font-bold text-teal">
                      {o.orderNumber}
                    </td>
                    <td className="max-w-40 truncate px-3 py-2 text-text2">
                      {o.customer ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[11px]">{o.status}</td>
                    <td className="px-3 py-2 text-[11px] font-semibold text-red">
                      {o.deadline}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-semibold text-red">
                      +{o.daysOver}d
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        )}

        {/* ── Recent orders + hours by stage ── */}
        <div className="mb-4 grid gap-3 lg:grid-cols-[2fr_1fr]">
          <Card title="Recent Orders">
            <Table
              head={["Order", "Customer", "Items", "Progress", "Deadline"]}
            >
              {(data?.recentOrders.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-xs text-text3"
                  >
                    No orders yet.
                  </td>
                </tr>
              )}
              {(data?.recentOrders ?? []).map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40"
                  onClick={() => openOrder(o.id)}
                >
                  <td className="px-3 py-2 font-semibold">{o.orderNumber}</td>
                  <td className="px-3 py-2 text-text2">{o.customer ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <ItemBadges counts={o.items} />
                  </td>
                  <td className="px-3 py-2">
                    <ProgressBar pct={o.progress} />
                  </td>
                  <td className="px-3 py-2 text-text2">
                    {fmtDate(o.deadline)}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Hours Remaining by Stage">
            <div className="p-3">
              {(data?.hoursByStage.length ?? 0) === 0 ? (
                <div className="py-6 text-center text-xs text-text3">
                  No tickets in production
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(data?.hoursByStage ?? []).map((h) => (
                    <div
                      key={h.stage}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-text2">{stageShort(h.stage)}</span>
                      <span className="font-semibold tabular-nums">
                        {h.hrs}h
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── 8-week summary + lead time ── */}
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <Card title="8-Week Capacity Summary">
            <div className="p-3.5">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span
                  className="text-[22px] font-bold"
                  style={{ color: capColor(data?.capacity.utilisation8 ?? 0) }}
                >
                  {data?.capacity.committed8 ?? 0}h
                </span>
                <span className="text-xs text-text3">
                  committed of {data?.capacity.totalCapacity8 ?? 0}h available
                </span>
              </div>
              <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-surface2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, data?.capacity.utilisation8 ?? 0)}%`,
                    backgroundColor: capColor(data?.capacity.utilisation8 ?? 0),
                  }}
                />
              </div>
              <div className="text-[11px] text-text3">
                {data?.capacity.utilisation8 ?? 0}% utilisation
              </div>
            </div>
          </Card>
          <Card title="Current Lead Time (Slides)">
            <div className="p-3.5">
              <div
                className="text-[28px] font-bold"
                style={{ color: "var(--color-teal)" }}
              >
                {data?.capacity.leadTimeWeeks == null
                  ? "No capacity set"
                  : data.tickets.manHours === 0
                    ? "No work in production"
                    : `${data.capacity.leadTimeWeeks} weeks`}
              </div>
              <div className="mt-1 text-[11px] text-text3">
                {data && data.tickets.manHours > 0
                  ? `${data.tickets.manHours.toFixed(2)}h remaining across available weeks`
                  : "No work in production"}
              </div>
            </div>
          </Card>
        </div>

        {/* ── 8-week capacity grid ── */}
        <div className="mb-2 text-[11px] font-bold">
          Production Capacity — Next 8 Weeks
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {(sched?.weeks.slice(0, 8) ?? []).map((w, i) => {
            const over = w.utilisation > 100;
            return (
              <div
                key={w.key}
                className={`rounded-lg border bg-surface p-2.5 ${over ? "border-red" : i === 0 ? "border-teal" : "border-border"}`}
              >
                <div
                  className="mb-1 text-[10px] font-bold"
                  style={{
                    color: i === 0 ? "var(--color-teal)" : "var(--color-text3)",
                  }}
                >
                  {w.wc}
                  {i === 0 ? " ★" : ""}
                </div>
                <div className="flex items-baseline justify-between">
                  <span
                    className="text-[13px] font-bold"
                    style={{ color: capColor(w.utilisation) }}
                  >
                    {w.committedHrs}h
                  </span>
                  <span className="text-[10px] text-text3">
                    / {w.capacityHrs}h
                  </span>
                </div>
                <div className="my-1 h-1 overflow-hidden rounded-full bg-surface2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, w.utilisation)}%`,
                      backgroundColor: capColor(w.utilisation),
                    }}
                  />
                </div>
                <div className="text-[10px] text-text3">
                  {w.ticketCount} ticket{w.ticketCount === 1 ? "" : "s"}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Stage capacity (this/next week) ── */}
        <div className="mb-2 text-[11px] font-bold">Stage Capacity</div>
        <div className="grid gap-3.5 md:grid-cols-2">
          <StageCapBlock
            label={`This week — ${data?.thisWeek ?? ""}`}
            rows={data?.stageCapacity.thisWeek ?? []}
          />
          <StageCapBlock
            label={`Next week — ${data?.nextWeek ?? ""}`}
            rows={data?.stageCapacity.nextWeek ?? []}
          />
        </div>
      </Content>
    </>
  );
}

function capColor(util: number): string {
  if (util > 100) return "var(--color-red)";
  if (util > 85) return "var(--color-amber)";
  return "var(--color-teal)";
}

function StageCapBlock({
  label,
  rows,
}: {
  label: string;
  rows: { stage: string; trained: number; available: number }[];
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {rows.map((r) => {
          // Number greys out when nobody is trained; the top border is always
          // red/amber/teal by availability (matches t-card.html stageCapRow).
          const col =
            r.trained === 0
              ? "var(--color-text3)"
              : r.available === 0
                ? "var(--color-red)"
                : r.available < r.trained
                  ? "var(--color-amber)"
                  : "var(--color-teal)";
          const borderCol =
            r.available === 0
              ? "var(--color-red)"
              : r.available < r.trained
                ? "var(--color-amber)"
                : "var(--color-teal)";
          const pct =
            r.trained > 0 ? Math.round((r.available / r.trained) * 100) : 0;
          return (
            <div
              key={r.stage}
              className="rounded-lg border border-border bg-surface p-2"
              style={{ borderTop: `3px solid ${borderCol}` }}
            >
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-text3">
                {stageShort(r.stage)}
              </div>
              <div className="mb-1 flex items-baseline gap-1">
                <span className="text-[20px] font-bold" style={{ color: col }}>
                  {r.available}
                </span>
                <span className="text-[13px] text-text3">/{r.trained}</span>
                <span className="ml-1 text-[9px] text-text3">in today</span>
              </div>
              <div className="h-[3px] rounded-full bg-surface2">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: col }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "Cannot Produce" alert panel (ported from the prototype's blockerRow). */
function BlockerPanel({
  tone,
  title,
  sub,
  rows,
  onOpenPlanner,
  onOpenOrder,
}: {
  tone: "red" | "amber";
  title: string;
  sub: string;
  rows: {
    id: number;
    tn: number | null;
    detail: string;
    status: string;
    orderId: number;
    orderNumber: string | null;
    siteName: string | null;
    badge: string;
    note: string;
  }[];
  onOpenPlanner: () => void;
  onOpenOrder: (orderId: number) => void;
}) {
  const colour = tone === "red" ? "var(--color-red)" : "var(--color-amber)";
  return (
    <div className="mb-4">
      <div
        className="rounded-lg border px-4 py-3.5"
        style={{
          borderColor: colour,
          background:
            tone === "red" ? "rgba(239,68,68,.05)" : "rgba(245,158,11,.05)",
        }}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <div
            className="text-xs font-extrabold uppercase tracking-wide"
            style={{ color: colour }}
          >
            {title}
          </div>
          <button
            onClick={onOpenPlanner}
            className="rounded-md border border-border2 bg-surface px-2.5 py-1 text-[11px] font-medium hover:bg-surface2"
          >
            Open Mould Planner →
          </button>
        </div>
        <div className="mb-2.5 text-[11px] text-text3">{sub}</div>
        {rows.slice(0, 5).map((r) => (
          <div
            key={r.id}
            onClick={() => onOpenOrder(r.orderId)}
            className="flex cursor-pointer items-center justify-between border-b border-border py-1.5 text-xs last:border-0 hover:bg-teal-l/20"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">
                #{r.tn ?? "TBC"} {r.detail}
              </div>
              <div className="mt-0.5 text-[10px] text-text3">
                {r.orderNumber ?? "—"}
                {r.siteName ? ` · ${r.siteName}` : ""} ·{" "}
                {r.status.replace(/^\d+\.\s*/, "")}
              </div>
            </div>
            <div className="ml-2.5 shrink-0 text-right">
              <div className="text-[11px] font-bold" style={{ color: colour }}>
                {r.badge}
              </div>
              <div className="text-[9px] italic text-text3">{r.note}</div>
            </div>
          </div>
        ))}
        {rows.length > 5 && (
          <div className="mt-1.5 text-center text-[10px] text-text3">
            …and {rows.length - 5} more — see Mould Planner
          </div>
        )}
      </div>
    </div>
  );
}
