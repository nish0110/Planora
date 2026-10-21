'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Boxes, CalendarCheck, LoaderCircle, MapPin, Search, Users, X, Plus, Clock3 } from 'lucide-react';

type Resource = {
  resource_id: number | string;
  resource_name: string;
  description: string | null;
  location: string | null;
  capacity: number | null;
  quantity_available: number;
  base_price: number | string;
  type_name: string;
  owner_id?: number | null;
};
type EventOption = {
  event_id: number | string;
  event_name: string;
  start_datetime: string;
  end_datetime: string;
};
type ResourceType = 'All' | 'Venue' | 'Equipment' | 'Staff' | 'Service';
type CurrentUser = { user_id: number; role_name: string };
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
function localInputDate(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ResourceType>('All');
  const [minCapacity, setMinCapacity] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [availableStart, setAvailableStart] = useState('');
  const [availableEnd, setAvailableEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Resource | null>(null);
  const [availabilityResource, setAvailabilityResource] = useState<Resource | null>(null);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [allocationError, setAllocationError] = useState('');
  const [alternatives, setAlternatives] = useState<Resource[]>([]);
  const [eventId, setEventId] = useState('');
  const [startDatetime, setStartDatetime] = useState('');
  const [endDatetime, setEndDatetime] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [totalCost, setTotalCost] = useState('0');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (type !== 'All') params.set('type', type);
      if (minCapacity) params.set('minCapacity', minCapacity);
      if (maxPrice) params.set('maxPrice', maxPrice);
      if ((availableStart && !availableEnd) || (!availableStart && availableEnd)) {
        setError('Enter both availability start and end times.');
        setLoading(false);
        return;
      }
      if (availableStart && availableEnd) {
        const start = new Date(availableStart);
        const end = new Date(availableEnd);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
          setError('Availability end must be after start.');
          setLoading(false);
          return;
        }
        params.set('availableStart', start.toISOString());
        params.set('availableEnd', end.toISOString());
      }
      try {
        const [resourceResponse, eventResponse, userResponse] = await Promise.all([
          fetch(`/api/resources?${params.toString()}`, { signal: controller.signal }),
          fetch('/api/events', { signal: controller.signal }),
          fetch('/api/auth/me', { signal: controller.signal }),
        ]);
        const [resourceBody, eventBody, userBody] = await Promise.all([resourceResponse.json(), eventResponse.json(), userResponse.json()]);
        if (!resourceResponse.ok) throw new Error(resourceBody.error || 'Could not load resources.');
        if (!eventResponse.ok) throw new Error(eventBody.error || 'Could not load events.');
        setResources(resourceBody.data);
        setEvents(eventBody.data);
        setUser(userResponse.ok ? userBody.data : null);
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
  }, [query, type, minCapacity, maxPrice, availableStart, availableEnd, refreshKey]);

  const selectedEvent = useMemo(() => events.find((event) => String(event.event_id) === eventId), [events, eventId]);
  const mayManageResources = user?.role_name === 'ADMIN' || user?.role_name === 'VENDOR';
  const mayRequest = user?.role_name === 'ADMIN' || user?.role_name === 'ORGANIZER';

  function openAllocation(resource: Resource) {
    setSelected(resource);
    setMessage('');
    setAllocationError('');
    setAlternatives([]);
    setEventId('');
    setStartDatetime('');
    setEndDatetime('');
    setQuantity(1);
    setTotalCost(String(Number(resource.base_price)));
  }

  function chooseAlternative(resource: Resource) {
    const previousEventId = eventId;
    const previousStart = startDatetime;
    const previousEnd = endDatetime;
    openAllocation(resource);
    setEventId(previousEventId);
    setStartDatetime(previousStart);
    setEndDatetime(previousEnd);
  }

  async function createAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAllocationError('');
    setAlternatives([]);
    setMessage('');
    if (!selected || !eventId || !startDatetime || !endDatetime) {
      setAllocationError('Complete each required field before requesting this resource.');
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
          eventId: Number(eventId), resourceId: Number(selected.resource_id),
          startDatetime: new Date(startDatetime).toISOString(), endDatetime: new Date(endDatetime).toISOString(),
          quantity, totalCost: Number(totalCost),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setAlternatives(body.alternatives || []);
        throw new Error(body.error || 'Could not reserve this resource.');
      }
      setSelected(null);
      setMessage(`Reservation request submitted for ${selected.resource_name}. The resource owner must confirm it.`);
    } catch (err) {
      setAllocationError(err instanceof Error ? err.message : 'Could not reserve this resource.');
    } finally {
      setSaving(false);
    }
  }

  async function createResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceName: data.get('resourceName'), typeName: data.get('typeName'),
          description: data.get('description') || null, location: data.get('location') || null,
          capacity: data.get('capacity') ? Number(data.get('capacity')) : null,
          quantityAvailable: Number(data.get('quantityAvailable')), basePrice: Number(data.get('basePrice')),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not add resource.');
      form.reset();
      setShowResourceForm(false);
      setMessage('Resource added.');
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not add resource.');
    } finally {
      setSaving(false);
    }
  }

  async function setAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!availabilityResource) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch(`/api/resources/${availabilityResource.resource_id}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDatetime: new Date(String(data.get('startDatetime'))).toISOString(),
          endDatetime: new Date(String(data.get('endDatetime'))).toISOString(),
          available: data.get('available') === 'true', reason: data.get('reason') || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not update availability.');
      setAvailabilityResource(null);
      setMessage(body.data.available ? `Availability restored; ${body.data.clearedPeriods} blocked period(s) cleared.` : 'Resource marked unavailable for that period.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update availability.');
    } finally {
      setSaving(false);
    }
  }

  async function updateResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingResource) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch(`/api/resources/${editingResource.resource_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceName: data.get('resourceName'), description: data.get('description') || null,
          location: data.get('location') || null, capacity: data.get('capacity') ? Number(data.get('capacity')) : null,
          quantityAvailable: Number(data.get('quantityAvailable')), basePrice: Number(data.get('basePrice')),
          availabilityStatus: data.get('availabilityStatus'),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not update resource.');
      setEditingResource(null);
      setMessage('Resource updated.');
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update resource.');
    } finally {
      setSaving(false);
    }
  }

  return <>
    <header className="topbar">
      <div><div className="eyebrow">YOUR WORKSPACE / RESOURCES</div><h1>Resource library</h1><p className="subheading">Find and reserve the right people, places, and things for every event.</p></div>
      {mayManageResources && <button type="button" className="button primary" onClick={() => setShowResourceForm((open) => !open)}><Plus size={17}/> Add resource</button>}
    </header>
    {message && <div className="inline-message" role="status">{message}</div>}

    {showResourceForm && <section className="panel form-panel"><div className="panel-heading"><div><h2>Add a resource</h2><p>New catalogue items are listed under your vendor account or the workspace.</p></div><button className="icon-button" onClick={() => setShowResourceForm(false)} aria-label="Close form"><X size={18}/></button></div>
      <form className="event-form" onSubmit={createResource}>
        <label>Name<input name="resourceName" required minLength={2}/></label>
        <label>Category<select name="typeName">{['Venue', 'Equipment', 'Staff', 'Service'].map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>Capacity<input name="capacity" type="number" min="1" placeholder="Optional"/></label>
        <label>Quantity available<input name="quantityAvailable" type="number" min="1" max="10000" defaultValue="1" required/></label>
        <label>Base price (₹)<input name="basePrice" type="number" min="0" step="0.01" defaultValue="0" required/></label>
        <label>Location<input name="location"/></label>
        <label className="wide-field">Description<textarea name="description" rows={3}/></label>
        <div className="form-actions"><button className="button primary" disabled={saving}>{saving && <LoaderCircle size={15} className="spin"/>} Save resource</button></div>
      </form>
    </section>}

    {selected && <section className="panel form-panel allocation-form-panel">
      <div className="panel-heading"><div><h2>Request {selected.resource_name}</h2><p>Requests are checked against availability, event dates, capacity, and overlapping bookings.</p></div><button type="button" className="icon-button" onClick={() => setSelected(null)} aria-label="Close reservation form"><X size={18}/></button></div>
      <form className="event-form" onSubmit={createAllocation}>
        <label>Event<select required value={eventId} onChange={(change) => { setEventId(change.target.value); const event = events.find((item) => String(item.event_id) === change.target.value); if (event) { setStartDatetime(localInputDate(event.start_datetime)); setEndDatetime(localInputDate(event.end_datetime)); } }}>
          <option value="">Choose an event</option>{events.map((event) => <option key={event.event_id} value={event.event_id}>{event.event_name}</option>)}
        </select></label>
        <label>Start date & time<input type="datetime-local" required value={startDatetime} onChange={(change) => setStartDatetime(change.target.value)}/></label>
        <label>End date & time<input type="datetime-local" required value={endDatetime} onChange={(change) => setEndDatetime(change.target.value)}/></label>
        <label>Quantity<input type="number" required min="1" max={selected.quantity_available} value={quantity} onChange={(change) => setQuantity(Number(change.target.value))}/><small>{selected.quantity_available} total available</small></label>
        <label>Total cost (₹)<input type="number" required min="0" step="0.01" value={totalCost} onChange={(change) => setTotalCost(change.target.value)}/><small>Base price: {formatCurrency(selected.base_price)}</small></label>
        {allocationError && <p className="form-error wide-field" role="alert">{allocationError}</p>}
        {alternatives.length > 0 && <div className="alternative-list wide-field"><strong>Available alternatives</strong>{alternatives.map((alternative) => <button key={alternative.resource_id} type="button" onClick={() => chooseAlternative(alternative)}><span>{alternative.resource_name}</span><small>{alternative.capacity ? `Capacity ${alternative.capacity} · ` : ''}{formatCurrency(alternative.base_price)}</small></button>)}</div>}
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setSelected(null)}>Cancel</button><button type="submit" className="button primary" disabled={saving || events.length === 0}>{saving && <LoaderCircle size={15} className="spin"/>} Request reservation</button></div>
      </form>
    </section>}

    {availabilityResource && <section className="panel form-panel">
      <div className="panel-heading"><div><h2>Set availability: {availabilityResource.resource_name}</h2><p>Record an available or unavailable date range.</p></div><button className="icon-button" onClick={() => setAvailabilityResource(null)} aria-label="Close availability form"><X size={18}/></button></div>
      <form className="event-form" onSubmit={setAvailability}>
        <label>Start<input type="datetime-local" name="startDatetime" required/></label><label>End<input type="datetime-local" name="endDatetime" required/></label>
        <label>Availability change<select name="available"><option value="false">Mark unavailable</option><option value="true">Clear unavailable periods</option></select></label>
        <label>Reason<input name="reason" maxLength={500}/></label>
        <div className="form-actions"><button className="button primary" disabled={saving}>Save period</button></div>
      </form>
    </section>}

    {editingResource && <section className="panel form-panel">
      <div className="panel-heading"><div><h2>Edit {editingResource.resource_name}</h2><p>Changes update the live resource catalogue.</p></div><button className="icon-button" onClick={() => setEditingResource(null)} aria-label="Close resource editor"><X size={18}/></button></div>
      <form className="event-form" onSubmit={updateResource}>
        <label>Name<input name="resourceName" required minLength={2} defaultValue={editingResource.resource_name}/></label>
        <label>Capacity<input name="capacity" type="number" min="1" defaultValue={editingResource.capacity ?? ''}/></label>
        <label>Quantity<input name="quantityAvailable" type="number" min="1" max="10000" required defaultValue={editingResource.quantity_available}/></label>
        <label>Base price (₹)<input name="basePrice" type="number" min="0" step="0.01" required defaultValue={Number(editingResource.base_price)}/></label>
        <label>Location<input name="location" defaultValue={editingResource.location || ''}/></label>
        <label>Catalogue status<select name="availabilityStatus" defaultValue="ACTIVE"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="MAINTENANCE">Maintenance</option></select></label>
        <label className="wide-field">Description<textarea name="description" rows={3} defaultValue={editingResource.description || ''}/></label>
        <div className="form-actions"><button className="button primary" disabled={saving}>{saving && <LoaderCircle size={15} className="spin"/>} Save changes</button></div>
      </form>
    </section>}

    <section className="resource-toolbar" aria-label="Resource filters">
      <label className="search-box resource-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources…" aria-label="Search resources"/></label>
      <div className="filter-pills" role="group" aria-label="Filter by resource type">{resourceTypes.map((resourceType) => <button key={resourceType} type="button" className={`filter-pill ${type === resourceType ? 'selected' : ''}`} aria-pressed={type === resourceType} onClick={() => setType(resourceType)}>{resourceType === 'All' ? 'All resources' : resourceType === 'Service' ? 'Services' : `${resourceType}s`}</button>)}</div>
      <div className="resource-filters"><label>Minimum capacity<input type="number" min="0" value={minCapacity} onChange={(event) => setMinCapacity(event.target.value)} placeholder="Any"/></label><label>Max price (₹)<input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Any"/></label><label>Available from<input type="datetime-local" value={availableStart} onChange={(event) => setAvailableStart(event.target.value)}/></label><label>Available until<input type="datetime-local" value={availableEnd} onChange={(event) => setAvailableEnd(event.target.value)}/></label></div>
    </section>

    {loading ? <div className="panel empty-state" role="status"><LoaderCircle size={20} className="spin"/> Loading resources…</div>
      : error ? <div className="panel empty-state error-cell" role="alert">{error}<small>Check database connection and schema setup.</small></div>
      : resources.length === 0 ? <div className="panel empty-state">No active resources match these filters.</div>
      : <section className="resource-grid" aria-label="Available resources">{resources.map((resource) => <article className="resource-card" key={resource.resource_id}>
        <div className={`resource-visual ${resourceTone(resource.type_name)}`}><span className="resource-type"><Boxes size={13}/>{resource.type_name}</span><span className="resource-illustration"><CalendarCheck size={31}/></span><span className="resource-status"><i/> Active</span></div>
        <div className="resource-card-body"><h2>{resource.resource_name}</h2><p>{resource.description || 'No description provided.'}</p>
          <div className="resource-detail"><span><MapPin size={14}/>{resource.location || 'Location not specified'}</span><span><Users size={14}/>{resource.capacity === null ? `${resource.quantity_available} units` : `Capacity ${resource.capacity}`}</span></div>
          <div className="resource-card-footer"><strong>{formatCurrency(resource.base_price)}</strong><div className="resource-actions">{mayRequest && <button type="button" className="button small-button" onClick={() => openAllocation(resource)} disabled={events.length === 0}>Request</button>}{mayManageResources && (user?.role_name === 'ADMIN' || Number(resource.owner_id) === user?.user_id) && <><button type="button" className="button small-button" onClick={() => setEditingResource(resource)}>Edit</button><button type="button" className="button small-button" onClick={() => setAvailabilityResource(resource)}><Clock3 size={13}/> Availability</button></>}</div></div>
        </div>
      </article>)}</section>}
    {!loading && !error && events.length === 0 && <div className="resource-note"><span className="note-symbol">✦</span><p><strong>Create an event first</strong><br/>Resources can be reserved after an event exists.</p></div>}
    <div className="resource-note"><span className="note-symbol"><CalendarCheck size={15}/></span><p><strong>Availability and capacity</strong><br/>Date filters exclude unavailable periods and overlapping pending or confirmed reservations. Capacity and quantity are validated again when you submit a request.</p></div>
  </>;
}
