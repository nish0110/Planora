'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, LoaderCircle, MapPin, Plus, Trash2, Users, Wallet } from 'lucide-react';

type EventRecord = {
  event_id: number;
  organizer_id: number;
  event_name: string;
  event_type: string;
  description: string | null;
  location: string | null;
  start_datetime: string;
  end_datetime: string;
  expected_attendees: number;
  total_budget: number | string | null;
  status: string;
};
type Row = Record<string, string | number | null>;
type CurrentUser = { user_id: number; role_name: string };
type EventSummary = {
  registered_attendees: number;
  waitlisted_attendees: number;
  open_tasks: number;
  scheduled_activities: number;
  active_resource_bookings: number;
  committed_spending: number | string;
  remaining_budget: number | string;
};

function localInputDate(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function EventDetailsPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [registrations, setRegistrations] = useState<Row[]>([]);
  const [expenses, setExpenses] = useState<Row[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const [eventResponse, scheduleResponse, taskResponse, registrationResponse, expenseResponse, userResponse, summaryResponse] = await Promise.all([
        fetch(`/api/events/${eventId}`, { signal }),
        fetch(`/api/events/${eventId}/schedules`, { signal }),
        fetch(`/api/events/${eventId}/tasks`, { signal }),
        fetch(`/api/events/${eventId}/registrations`, { signal }),
        fetch(`/api/expenses?eventId=${eventId}`, { signal }),
        fetch('/api/auth/me', { signal }),
        fetch(`/api/events/${eventId}/summary`, { signal }),
      ]);
      const [eventBody, scheduleBody, taskBody, registrationBody, expenseBody, userBody, summaryBody] = await Promise.all([
        eventResponse.json(), scheduleResponse.json(), taskResponse.json(), registrationResponse.json(), expenseResponse.json(), userResponse.json(), summaryResponse.json(),
      ]);
      if (!eventResponse.ok) throw new Error(eventBody.error || 'Could not load event.');
      setEvent(eventBody.data);
      setSchedules(scheduleBody.data || []);
      setTasks(taskBody.data || []);
      setRegistrations(registrationBody.data || []);
      setExpenses(expenseResponse.ok ? expenseBody.data : []);
      setUser(userResponse.ok ? userBody.data : null);
      setSummary(summaryResponse.ok ? summaryBody.data : null);
    } catch (err) {
      if (!signal.aborted) setError(err instanceof Error ? err.message : 'Could not load event details.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refresh]);

  const canManage = user?.role_name === 'ADMIN' || event !== null && user?.role_name === 'ORGANIZER' && user.user_id === Number(event.organizer_id);
  const activeRegistrations = registrations.filter((entry) => ['REGISTERED', 'WAITLISTED', 'CHECKED_IN'].includes(String(entry.registration_status)));

  async function send(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed.');
    return result.data;
  }

  async function saveEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!event) return;
    const values = new FormData(formEvent.currentTarget);
    setSaving(true);
    setMessage('');
    try {
      await send(`/api/events/${eventId}`, 'PATCH', {
        eventName: values.get('eventName'),
        eventType: values.get('eventType'),
        description: values.get('description') || null,
        location: values.get('location') || null,
        startDatetime: new Date(String(values.get('startDatetime'))).toISOString(),
        endDatetime: new Date(String(values.get('endDatetime'))).toISOString(),
        expectedAttendees: Number(values.get('expectedAttendees')),
        totalBudget: Number(values.get('totalBudget')),
      });
      setEditing(false);
      setMessage('Event details updated.');
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update event.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelEvent() {
    if (!window.confirm('Cancel this event? Pending and confirmed resource allocations will also be cancelled.')) return;
    try {
      await send(`/api/events/${eventId}`, 'DELETE');
      setMessage('Event cancelled. Active resource allocations were cancelled too.');
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not cancel event.');
    }
  }

  async function createSchedule(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);
    try {
      await send(`/api/events/${eventId}/schedules`, 'POST', {
        activityName: data.get('activityName'), location: data.get('location') || null,
        description: data.get('description') || null,
        startDatetime: new Date(String(data.get('startDatetime'))).toISOString(),
        endDatetime: new Date(String(data.get('endDatetime'))).toISOString(),
      });
      form.reset();
      setMessage('Schedule item added.');
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not add schedule item.');
    }
  }

  async function createTask(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);
    try {
      await send(`/api/events/${eventId}/tasks`, 'POST', {
        taskName: data.get('taskName'), description: data.get('description') || null,
        assignedTo: data.get('assignedTo') ? Number(data.get('assignedTo')) : null,
        priority: data.get('priority'),
        deadline: data.get('deadline') ? new Date(String(data.get('deadline'))).toISOString() : null,
      });
      form.reset();
      setMessage('Task added.');
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not add task.');
    }
  }

  async function createExpense(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);
    try {
      await send('/api/expenses', 'POST', {
        eventId: Number(eventId), category: data.get('category'), description: data.get('description'),
        amount: Number(data.get('amount')), expenseDate: data.get('expenseDate') || undefined,
      });
      form.reset();
      setMessage('Expense recorded.');
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not record expense.');
    }
  }

  async function register() {
    try {
      const result = await send(`/api/events/${eventId}/registrations`, 'POST', {});
      setMessage(result.registration_status === 'WAITLISTED' ? 'Event is full; you were added to the waitlist.' : 'You are registered for this event.');
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not register.');
    }
  }

  async function updateTask(taskId: string | number, status: string) {
    try {
      await send(`/api/tasks/${taskId}`, 'PATCH', { status });
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update task.');
    }
  }

  async function updateSchedule(scheduleId: string | number, status: string) {
    try {
      await send(`/api/schedules/${scheduleId}`, 'PATCH', { status });
      setMessage('Schedule activity status updated.');
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update schedule status.');
    }
  }

  async function removeSchedule(scheduleId: string | number) {
    try {
      await send(`/api/schedules/${scheduleId}`, 'DELETE');
      setMessage('Schedule item removed.');
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not remove schedule item.');
    }
  }

  if (loading) return <div className="panel empty-state"><LoaderCircle size={18} className="spin"/> Loading event…</div>;
  if (error || !event) return <><Link href="/events" className="text-link"><ArrowLeft size={15}/> Back to events</Link><div className="panel empty-state error-cell" role="alert">{error || 'Event not found.'}</div></>;

  return <>
    <header className="topbar">
      <div><div className="eyebrow">YOUR WORKSPACE / EVENTS / DETAILS</div><h1>{event.event_name}</h1><p className="subheading">{event.event_type} · {event.status}</p></div>
      <Link href="/events" className="button secondary"><ArrowLeft size={15}/> All events</Link>
    </header>
    {message && <div className="inline-message" role="status">{message}</div>}
    <section className="panel event-summary">
      <div className="event-summary-head"><div><span className={`status ${event.status === 'CONFIRMED' ? 'confirmed' : ''}`}>{event.status}</span><p>{event.description || 'No event description provided.'}</p></div>
        {user?.role_name === 'ATTENDEE' && event.status !== 'CANCELLED' && <button className="button primary" onClick={register}><Users size={15}/> Register</button>}
        {canManage && !['CANCELLED', 'COMPLETED'].includes(event.status) && <div className="form-actions inline-actions"><button className="button secondary" onClick={() => setEditing((value) => !value)}>Edit event</button><button className="button danger-button" onClick={cancelEvent}>Cancel event</button></div>}
      </div>
      <div className="event-summary-meta"><span><CalendarDays size={16}/>{new Date(event.start_datetime).toLocaleString()} – {new Date(event.end_datetime).toLocaleString()}</span><span><MapPin size={16}/>{event.location || 'Location not set'}</span><span><Users size={16}/>{event.expected_attendees.toLocaleString()} expected</span>{canManage && event.total_budget !== null && <span><Wallet size={16}/>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(event.total_budget))} budget</span>}</div>
    </section>
    {summary && <section className="stats-grid event-summary-stats">
      <article className="stat-card"><div className="stat-top"><span>Registered attendees</span><span className="stat-icon violet"><Users size={17}/></span></div><div className="stat-number">{summary.registered_attendees}</div><div className="stat-foot">{summary.waitlisted_attendees} waitlisted</div></article>
      <article className="stat-card"><div className="stat-top"><span>Schedule activities</span><span className="stat-icon amber"><CalendarDays size={17}/></span></div><div className="stat-number">{summary.scheduled_activities}</div><div className="stat-foot">{summary.open_tasks} open tasks</div></article>
      <article className="stat-card"><div className="stat-top"><span>Resource bookings</span><span className="stat-icon blue"><Wallet size={17}/></span></div><div className="stat-number">{summary.active_resource_bookings}</div><div className="stat-foot">Pending or confirmed</div></article>
      <article className="stat-card"><div className="stat-top"><span>Budget remaining</span><span className="stat-icon green"><Wallet size={17}/></span></div><div className="stat-number stat-number-currency">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(summary.remaining_budget))}</div><div className="stat-foot">After confirmed bookings and expenses</div></article>
    </section>}

    {editing && canManage && <section className="panel form-panel"><div className="panel-heading"><div><h2>Edit event</h2><p>Changes are saved to the shared event record.</p></div></div>
      <form className="event-form" onSubmit={saveEvent}>
        <label>Event name<input name="eventName" required minLength={3} defaultValue={event.event_name}/></label>
        <label>Event type<input name="eventType" required minLength={2} defaultValue={event.event_type}/></label>
        <label>Start date & time<input type="datetime-local" name="startDatetime" required defaultValue={localInputDate(event.start_datetime)}/></label>
        <label>End date & time<input type="datetime-local" name="endDatetime" required defaultValue={localInputDate(event.end_datetime)}/></label>
        <label>Location<input name="location" defaultValue={event.location || ''}/></label>
        <label>Expected attendees<input name="expectedAttendees" type="number" min="0" required defaultValue={event.expected_attendees}/></label>
        <label>Total budget<input name="totalBudget" type="number" min="0" step="0.01" required defaultValue={Number(event.total_budget)}/></label>
        <label className="wide-field">Description<textarea name="description" rows={3} defaultValue={event.description || ''}/></label>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setEditing(false)}>Close</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle size={15} className="spin"/>} Save changes</button></div>
      </form>
    </section>}

    <section className="operation-grid">
      <section className="panel operation-panel"><div className="panel-heading"><div><h2>Schedule</h2><p>{schedules.length} activities planned</p></div></div>
        {schedules.length === 0 ? <div className="empty-state">No schedule activities yet.</div> : <div className="operation-list">{schedules.map((item) => <article className="operation-row" key={String(item.schedule_id)}><div><strong>{String(item.activity_name)}</strong><small>{new Date(String(item.start_datetime)).toLocaleString()} – {new Date(String(item.end_datetime)).toLocaleTimeString()}</small><small>{String(item.location || 'No location')} · {String(item.status)}</small></div><div className="operation-actions">{canManage && <select aria-label={`Status for ${String(item.activity_name)}`} value={String(item.status)} onChange={(change) => updateSchedule(item.schedule_id as string | number, change.target.value)}>{['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((status) => <option key={status}>{status}</option>)}</select>}{canManage && <button className="icon-button" aria-label="Remove schedule item" onClick={() => removeSchedule(item.schedule_id as string | number)}><Trash2 size={15}/></button>}</div></article>)}</div>}
        {canManage && <form className="compact-form" onSubmit={createSchedule}><h3><Plus size={15}/> Add activity</h3><label>Activity<input name="activityName" required minLength={2}/></label><div className="compact-form-row"><label>Start<input name="startDatetime" type="datetime-local" required defaultValue={localInputDate(event.start_datetime)}/></label><label>End<input name="endDatetime" type="datetime-local" required defaultValue={localInputDate(event.end_datetime)}/></label></div><label>Location<input name="location"/></label><label>Description<input name="description"/></label><button className="button secondary">Add to schedule</button></form>}
      </section>

      <section className="panel operation-panel"><div className="panel-heading"><div><h2>Tasks</h2><p>Assignments, priorities and deadlines.</p></div></div>
        {tasks.length === 0 ? <div className="empty-state">No tasks have been added yet.</div> : <div className="operation-list">{tasks.map((task) => <article className="operation-row" key={String(task.task_id)}><div><strong>{String(task.task_name)}</strong><small>{String(task.priority)} priority · {String(task.assignee_name || 'Unassigned')}</small><small>{task.deadline ? new Date(String(task.deadline)).toLocaleString() : 'No deadline'}</small></div><select aria-label={`Status for ${String(task.task_name)}`} value={String(task.status)} onChange={(change) => updateTask(task.task_id as string | number, change.target.value)} disabled={!canManage && Number(task.assigned_to) !== user?.user_id}>{['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'].map((status) => <option key={status}>{status}</option>)}</select></article>)}</div>}
        {canManage && <form className="compact-form" onSubmit={createTask}><h3><Plus size={15}/> Add task</h3><label>Task name<input name="taskName" required minLength={2}/></label><div className="compact-form-row"><label>Priority<select name="priority"><option>MEDIUM</option><option>LOW</option><option>HIGH</option><option>URGENT</option></select></label><label>Assignee user ID<input name="assignedTo" type="number" min="1"/></label></div><label>Deadline<input name="deadline" type="datetime-local"/></label><button className="button secondary">Add task</button></form>}
      </section>
    </section>

    <section className="operation-grid">
      <section className="panel operation-panel"><div className="panel-heading"><div><h2>Attendee registrations</h2><p>{activeRegistrations.length} active or waitlisted</p></div></div>
        {registrations.length === 0 ? <div className="empty-state">No registrations yet.</div> : <div className="operation-list">{registrations.map((registration) => <article className="operation-row" key={String(registration.registration_id)}><div><strong>{String(registration.full_name || 'Your registration')}</strong><small>{String(registration.email || '')}</small><small>{String(registration.registration_status)} · {new Date(String(registration.registration_date)).toLocaleDateString()}</small></div>{String(registration.registration_status) !== 'CANCELLED' && <button className="button secondary small-button" onClick={async () => { try { await send(`/api/events/${eventId}/registrations?registrationId=${registration.registration_id}`, 'DELETE'); setRefresh((value) => value + 1); } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not cancel registration.'); } }}>Cancel</button>}</article>)}</div>}
      </section>

      <section className="panel operation-panel"><div className="panel-heading"><div><h2>Expenses</h2><p>Recorded event spending.</p></div></div>
        <div className="operation-list">{expenses.length === 0 ? <div className="empty-state">No expenses recorded yet.</div> : expenses.map((expense) => <article className="operation-row" key={String(expense.expense_id)}><div><strong>{String(expense.description)}</strong><small>{String(expense.category)} · {new Date(String(expense.expense_date)).toLocaleDateString()} · {String(expense.status)}</small></div><div className="expense-actions"><strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(expense.amount))}</strong>{canManage && expense.status === 'RECORDED' && <button className="icon-button" aria-label="Void expense" onClick={async () => { try { await send(`/api/expenses/${expense.expense_id}`, 'PATCH', { status: 'VOIDED' }); setMessage('Expense voided.'); setRefresh((value) => value + 1); } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not void expense.'); } }}>×</button>}</div></article>)}</div>
        {canManage && <form className="compact-form" onSubmit={createExpense}><h3><Plus size={15}/> Record expense</h3><label>Description<input name="description" required minLength={2}/></label><div className="compact-form-row"><label>Category<input name="category" required/></label><label>Amount<input name="amount" type="number" min="0" step="0.01" required/></label></div><label>Date<input name="expenseDate" type="date"/></label><button className="button secondary">Save expense</button></form>}
      </section>
    </section>
  </>;
}
