'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Boxes, CalendarCheck, CalendarDays, LoaderCircle, MapPin, Search, Users, X } from 'lucide-react';

type Resource = {
  resource_id: number | string;
  resource_name: string;
  description: string | null;
  location: string | null;
  capacity: number | null;
  quantity_available: number;
  base_price: number | string;
  type_name: string;
};

type EventOption = {
  event_id: number | string;
  event_name: string;
  start_datetime: string;
  end_datetime: string;
};

type ResourceType = 'All' | 'Venue' | 'Equipment' | 'Staff' | 'Service';

const resourceTypes: ResourceType[] = ['All', 'Venue', 'Equipment', 'Staff', 'Service'];

function formatCurrency(value: number | string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value));
}

function resourceTone(type: string) {
  if (type === 'Venue') return 'lavender';
  if (type === 'Equipment') return 'peach';
  if (type === 'Staff') return 'mint';
  return 'blue';
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ResourceType>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Resource | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [allocationError, setAllocationError] = useState('');
  const [eventId, setEventId] = useState('');
  const [allocatedBy, setAllocatedBy] = useState('');
  const [startDatetime, setStartDatetime] = useState('');
  const [endDatetime, setEndDatetime] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [totalCost, setTotalCost] = useState('0');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        if (type !== 'All') params.set('type', type);
        const [resourceResponse, eventResponse] = await Promise.all([
          fetch(`/api/resources?${params.toString()}`, { signal: controller.signal }),
          fetch('/api/events', { signal: controller.signal }),
        ]);
        const [resourceBody, eventBody] = await Promise.all([resourceResponse.json(), eventResponse.json()]);
        if (!resourceResponse.ok) throw new Error(resourceBody.error || 'Could not load resources.');
        if (!eventResponse.ok) throw new Error(eventBody.error || 'Could not load events for allocation.');
        setResources(resourceBody.data);
        setEvents(eventBody.data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load resources.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    const timeout = window.setTimeout(load, 200);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, type]);

  const selectedEvent = useMemo(
    () => events.find((event) => String(event.event_id) === eventId),
    [events, eventId],
  );

  function openAllocation(resource: Resource) {
    setSelected(resource);
    setMessage('');
    setAllocationError('');
    setEventId('');
    setAllocatedBy('');
    setStartDatetime('');
    setEndDatetime('');
    setQuantity(1);
    setTotalCost(String(Number(resource.base_price)));
  }

  async function createAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAllocationError('');
    setMessage('');
    if (!selected || !eventId || !allocatedBy || !startDatetime || !endDatetime) {
      setAllocationError('Complete each required field before reserving this resource.');
      return;
    }
    if (new Date(endDatetime) <= new Date(startDatetime)) {
      setAllocationError('The end time must be after the start time.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: Number(eventId),
          resourceId: Number(selected.resource_id),
          allocatedBy: Number(allocatedBy),
          startDatetime: new Date(startDatetime).toISOString(),
          endDatetime: new Date(endDatetime).toISOString(),
          quantity,
          totalCost: Number(totalCost),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not reserve this resource.');
      setSelected(null);
      setMessage(`${selected.resource_name} was reserved for ${selectedEvent?.event_name ?? 'the event'}.`);
    } catch (err) {
      setAllocationError(err instanceof Error ? err.message : 'Could not reserve this resource.');
    } finally {
      setSaving(false);
    }
  }

  return <>
    <header className="topbar">
      <div>
        <div className="eyebrow">YOUR WORKSPACE / RESOURCES</div>
        <h1>Resource library</h1>
        <p className="subheading">Find and reserve the right people, places, and things for every event.</p>
      </div>
    </header>

    {message && <div className="inline-message" role="status">{message}</div>}

    <section className="resource-toolbar" aria-label="Resource filters">
      <label className="search-box resource-search">
        <Search size={16}/>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources…" aria-label="Search resources"/>
      </label>
      <div className="filter-pills" role="group" aria-label="Filter by resource type">
        {resourceTypes.map((resourceType) => <button
          key={resourceType}
          type="button"
          className={`filter-pill ${type === resourceType ? 'selected' : ''}`}
          aria-pressed={type === resourceType}
          onClick={() => setType(resourceType)}
        >{resourceType === 'All' ? 'All resources' : resourceType === 'Staff' ? 'Staff' : resourceType === 'Service' ? 'Services' : `${resourceType}s`}</button>)}
      </div>
    </section>

    {selected && <section className="panel form-panel allocation-form-panel">
      <div className="panel-heading">
        <div><h2>Reserve {selected.resource_name}</h2><p>Availability and booking conflicts are checked by the database.</p></div>
        <button type="button" className="icon-button" onClick={() => setSelected(null)} aria-label="Close reservation form"><X size={18}/></button>
      </div>
      <form className="event-form" onSubmit={createAllocation}>
        <label>Event<select required value={eventId} onChange={(event) => setEventId(event.target.value)}>
          <option value="">Choose an event</option>
          {events.map((event) => <option key={event.event_id} value={event.event_id}>{event.event_name}</option>)}
        </select></label>
        <label>Your user ID<input type="number" required min="1" value={allocatedBy} onChange={(event) => setAllocatedBy(event.target.value)} placeholder="Existing users.user_id"/></label>
        <label>Start date & time<input type="datetime-local" required value={startDatetime} onChange={(event) => setStartDatetime(event.target.value)}/></label>
        <label>End date & time<input type="datetime-local" required value={endDatetime} onChange={(event) => setEndDatetime(event.target.value)}/></label>
        <label>Quantity<input type="number" required min="1" max={selected.quantity_available} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}/><small>{selected.quantity_available} available</small></label>
        <label>Total cost (₹)<input type="number" required min="0" step="0.01" value={totalCost} onChange={(event) => setTotalCost(event.target.value)}/><small>Base price: {formatCurrency(selected.base_price)}</small></label>
        {allocationError && <p className="form-error wide-field" role="alert">{allocationError}</p>}
        {selectedEvent && <p className="form-hint wide-field">Selected event runs {new Date(selectedEvent.start_datetime).toLocaleString()} – {new Date(selectedEvent.end_datetime).toLocaleString()}. Enter the period you need this resource.</p>}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={() => setSelected(null)}>Cancel</button>
          <button type="submit" className="button primary" disabled={saving || events.length === 0}>
            {saving && <LoaderCircle size={15} className="spin"/>} Reserve resource
          </button>
        </div>
      </form>
    </section>}

    {loading ? <div className="panel empty-state" role="status"><LoaderCircle size={20} className="spin"/> Loading resources…</div>
      : error ? <div className="panel empty-state error-cell" role="alert">{error}<small>Check your database connection and run the schema setup.</small></div>
      : resources.length === 0 ? <div className="panel empty-state">No active resources match your search.</div>
      : <section className="resource-grid" aria-label="Available resources">
        {resources.map((resource) => <article className="resource-card" key={resource.resource_id}>
          <div className={`resource-visual ${resourceTone(resource.type_name)}`}>
            <span className="resource-type"><Boxes size={13}/>{resource.type_name}</span>
            <span className="resource-illustration"><CalendarCheck size={31}/></span>
            <span className="resource-status"><i/> Active</span>
          </div>
          <div className="resource-card-body">
            <h2>{resource.resource_name}</h2>
            <p>{resource.description || 'No description provided.'}</p>
            <div className="resource-detail">
              <span><MapPin size={14}/>{resource.location || 'Location not specified'}</span>
              <span><Users size={14}/>{resource.capacity === null ? `${resource.quantity_available} available` : `Capacity ${resource.capacity}`}</span>
            </div>
            <div className="resource-card-footer">
              <strong>{formatCurrency(resource.base_price)}</strong>
              <button type="button" className="button small-button" onClick={() => openAllocation(resource)} disabled={events.length === 0}>Reserve</button>
            </div>
          </div>
        </article>)}
      </section>}

    {!loading && !error && events.length === 0 && <div className="resource-note"><span className="note-symbol">✦</span><p><strong>Create an event first</strong><br/>Resources can be reserved once the database has at least one event.</p></div>}
    <div className="resource-note"><span className="note-symbol"><CalendarDays size={15}/></span><p><strong>Availability is confirmed when you reserve</strong><br/>The server validates the event, resource capacity, date range, and booking conflicts before saving.</p></div>
  </>;
}
