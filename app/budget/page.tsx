'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Download, TrendingUp, Wallet, LoaderCircle } from 'lucide-react';

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
type Expense = {
  expense_id: number | string;
  event_id: number | string;
  event_name: string;
  category: string;
  description: string;
  amount: number | string;
  expense_date: string;
  status: string;
};
type CurrentUser = { role_name: string };
type ServiceBooking = {
  booking_id: number | string;
  event_name: string;
  service_name: string;
  business_name: string;
  booking_status: string;
  quoted_price: number | string;
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [serviceBookings, setServiceBookings] = useState<ServiceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [eventResponse, allocationResponse, userResponse, serviceResponse] = await Promise.all([
          fetch('/api/events', { signal: controller.signal }),
          fetch('/api/allocations', { signal: controller.signal }),
          fetch('/api/auth/me', { signal: controller.signal }),
          fetch('/api/service-bookings', { signal: controller.signal }),
        ]);
        const [eventBody, allocationBody, userBody, serviceBody] = await Promise.all([eventResponse.json(), allocationResponse.json(), userResponse.json(), serviceResponse.json()]);
        if (!eventResponse.ok) throw new Error(eventBody.error || 'Could not load event budgets.');
        if (!allocationResponse.ok) throw new Error(allocationBody.error || 'Could not load resource allocations.');
        if (userResponse.ok && !['ADMIN', 'ORGANIZER'].includes(userBody.data.role_name)) {
          throw new Error('Budget reports are available to administrators and event organizers.');
        }
        if (!serviceResponse.ok) throw new Error(serviceBody.error || 'Could not load service bookings.');
        const expenseResponses = await Promise.all(
          eventBody.data.map((event: EventBudget) => fetch(`/api/expenses?eventId=${event.event_id}`, { signal: controller.signal })),
        );
        const expenseBodies = await Promise.all(expenseResponses.map((response) => response.json()));
        const failedExpense = expenseResponses.findIndex((response) => !response.ok);
        if (failedExpense >= 0) throw new Error(expenseBodies[failedExpense].error || 'Could not load event expenses.');
        setEvents(eventBody.data);
        setAllocations(allocationBody.data);
        setExpenses(expenseBodies.flatMap((body) => body.data));
        setServiceBookings(serviceBody.data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load budget data.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
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
  const confirmedServices = serviceBookings.filter((booking) => booking.booking_status === 'CONFIRMED');
  const serviceCost = confirmedServices.reduce((total, booking) => total + Number(booking.quoted_price || 0), 0);
  const recordedExpenses = expenses.filter((expense) => expense.status === 'RECORDED').reduce((total, expense) => total + Number(expense.amount || 0), 0);
  const committedCost = allocatedCost + serviceCost;
  const remaining = plannedBudget - committedCost - recordedExpenses;
  const allocationRate = plannedBudget > 0 ? Math.min(100, Math.round(((committedCost + recordedExpenses) / plannedBudget) * 100)) : 0;

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
      ...serviceBookings.map((booking) => [
        booking.event_name,
        booking.service_name,
        `Vendor service · ${booking.business_name}`,
        booking.booking_status,
        Number(booking.quoted_price).toFixed(2),
        new Date(booking.start_datetime).toISOString(),
      ]),
      ...expenses.map((expense) => [
        expense.event_name,
        expense.description,
        `Expense: ${expense.category}`,
        expense.status,
        Number(expense.amount).toFixed(2),
        new Date(expense.expense_date).toISOString().slice(0, 10),
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
      <article className="stat-card"><div className="stat-top"><span>Committed spending</span><span className="stat-icon amber"><TrendingUp size={18}/></span></div><div className="stat-number stat-number-currency">{loading ? '—' : money(committedCost + recordedExpenses)}</div><div className="stat-foot">{loading ? 'Loading records' : `${confirmedAllocations.length} allocations · ${confirmedServices.length} services · ${expenses.length} expenses`}</div></article>
      <article className="stat-card"><div className="stat-top"><span>Budget remaining</span><span className="stat-icon green"><Wallet size={18}/></span></div><div className="stat-number stat-number-currency">{loading ? '—' : money(remaining)}</div><div className="stat-foot">Planned less allocations and recorded expenses</div></article>
      <article className="stat-card"><div className="stat-top"><span>Budget used</span><span className="stat-icon blue"><TrendingUp size={18}/></span></div><div className="stat-number">{loading || plannedBudget === 0 ? '—' : `${allocationRate}%`}</div><div className="progress"><span style={{ width: `${allocationRate}%` }}/></div><div className="stat-foot">Confirmed allocations plus expenses</div></article>
    </section>

    <section className="panel table-panel">
      <div className="panel-heading"><div><h2>Resource allocation costs</h2><p>Live confirmed and cancelled bookings from your database.</p></div><button type="button" className="button secondary" onClick={exportReport} disabled={loading || allocations.length === 0}><Download size={15}/> Export CSV</button></div>
      <div className="table-wrap"><table><thead><tr><th>EVENT</th><th>ITEM</th><th>CATEGORY</th><th>DATE</th><th>COST</th><th>STATUS</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={6}>Loading budget records…</td></tr>
          : allocations.length === 0 && expenses.length === 0 && serviceBookings.length === 0 ? <tr><td colSpan={6}>No resource allocations or expenses recorded yet.</td></tr>
          : <>{allocations.map((allocation) => <tr key={`allocation-${allocation.allocation_id}`}>
            <td><strong>{allocation.event_name}</strong></td>
            <td>{allocation.resource_name}</td>
            <td>{allocation.type_name}</td>
            <td>{new Date(allocation.start_datetime).toLocaleDateString()}</td>
            <td>{money(Number(allocation.total_cost))}</td>
            <td><span className={`status ${allocation.allocation_status === 'CONFIRMED' ? 'confirmed' : ''}`}>{allocation.allocation_status}</span></td>
          </tr>)}{serviceBookings.map((booking) => <tr key={`service-${booking.booking_id}`}>
            <td><strong>{booking.event_name}</strong></td><td>{booking.service_name} · {booking.business_name}</td><td>Vendor service</td>
            <td>{new Date(booking.start_datetime).toLocaleDateString()}</td><td>{money(Number(booking.quoted_price))}</td>
            <td><span className={`status ${booking.booking_status === 'CONFIRMED' ? 'confirmed' : ''}`}>{booking.booking_status}</span></td>
          </tr>)}{expenses.map((expense) => <tr key={`expense-${expense.expense_id}`}>
            <td><strong>{expense.event_name}</strong></td><td>{expense.description}</td><td>Expense · {expense.category}</td>
            <td>{new Date(expense.expense_date).toLocaleDateString()}</td><td>{money(Number(expense.amount))}</td>
            <td><span className={`status ${expense.status === 'RECORDED' ? 'confirmed' : ''}`}>{expense.status}</span></td>
          </tr>)}</>}</tbody>
      </table></div>
      <p className="table-note">Totals use event budgets, confirmed resource and vendor service bookings, and recorded expenses from the database.</p>
    </section>
    <div className="resource-note"><span className="note-symbol"><ArrowUpRight size={15}/></span><p><strong>Budget calculations</strong><br/>Planned amounts come from event budgets. Committed spending includes confirmed resource and service bookings plus recorded (non-voided) expenses. Values below zero remaining indicate an overrun.</p></div>
  </>;
}
