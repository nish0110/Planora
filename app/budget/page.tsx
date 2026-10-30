'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Download, LoaderCircle, TrendingUp, Wallet } from 'lucide-react';

type EventBudget = {
  event_id: number | string;
  event_name: string;
  total_budget: number | string;
  status: string;
};

type Allocation = {
  allocation_id: number | string;
  event_id: number | string;
  event_name: string;
  resource_name: string;
  type_name: string;
  allocation_status: string;
  total_cost: number | string;
  start_datetime: string;
};

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function BudgetPage() {
  const [events, setEvents] = useState<EventBudget[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [eventResponse, allocationResponse] = await Promise.all([
          fetch('/api/events', { signal: controller.signal }),
          fetch('/api/allocations', { signal: controller.signal }),
        ]);
        const [eventBody, allocationBody] = await Promise.all([eventResponse.json(), allocationResponse.json()]);

        if (!eventResponse.ok) throw new Error(eventBody.error || 'Could not load event budgets.');
        if (!allocationResponse.ok) throw new Error(allocationBody.error || 'Could not load resource allocations.');

        setEvents(eventBody.data);
        setAllocations(allocationBody.data);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Could not load budget data.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => controller.abort();
  }, []);

  const plannedBudget = events.reduce((total, event) => total + Number(event.total_budget || 0), 0);
  const confirmedAllocations = useMemo(
    () => allocations.filter((allocation) => allocation.allocation_status === 'CONFIRMED'),
    [allocations],
  );
  const allocatedCost = confirmedAllocations.reduce((total, allocation) => total + Number(allocation.total_cost || 0), 0);
  const remaining = plannedBudget - allocatedCost;
  const allocationRate = plannedBudget > 0 ? Math.min(100, Math.round((allocatedCost / plannedBudget) * 100)) : 0;

  function exportReport() {
    const rows = [
      ['Event', 'Resource', 'Category', 'Allocation status', 'Allocated cost', 'Start date'],
      ...allocations.map((allocation) => [
        allocation.event_name,
        allocation.resource_name,
        allocation.type_name,
        allocation.allocation_status,
        Number(allocation.total_cost).toFixed(2),
        new Date(allocation.start_datetime).toISOString(),
      ]),
    ];

    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'planora-resource-allocations.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <>
    <header className="topbar">
      <div><div className="eyebrow">YOUR WORKSPACE / FINANCE</div><h1>Budget & reports</h1><p className="subheading">Track event budgets against confirmed resource allocations.</p></div>
      <Link className="button primary" href="/resources"><Wallet size={17}/> Reserve resources</Link>
    </header>

    {error && <div className="inline-message error-cell" role="alert">{error} Check your database connection and schema setup.</div>}

    <section className="stats-grid budget-stats">
      <article className="stat-card"><div className="stat-top"><span>Planned event budgets</span><span className="stat-icon violet"><Wallet size={18}/></span></div><div className="stat-number stat-number-currency">{loading ? '—' : money(plannedBudget)}</div><div className="stat-foot">Sum of event budget records</div></article>
      <article className="stat-card"><div className="stat-top"><span>Confirmed allocations</span><span className="stat-icon amber"><TrendingUp size={18}/></span></div><div className="stat-number stat-number-currency">{loading ? '—' : money(allocatedCost)}</div><div className="stat-foot">{loading ? 'Loading records' : `${confirmedAllocations.length} confirmed resource bookings`}</div></article>
      <article className="stat-card"><div className="stat-top"><span>Budget after allocations</span><span className="stat-icon green"><Wallet size={18}/></span></div><div className="stat-number stat-number-currency">{loading ? '—' : money(remaining)}</div><div className="stat-foot">Planned budget less confirmed allocations</div></article>
      <article className="stat-card"><div className="stat-top"><span>Allocation share</span><span className="stat-icon blue"><TrendingUp size={18}/></span></div><div className="stat-number">{loading || plannedBudget === 0 ? '—' : `${allocationRate}%`}</div><div className="progress"><span style={{ width: `${allocationRate}%` }}/></div><div className="stat-foot">Confirmed allocations / planned budgets</div></article>
    </section>

    <section className="panel table-panel">
      <div className="panel-heading"><div><h2>Resource allocation costs</h2><p>Live confirmed and cancelled bookings from your database.</p></div><button type="button" className="button secondary" onClick={exportReport} disabled={loading || allocations.length === 0}><Download size={15}/> Export CSV</button></div>
      <div className="table-wrap"><table><thead><tr><th>EVENT</th><th>RESOURCE</th><th>CATEGORY</th><th>START DATE</th><th>ALLOCATED COST</th><th>STATUS</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={6}><LoaderCircle size={14} className="spin"/> Loading budget records…</td></tr>
          : allocations.length === 0 ? <tr><td colSpan={6}>No resource allocations recorded yet. Reserve a resource to see costs here.</td></tr>
          : allocations.map((allocation) => <tr key={allocation.allocation_id}>
            <td><strong>{allocation.event_name}</strong></td>
            <td>{allocation.resource_name}</td>
            <td>{allocation.type_name}</td>
            <td>{new Date(allocation.start_datetime).toLocaleDateString()}</td>
            <td>{money(Number(allocation.total_cost))}</td>
            <td><span className={`status ${allocation.allocation_status === 'CONFIRMED' ? 'confirmed' : ''}`}>{allocation.allocation_status}</span></td>
          </tr>)}
        </tbody>
      </table></div>
      <p className="table-note">Totals use the event and allocation records returned by the API. Expense tracking is not shown because no expense API is available yet.</p>
    </section>

    <div className="resource-note"><span className="note-symbol"><ArrowUpRight size={15}/></span><p><strong>Budget calculations</strong><br/>Planned amounts come from each event’s total budget. Only confirmed resource allocations are subtracted; this is not an expense or payment ledger.</p></div>
  </>;
}

