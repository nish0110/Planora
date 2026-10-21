'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not sign in.');
      const next = new URLSearchParams(window.location.search).get('next');
      const destination = next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
        ? new URL(next, window.location.origin)
        : new URL('/', window.location.origin);
      router.replace(destination.origin === window.location.origin ? `${destination.pathname}${destination.search}${destination.hash}` : '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="auth-shell"><section className="auth-card">
    <Link href="/login" className="brand auth-brand"><span className="brand-mark"><Sparkles size={19}/></span><span>planora<small>EVENT STUDIO</small></span></Link>
    <div className="eyebrow">WELCOME BACK</div><h1>Sign in to Planora</h1><p className="subheading">Manage your events and coordinate every detail.</p>
    <form className="auth-form" onSubmit={submit}>
      <label>Email<input type="email" name="email" required autoComplete="email"/></label>
      <label>Password<input type="password" name="password" required autoComplete="current-password"/></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary" type="submit" disabled={saving}>{saving && <LoaderCircle size={15} className="spin"/>} Sign in</button>
    </form>
    <p className="auth-foot">First time setting up this database? <Link href="/register">Create the initial administrator</Link></p>
  </section></div>;
}
