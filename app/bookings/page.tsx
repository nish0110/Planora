'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, RotateCw } from 'lucide-react';

type Allocation = {
  allocation_id: number;
  event_name: string;
  resource_name: string;
  type_name: string;
  allocation_status: string;
  total_cost: number | string;
  start_datetime: string;
  end_datetime: string;
  cancellation_reason: string | null;
};
type ServiceBooking = {
  booking_id: number;
  event_name: string;
  service_name: string;
  business_name: string;
  booking_status: string;
  quoted_price: number | string;
  start_datetime: string;
};
type User = { role_name: string; user_id: number };

export default function BookingsPage() {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [serviceBookings, setServiceBookings] = useState<ServiceBooking[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const [allocationResponse, serviceResponse, userResponse] = await Promise.all([
        fetch('/api/allocations', { signal }),
        fetch('/api/service-bookings', { signal }),
        fetch('/api/auth/me', { signal }),
      ]);
      const [allocationBody, serviceBody, userBody] = await Promise.all([allocationResponse.json(), serviceResponse.json(), userResponse.json()]);
      if (!allocationResponse.ok) throw new Error(allocationBody.error || 'Could not load resource bookings.');
      if (!serviceResponse.ok) throw new Error(serviceBody.error || 'Could not load service bookings.');
      setAllocations(allocationBody.data);
      setServiceBookings(serviceBody.data);
      setUser(userResponse.ok ? userBody.data : null);
      setError('');
    } catch (err) {
      if (!signal.aborted) setError(err instanceof Error ? err.message : 'Could not load bookings.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refresh]);

  async function updateAllocation(id: number, action: string) {
    const reason = action === 'reject' ? window.prompt('Reason for rejecting (optional):') : undefined;
    try {
      const response = await fetch(`/api/allocations/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason || undefined }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not update booking.');
      setMessage(`Booking ${action}ed.`);
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update booking.');
    }
  }

  async function updateServiceBooking(id: number, status: string) {
    try {
      const response = await fetch(`/api/service-bookings/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not update service booking.');
      setMessage(`Service booking updated to ${status}.`);
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update service booking.');
    }
  }

  const canReview = user?.role_name === 'ADMIN' || user?.role_name === 'VENDOR';
  return <>
    <header className="topbar"><div><div className="eyebrow">YOUR WORKSPACE / COORDINATION</div><h1>Bookings</h1><p className="subheading">Track resource reservation requests and vendor services.</p></div><button className="button secondary" onClick={() => setRefresh((value) => value + 1)}><RotateCw size={15}/> Refresh</button></header>
    {message && <div className="inline-message" role="status">{message}</div>}
    {error && <div className="inline-message error-cell" role="alert">{error}</div>}
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Resource reservations</h2><p>Pending requests hold capacity until confirmed, rejected, or cancelled.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>EVENT</th><th>RESOURCE</th><th>PERIOD</th><th>COST</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6}>Loading reservations…</td></tr> : allocations.length === 0 ? <tr><td colSpan={6}>No resource reservations found.</td></tr> : allocations.map((item) => <tr key={item.allocation_id}><td><strong>{item.event_name}</strong></td><td>{item.resource_name}<small>{item.type_name}</small></td><td><CalendarDays size={14} className="inline-icon"/>{new Date(item.start_datetime).toLocaleString()}<small>to {new Date(item.end_datetime).toLocaleString()}</small></td><td>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(item.total_cost))}</td><td><span className={`status ${item.allocation_status === 'CONFIRMED' ? 'confirmed' : ''}`}>{item.allocation_status}</span>{item.cancellation_reason && <small>{item.cancellation_reason}</small>}</td><td><div className="table-actions">{item.allocation_status === 'PENDING' && canReview && <><button className="button small-button" onClick={() => updateAllocation(item.allocation_id, 'confirm')}>Confirm</button><button className="button danger-button small-button" onClick={() => updateAllocation(item.allocation_id, 'reject')}>Reject</button></>}{['PENDING', 'CONFIRMED'].includes(item.allocation_status) && <button className="button secondary small-button" onClick={() => updateAllocation(item.allocation_id, 'cancel')}>Cancel</button>}</div></td></tr>)}
      </tbody></table></div>
    </section>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Vendor service bookings</h2><p>Organizer requests remain pending until the vendor confirms them.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>EVENT</th><th>SERVICE</th><th>VENDOR</th><th>DATE</th><th>PRICE</th><th>STATUS / ACTION</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6}>Loading service requests…</td></tr> : serviceBookings.length === 0 ? <tr><td colSpan={6}>No vendor service bookings found.</td></tr> : serviceBookings.map((booking) => <tr key={booking.booking_id}><td>{booking.event_name}</td><td>{booking.service_name}</td><td>{booking.business_name}</td><td>{new Date(booking.start_datetime).toLocaleString()}</td><td>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(booking.quoted_price))}</td><td><div className="table-actions"><span className={`status ${booking.booking_status === 'CONFIRMED' ? 'confirmed' : ''}`}>{booking.booking_status}</span>{booking.booking_status === 'PENDING' && canReview && <button className="button small-button" onClick={() => updateServiceBooking(booking.booking_id, 'CONFIRMED')}>Confirm</button>}{['PENDING', 'CONFIRMED'].includes(booking.booking_status) && <button className="button secondary small-button" onClick={() => updateServiceBooking(booking.booking_id, 'CANCELLED')}>Cancel</button>}</div></td></tr>)}
      </tbody></table></div>
    </section>
  </>;
}
