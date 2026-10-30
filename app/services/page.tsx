'use client';

import { FormEvent, useEffect, useState } from 'react';
import { BriefcaseBusiness, CalendarDays, LoaderCircle, Plus, Star } from 'lucide-react';

type Service = {
  service_id: number;
  service_name: string;
  description: string | null;
  price: number | string;
  duration_minutes: number | null;
  business_name: string;
  business_category: string;
  rating: number | string;
};
type EventOption = { event_id: number; event_name: string; start_datetime: string; end_datetime: string };
type User = { role_name: string; user_id: number };

function localDate(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [bookingEventId, setBookingEventId] = useState('');
  const [bookingStart, setBookingStart] = useState('');
  const [bookingEnd, setBookingEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const [serviceResponse, eventResponse, userResponse] = await Promise.all([
          fetch('/api/services', { signal: controller.signal }),
          fetch('/api/events', { signal: controller.signal }),
          fetch('/api/auth/me', { signal: controller.signal }),
        ]);
        const [serviceBody, eventBody, userBody] = await Promise.all([serviceResponse.json(), eventResponse.json(), userResponse.json()]);
        if (!serviceResponse.ok) throw new Error(serviceBody.error || 'Could not load vendor services.');
        if (!eventResponse.ok) throw new Error(eventBody.error || 'Could not load events.');
        setServices(serviceBody.data);
        setEvents(eventBody.data);
        setUser(userResponse.ok ? userBody.data : null);
        setError('');
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load vendor services.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [refresh]);

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    try {
      const response = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceName: data.get('serviceName'), description: data.get('description') || null,
          price: Number(data.get('price')), durationMinutes: data.get('durationMinutes') ? Number(data.get('durationMinutes')) : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not add service.');
      form.reset();
      setMessage('Service published.');
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not add service.');
    } finally {
      setSaving(false);
    }
  }

  async function bookService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const chosenEvent = events.find((entry) => String(entry.event_id) === bookingEventId);
    if (!chosenEvent) {
      setMessage('Choose an event for this service booking.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/service-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: Number(chosenEvent.event_id), serviceId: selectedService.service_id,
          startDatetime: new Date(bookingStart).toISOString(),
          endDatetime: new Date(bookingEnd).toISOString(),
          quotedPrice: Number(data.get('quotedPrice')),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not request service.');
      setSelectedService(null);
      setMessage('Service request sent to the vendor for confirmation.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not request service.');
    } finally {
      setSaving(false);
    }
  }

  const canOffer = user?.role_name === 'VENDOR';
  const canBook = user?.role_name === 'ADMIN' || user?.role_name === 'ORGANIZER';

  return <>
    <header className="topbar"><div><div className="eyebrow">YOUR WORKSPACE / MARKETPLACE</div><h1>Vendor services</h1><p className="subheading">Discover and coordinate verified event services.</p></div></header>
    {message && <div className="inline-message" role="status">{message}</div>}
    {canOffer && <section className="panel form-panel"><div className="panel-heading"><div><h2><Plus size={17}/> List a service</h2><p>Vendor listings become visible when an administrator verifies your profile.</p></div></div>
      <form className="event-form" onSubmit={createService}><label>Service name<input name="serviceName" required minLength={2}/></label><label>Price (₹)<input name="price" type="number" required min="0" step="0.01"/></label><label>Duration (minutes)<input name="durationMinutes" type="number" min="1" placeholder="Optional"/></label><label>Description<input name="description" maxLength={5000}/></label><div className="form-actions"><button className="button primary" disabled={saving}>{saving && <LoaderCircle size={15} className="spin"/>} Publish service</button></div></form>
    </section>}
    {selectedService && <section className="panel form-panel"><div className="panel-heading"><div><h2>Request {selectedService.service_name}</h2><p>Vendor confirmation is required before the booking is final.</p></div><button className="icon-button" onClick={() => setSelectedService(null)} aria-label="Close booking form">×</button></div>
      <form className="event-form" onSubmit={bookService}><label>Event<select name="eventId" required value={bookingEventId} onChange={(change) => { const chosen = events.find((entry) => String(entry.event_id) === change.target.value); setBookingEventId(change.target.value); setBookingStart(chosen ? localDate(chosen.start_datetime) : ''); setBookingEnd(chosen ? localDate(chosen.end_datetime) : ''); }}><option value="" disabled>Choose an event</option>{events.map((event) => <option value={event.event_id} key={event.event_id}>{event.event_name}</option>)}</select></label><label>Quoted price (₹)<input name="quotedPrice" type="number" min="0" step="0.01" defaultValue={Number(selectedService.price)} required/></label><label>Start<input name="startDatetime" type="datetime-local" required value={bookingStart} onChange={(change) => setBookingStart(change.target.value)}/></label><label>End<input name="endDatetime" type="datetime-local" required value={bookingEnd} onChange={(change) => setBookingEnd(change.target.value)}/></label><div className="form-actions"><button className="button primary" disabled={saving || events.length === 0}>Request booking</button></div></form>
    </section>}
    {loading ? <div className="panel empty-state"><LoaderCircle size={18} className="spin"/> Loading services…</div>
      : error ? <div className="panel empty-state error-cell" role="alert">{error}</div>
      : services.length === 0 ? <div className="panel empty-state">No verified vendor services are available yet.</div>
      : <section className="service-grid">{services.map((service) => <article className="panel service-card" key={service.service_id}><span className="stat-icon violet"><BriefcaseBusiness size={19}/></span><h2>{service.service_name}</h2><p>{service.description || 'Vendor-provided event service.'}</p><div className="service-vendor">{service.business_name} · {service.business_category}</div><div className="service-footer"><strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(service.price))}</strong><span><Star size={13}/>{Number(service.rating).toFixed(1)}</span></div>{canBook && <button className="button secondary" onClick={() => { setSelectedService(service); const first = events[0]; setBookingEventId(first ? String(first.event_id) : ''); setBookingStart(first ? localDate(first.start_datetime) : ''); setBookingEnd(first ? localDate(first.end_datetime) : ''); }}><CalendarDays size={15}/> Request booking</button>}</article>)}</section>}
  </>;
}
