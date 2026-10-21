'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Users, Wallet, Boxes, Plus, Clock3, MapPin, ChevronRight, Sparkles, LoaderCircle } from 'lucide-react';

type EventRow = {
  event_id: number | string;
  event_name: string;
  event_type: string;
  start_datetime: string;
  end_datetime: string;
  location: string | null;
  expected_attendees: number;
  total_budget: number | string;
  status: string;
};

type ResourceRow = { resource_id: number | string; type_name: string };

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function eventDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value)).toUpperCase();
}

function eventTime(start: string, end: string) {
  const format = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${format.format(new Date(start))} – ${format.format(new Date(end))}`;
}

export default function Home() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function loadOverview() {
      try {
        const [eventResponse, resourceResponse] = await Promise.all([
          fetch('/api/events', { signal: controller.signal }),
          fetch('/api/resources', { signal: controller.signal }),
        ]);
        const [eventBody, resourceBody] = await Promise.all([eventResponse.json(), resourceResponse.json()]);
        if (!eventResponse.ok) throw new Error(eventBody.error || 'Could not load events.');
        if (!resourceResponse.ok) throw new Error(resourceBody.error || 'Could not load resources.');
        setEvents(eventBody.data);
        setResources(resourceBody.data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load your overview.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadOverview();
    return () => controller.abort();
  }, []);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return events
      .filter((event) => new Date(event.end_datetime).getTime() >= now && !['CANCELLED', 'COMPLETED'].includes(event.status))
      .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());
  }, [events]);
  const expectedAttendees = upcoming.reduce((total, event) => total + Number(event.expected_attendees || 0), 0);
  const plannedBudget = upcoming.reduce((total, event) => total + Number(event.total_budget || 0), 0);
  const resourceGroups = resources.reduce<Record<string, number>>((groups, resource) => {
    groups[resource.type_name] = (groups[resource.type_name] || 0) + 1;
    return groups;
  }, {});
  const eventColors = ['lavender', 'peach', 'mint'];

  return <>
    <header className="topbar">
      <div><div className="eyebrow">PLANORA / OVERVIEW</div><h1>Your event workspace <span className="wave">✳</span></h1><p className="subheading">A live look at events and resources in your database.</p></div>
      <Link className="button primary" href="/events"><Plus size={17}/> Create event</Link>
    </header>
    <section className="welcome-banner">
      <div className="banner-copy">
        <span className="banner-tag"><Sparkles size={13}/> YOUR EVENT WORKSPACE</span>
        <h2>Big ideas. Beautifully coordinated.</h2>
        <p>Bring every detail, resource, and team together in one place.</p>
        <Link href="/events" className="banner-link">Plan your next event <ArrowUpRight size={16}/></Link>
      </div>
      <div className="banner-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-card"><CalendarDays size={23}/><strong>It all comes<br/>together.</strong><span>One plan, every detail.</span></div><span className="spark spark-a">✦</span><span className="spark spark-b">✳</span><span className="spark spark-c">✧</span></div>
    </section>

    {error && <div className="inline-message error-cell" role="alert">{error} Check your database connection and schema setup.</div>}
    <div className="section-heading"><div><h2>Your overview</h2><p>Live totals for upcoming events and active resources.</p></div></div>
    <section className="stats-grid">
      <article className="stat-card"><div className="stat-top"><span>Upcoming events</span><span className="stat-icon violet"><CalendarDays size={18}/></span></div><div className="stat-number">{loading ? '—' : upcoming.length}</div><div className="stat-foot">From your event records</div></article>
      <article className="stat-card"><div className="stat-top"><span>Expected attendees</span><span className="stat-icon amber"><Users size={18}/></span></div><div className="stat-number">{loading ? '—' : expectedAttendees.toLocaleString('en-IN')}</div><div className="stat-foot">Across upcoming events</div></article>
      <article className="stat-card"><div className="stat-top"><span>Planned budget</span><span className="stat-icon green"><Wallet size={18}/></span></div><div className="stat-number stat-number-currency">{loading ? '—' : money(plannedBudget)}</div><div className="stat-foot">Combined upcoming event budgets</div></article>
      <article className="stat-card"><div className="stat-top"><span>Active resources</span><span className="stat-icon blue"><Boxes size={18}/></span></div><div className="stat-number">{loading ? '—' : resources.length}</div><div className="stat-foot">Listed in your resource catalogue</div></article>
    </section>

    <div className="content-grid">
      <section className="panel events-panel">
        <div className="panel-heading"><div><h2>Upcoming events</h2><p>Your next moments in the making.</p></div><Link href="/events" className="text-link">View all <ChevronRight size={16}/></Link></div>
        {loading ? <div className="empty-state"><LoaderCircle size={17} className="spin"/> Loading event records…</div>
          : upcoming.length === 0 ? <div className="empty-state">No upcoming events yet. Create your first event to get started.</div>
          : <div className="event-list">{upcoming.slice(0, 4).map((event, index) => <article className="event-row" key={event.event_id}>
            <div className={`event-monogram ${eventColors[index % eventColors.length]}`}>{event.event_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
            <div className="event-main"><div className="event-title-line"><strong>{event.event_name}</strong><span className={`status ${event.status === 'CONFIRMED' ? 'confirmed' : ''}`}>{event.status}</span></div><div className="event-type">{event.event_type}</div><div className="event-meta"><span><CalendarDays size={13}/>{eventDate(event.start_datetime)}</span><span><Clock3 size={13}/>{eventTime(event.start_datetime, event.end_datetime)}</span><span><MapPin size={13}/>{event.location || 'Location not set'}</span></div></div>
            <div className="event-attendees"><strong>{Number(event.expected_attendees).toLocaleString('en-IN')}</strong><small>attendees</small></div>
          </article>)}</div>}
        <div className="panel-footer"><span>{loading ? 'Loading records' : `Showing ${Math.min(4, upcoming.length)} of ${upcoming.length} upcoming events`}</span><Link href="/events">Explore events <ArrowUpRight size={14}/></Link></div>
      </section>

      <aside className="right-column">
        <section className="panel allocation-panel">
          <div className="panel-heading"><div><h2>Resource catalogue</h2><p>Active resources by category.</p></div><Boxes size={18} className="panel-icon"/></div>
          {loading ? <div className="resource-breakdown">Loading resource records…</div>
            : resources.length === 0 ? <div className="resource-breakdown">No active resources listed.</div>
            : <div className="resource-breakdown">{Object.entries(resourceGroups).map(([name, count]) => <div key={name}><span><i className="dot dot-violet"/>{name}</span><strong>{count}</strong></div>)}</div>}
          <Link href="/resources" className="panel-action">Manage resources <ArrowUpRight size={15}/></Link>
        </section>
        <section className="tip-card"><div className="tip-icon"><Sparkles size={18}/></div><div><span className="tip-label">A LITTLE NUDGE</span><h3>Plan ahead, stress less.</h3><p>Check resource availability early to avoid last-minute scheduling conflicts.</p><Link href="/resources">Check availability <ArrowUpRight size={14}/></Link></div></section>
      </aside>
    </div>
    <footer className="page-footer"><span>© 2026 Planora Studio</span><span>Thoughtfully planned, beautifully done <span className="footer-star">✳</span></span></footer>
  </>;
}
