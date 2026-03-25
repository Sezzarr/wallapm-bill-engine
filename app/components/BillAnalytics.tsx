'use client'

import {
  BarChart, Bar, Cell,
  PieChart, Pie, Label,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

type Bill = {
  amount: number | null
  utility_type: string | null
  status: string
  created_at: string
}

// ── Colour palettes ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending:   '#fbbf24',  // amber-400
  matched:   '#60a5fa',  // blue-400
  processed: '#34d399',  // emerald-400
  error:     '#f87171',  // red-400
  unmatched: '#71717a',  // zinc-500
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', matched: 'Matched', processed: 'Processed',
  error: 'Error', unmatched: 'Unmatched',
}

const UTILITY_COLORS: Record<string, string> = {
  electric: '#fbbf24',  // amber
  gas:      '#f97316',  // orange
  water:    '#60a5fa',  // blue
  telecom:  '#a78bfa',  // violet
  waste:    '#4ade80',  // green
}

// ── Shared chart config ──────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '8px',
  fontSize: 12,
}
const TOOLTIP_LABEL_STYLE = { color: '#a1a1aa', marginBottom: 4, fontSize: 12 }
const TOOLTIP_ITEM_STYLE  = { color: '#e4e4e7' }
const TICK = { fill: '#52525b', fontSize: 11 }
const GRID = { vertical: false, strokeDasharray: '3 3', stroke: '#27272a' } as const

function shortUSD(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${Math.round(v)}`
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BillAnalytics({ bills }: { bills: Bill[] }) {

  // Spend by utility type
  const utilityMap = bills.reduce<Record<string, number>>((acc, b) => {
    if (b.amount == null) return acc
    const key = b.utility_type ?? 'unknown'
    acc[key] = (acc[key] ?? 0) + b.amount
    return acc
  }, {})
  const utilityData = Object.entries(utilityMap)
    .map(([key, amount]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      amount,
      fill: UTILITY_COLORS[key] ?? '#6366f1',
    }))
    .sort((a, b) => b.amount - a.amount)

  // Bills by status
  const statusMap = bills.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1
    return acc
  }, {})
  const statusData = Object.entries(statusMap).map(([status, count]) => ({
    name:  STATUS_LABELS[status] ?? status,
    value: count,
    fill:  STATUS_COLORS[status] ?? '#71717a',
  }))

  // Ingestion over time (monthly)
  const timeMap = bills.reduce<Record<string, number>>((acc, b) => {
    const d   = new Date(b.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    acc[key]  = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const timeData = Object.entries(timeMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [year, month] = key.split('-')
      return {
        label: new Date(Number(year), Number(month) - 1).toLocaleDateString('en-US', {
          month: 'short', year: 'numeric',
        }),
        count,
      }
    })

  const grandTotal = bills.reduce((s, b) => s + (b.amount ?? 0), 0)
  const totalBills = bills.length

  return (
    <div className="space-y-4">

      {/* ── Summary line ── */}
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold tabular-nums text-zinc-100">
          {new Intl.NumberFormat('en-US', {
            style: 'currency', currency: 'USD', maximumFractionDigits: 0,
          }).format(grandTotal)}
        </span>
        <span className="text-sm text-zinc-500">
          total across {totalBills} bill{totalBills !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Charts grid ── */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Spend by utility type */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 lg:col-span-2">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Spend by Utility Type
          </h3>
          {utilityData.length === 0 ? (
            <p className="text-sm text-zinc-700">No amount data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={utilityData} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={shortUSD} tick={TICK} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  cursor={{ fill: '#27272a' }}
                  formatter={(v) => [
                    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v)),
                    'Amount',
                  ]}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {utilityData.map((d) => (
                    <Cell key={d.name} fill={d.fill} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bills by status */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Bills by Status
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={76}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {statusData.map((d) => (
                  <Cell key={d.name} fill={d.fill} fillOpacity={0.85} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    const pv = viewBox as { cx?: number; cy?: number } | undefined
                    if (!Number.isFinite(pv?.cx) || !Number.isFinite(pv?.cy)) return null
                    const { cx, cy } = pv
                    return (
                      <text textAnchor="middle">
                        <tspan x={cx} y={cy - 6} fill="#e4e4e7" fontSize={22} fontWeight={600}>
                          {totalBills}
                        </tspan>
                        <tspan x={cx} y={cy + 14} fill="#71717a" fontSize={11}>
                          bills
                        </tspan>
                      </text>
                    )
                  }}
                  position="center"
                />
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                formatter={(v, name) => [v, name]}
                cursor={false}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {statusData.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.fill }} />
                <span className="text-xs text-zinc-500">{s.name}</span>
                <span className="text-xs font-medium tabular-nums text-zinc-400">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ingestion over time */}
        {timeData.length > 1 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 lg:col-span-3">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Bills Ingested Over Time
            </h3>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={timeData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="billsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  cursor={{ stroke: '#3f3f46', strokeWidth: 1 }}
                  formatter={(v) => [v, 'Bills']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#billsGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#6366f1', stroke: '#18181b', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>
    </div>
  )
}
