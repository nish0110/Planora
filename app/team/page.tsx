'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Plus, ShieldCheck, UserRoundPlus } from 'lucide-react';
import Link from 'next/link';

type Member = {
  user_id: number;
  full_name: string;
  email: string;
  status: string;
  role_name: string;
  vendor_id: number | null;
  business_name: string | null;
  verification_status: string | null;
};

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch('/api/users', { signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load workspace members.');
      setMembers(body.data);
      setError('');
    } catch (err) {
      if (!signal.aborted) setError(err instanceof Error ? err.message : 'Could not load workspace members.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refresh]);

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const roleName = String(values.get('roleName'));
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: values.get('fullName'), email: values.get('email'), password: values.get('password'),
          roleName,
          businessName: roleName === 'VENDOR' ? values.get('businessName') : undefined,
          businessCategory: roleName === 'VENDOR' ? values.get('businessCategory') : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not create account.');
      form.reset();
      setMessage('Account created. Share the temporary credentials with the user securely.');
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setSaving(false);
    }
  }

  async function verifyVendor(vendorId: number, status: string) {
    try {
      const response = await fetch(`/api/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not update vendor status.');
      setMessage(`Vendor status updated to ${status}.`);
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update vendor.');
    }
  }

  async function updateMemberStatus(userId: number, status: string) {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not update account status.');
      setMessage(`Account ${status.toLowerCase()}.`);
      setRefresh((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update account.');
    }
  }

  return <>
    <header className="topbar"><div><div className="eyebrow">ADMIN / ACCESS CONTROL</div><h1>Team & access</h1><p className="subheading">Create role-based accounts and review vendor profiles.</p></div><Link href="/" className="button secondary"><ShieldCheck size={16}/> Workspace</Link></header>
    {message && <div className="inline-message" role="status">{message}</div>}
    <section className="panel form-panel"><div className="panel-heading"><div><h2><UserRoundPlus size={18}/> Add a member</h2><p>Create an account for an organizer, vendor, staff member, or attendee.</p></div></div>
      <form className="event-form" onSubmit={createMember}>
        <label>Full name<input name="fullName" required minLength={2} maxLength={120}/></label>
        <label>Email<input type="email" name="email" required maxLength={255}/></label>
        <label>Role<select name="roleName"><option value="ORGANIZER">Event Organizer</option><option value="VENDOR">Vendor</option><option value="STAFF">Staff</option><option value="ATTENDEE">Attendee</option></select></label>
        <label>Temporary password<input type="password" name="password" required minLength={10} placeholder="10+ chars, upper/lower/number"/><small>Tell them to use a unique password. Password is stored hashed.</small></label>
        <label>Vendor business name<input name="businessName" placeholder="Required for Vendor role"/></label>
        <label>Vendor category<input name="businessCategory" placeholder="Required for Vendor role"/></label>
        <div className="form-actions"><button className="button primary" disabled={saving}>{saving && <LoaderCircle size={15} className="spin"/>}<Plus size={15}/> Create account</button></div>
      </form>
    </section>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Workspace accounts</h2><p>Role access is enforced by the server on each API request.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>MEMBER</th><th>ROLE</th><th>STATUS</th><th>VENDOR PROFILE</th><th>VERIFICATION</th><th>ACCESS</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6}>Loading members…</td></tr> : error ? <tr><td colSpan={6} className="error-cell">{error}</td></tr> : members.length === 0 ? <tr><td colSpan={6}>No workspace users found.</td></tr> : members.map((member) => <tr key={member.user_id}><td><strong>{member.full_name}</strong><small>{member.email}</small></td><td>{member.role_name}</td><td><span className={`status ${member.status === 'ACTIVE' ? 'confirmed' : ''}`}>{member.status}</span></td><td>{member.business_name || '—'}</td><td>{member.vendor_id ? <div className="vendor-review"><span className={`status ${member.verification_status === 'VERIFIED' ? 'confirmed' : ''}`}>{member.verification_status}</span><select aria-label={`Vendor verification for ${member.business_name}`} value={member.verification_status || 'PENDING'} onChange={(event) => verifyVendor(member.vendor_id!, event.target.value)}><option value="PENDING">Pending</option><option value="VERIFIED">Verify</option><option value="REJECTED">Reject</option></select></div> : '—'}</td><td><button className="button secondary small-button" onClick={() => updateMemberStatus(member.user_id, member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}>{member.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button></td></tr>)}
      </tbody></table></div>
    </section>
  </>;
}
