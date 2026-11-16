'use client';

import { FormEvent, useEffect, useState } from 'react';
import { FileText, LoaderCircle, Plus, Trash2 } from 'lucide-react';

type EventAttachment = { name: string; url: string; description: string };
type EventMetadata = { metadata: Record<string, unknown>; attachments: EventAttachment[] };

export function EventMetadataPanel({ eventId }: { eventId: string }) {
  const [metadataText, setMetadataText] = useState('{}');
  const [attachments, setAttachments] = useState<EventAttachment[]>([]);
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentDescription, setAttachmentDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/events/${eventId}/metadata`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load event metadata.');
        const data = body.data as EventMetadata;
        setMetadataText(JSON.stringify(data.metadata, null, 2));
        setAttachments(data.attachments);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load event metadata.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [eventId]);

  function addAttachment(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError('');
    setMessage('');
    setAttachments((current) => [...current, {
      name: attachmentName.trim(),
      url: attachmentUrl.trim(),
      description: attachmentDescription.trim(),
    }]);
    setAttachmentName('');
    setAttachmentUrl('');
    setAttachmentDescription('');
  }

  async function saveMetadata() {
    setError('');
    setMessage('');
    let metadata: unknown;
    try {
      metadata = JSON.parse(metadataText);
    } catch {
      setError('Metadata must be valid JSON.');
      return;
    }
    if (metadata === null || Array.isArray(metadata) || typeof metadata !== 'object') {
      setError('Metadata must be a JSON object.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/events/${eventId}/metadata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata, attachments }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save event metadata.');
      setMetadataText(JSON.stringify(body.data.metadata, null, 2));
      setAttachments(body.data.attachments);
      setMessage('Event metadata saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save event metadata.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel form-panel">
    <div className="panel-heading">
      <div><h2><FileText size={16}/> Event notes & attachments</h2><p>Flexible metadata and HTTPS attachment references stored in MongoDB.</p></div>
    </div>
    {loading ? <div className="empty-state"><LoaderCircle size={16} className="spin"/> Loading MongoDB document…</div> : <>
      {error && <div className="inline-message error-cell" role="alert">{error}</div>}
      {message && <div className="inline-message" role="status">{message}</div>}
      <div className="event-form mongo-metadata-form">
        <label className="wide-field">Metadata JSON<textarea value={metadataText} onChange={(event) => setMetadataText(event.target.value)} rows={7} spellCheck={false}/><small>Use for flexible notes only; prices, budgets, availability and bookings stay in PostgreSQL.</small></label>
      </div>
      <div className="operation-list">
        {attachments.length === 0 ? <div className="empty-state">No attachment references added.</div> : attachments.map((attachment, index) => <article className="operation-row" key={`${attachment.url}-${index}`}>
          <div><strong>{attachment.name}</strong><small>{attachment.description || 'No description'}</small><a className="text-link" href={attachment.url} target="_blank" rel="noopener noreferrer">{attachment.url}</a></div>
          <button type="button" className="icon-button" aria-label={`Remove ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15}/></button>
        </article>)}
      </div>
      <form className="compact-form" onSubmit={addAttachment}>
        <h3><Plus size={15}/> Add attachment reference</h3>
        <div className="compact-form-row">
          <label>Name<input value={attachmentName} onChange={(event) => setAttachmentName(event.target.value)} maxLength={180} required/></label>
          <label>HTTPS URL<input type="url" value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} placeholder="https://…" required/></label>
        </div>
        <label>Description<input value={attachmentDescription} onChange={(event) => setAttachmentDescription(event.target.value)} maxLength={500}/></label>
        <button className="button secondary">Add reference</button>
      </form>
      <div className="form-actions mongo-save-actions">
        <button className="button primary" type="button" onClick={saveMetadata} disabled={saving}>{saving && <LoaderCircle size={15} className="spin"/>} Save MongoDB document</button>
      </div>
    </>}
  </section>;
}
