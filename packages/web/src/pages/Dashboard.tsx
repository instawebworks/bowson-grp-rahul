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

const stageShort = (s: string) => {
  const i = (GRP_STAGES as readonly string[]).indexOf(s);
  return i >= 0 ? STAGE_SHORT[i] : s.replace(/^\d+\.\s*/, "");
};

export function Dashboard() {
  const { data, isLoading } = useDashboard();
  const { data: sched } = useSchedule();
  const navigate = useNavigate();
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
            sub="MADE & assembly live"
            tone="green"
          />
          <Metric
            label="Parts in Production"
            value={f(data?.tickets.partsInProduction)}
            sub="PART tickets live"
            tone="blue"
          />
          <Metric
            label="Moulds in Use"
            value={data ? `${data.moulds.inUse}/${data.moulds.total}` : "…"}
            sub={`${data?.moulds.utilisation ?? 0}% utilisation`}
            tone={data && data.moulds.utilisation >= 80 ? "amber" : "default"}
          />
          <Metric
            label="Total Man Hours"
            value={data ? data.tickets.manHours.toFixed(2) : "…"}
            sub="hrs remaining"
            tone="amber"
          />
        </div>

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
                  onClick={() => navigate(`/orders/${o.id}`)}
                >
                  <td className="px-3 py-2 font-semibold">{o.orderNumber}</td>
                  <td className="px-3 py-2 text-text2">{o.customer ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-text2">
                    {o.items}
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
          const pct = r.trained > 0 ? Math.round((r.available / r.trained) * 100) : 0;
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
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
