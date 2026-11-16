'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Plus, RefreshCw, Tag } from 'lucide-react';

type CatalogItem = {
  id: string;
  vendorId: number;
  source: string;
  externalId: string;
  title: string;
  description: string;
  category: string;
  sourceUrl: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
  importedAt: string;
};

async function readJson(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

export default function VendorCatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [source, setSource] = useState('');
  const [externalId, setExternalId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [attributesText, setAttributesText] = useState('{}');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadCatalog = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/vendor-catalog', { signal });
      const body = await readJson(response);
      setItems(body.data);
    } catch (loadError) {
      if (!signal?.aborted) setError(loadError instanceof Error ? loadError.message : 'Could not load imported catalog data.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadCatalog(controller.signal);
    return () => controller.abort();
  }, [loadCatalog]);

  async function importItem(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError('');
    setMessage('');
    let attributes: unknown;
    try {
      attributes = JSON.parse(attributesText);
    } catch {
      setError('Attributes must be valid JSON.');
      return;
    }
    if (attributes === null || Array.isArray(attributes) || typeof attributes !== 'object') {
      setError('Attributes must be a JSON object.');
      return;
    }

    const payload: Record<string, unknown> = {
      source,
      externalId,
      title,
      description,
      category,
      tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
      attributes,
    };
    if (sourceUrl.trim()) payload.sourceUrl = sourceUrl.trim();
    if (vendorId.trim()) payload.vendorId = Number(vendorId);

    setSaving(true);
    try {
      const response = await fetch('/api/vendor-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await readJson(response);
      setMessage(response.status === 201 ? 'Vendor catalog item imported.' : 'Existing imported item updated.');
      setTitle('');
      setDescription('');
      setExternalId('');
      setSourceUrl('');
      setTagsText('');
      setAttributesText('{}');
      await loadCatalog();
      if (body.data?.id) setItems((current) => current.some((item) => item.id === body.data.id) ? current : [body.data, ...current]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not import catalog item.');
    } finally {
      setSaving(false);
    }
  }

  return <>
    <header className="topbar">
      <div><div className="eyebrow">YOUR WORKSPACE / MONGO DOCUMENTS</div><h1>Imported vendor catalog</h1><p className="subheading">Flexible imported descriptions and tags, separate from transactional inventory.</p></div>
      <button type="button" className="button secondary" onClick={() => void loadCatalog()} disabled={loading}><RefreshCw size={15}/> Refresh</button>
    </header>
    <div className="resource-note mongo-note"><span className="note-symbol"><Tag size={18}/></span><p><strong>MongoDB stores imported catalog descriptions only.</strong> Vendor ownership is referenced by its PostgreSQL vendor ID. Prices, availability, quantities, and bookings are never imported or stored here.</p></div>
    {error && <div className="inline-message error-cell" role="alert">{error}</div>}
    {message && <div className="inline-message" role="status">{message}</div>}

    <section className="panel form-panel">
      <div className="panel-heading"><div><h2>Import or refresh an item</h2><p>Items with the same vendor, source, and external ID are updated idempotently.</p></div></div>
      <form className="event-form" onSubmit={importItem}>
        <label>Source name<input value={source} onChange={(event) => setSource(event.target.value)} maxLength={100} required placeholder="vendor-feed"/></label>
        <label>External item ID<input value={externalId} onChange={(event) => setExternalId(event.target.value)} maxLength={200} required/></label>
        <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required/></label>
        <label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={100} required/></label>
        <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000}/></label>
        <label>Source URL (HTTPS)<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…"/></label>
        <label>Tags (comma-separated)<input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="decor, outdoor"/></label>
        <label>Flexible attributes (JSON)<textarea value={attributesText} onChange={(event) => setAttributesText(event.target.value)} rows={4} spellCheck={false}/></label>
        <label className="wide-field">PostgreSQL vendor ID (admins fill this; vendors leave blank)<input type="number" min="1" value={vendorId} onChange={(event) => setVendorId(event.target.value)} placeholder="Assigned automatically to vendors"/></label>
        <div className="form-actions"><button className="button primary" disabled={saving}>{saving && <LoaderCircle size={15} className="spin"/>}<Plus size={15}/> Import item</button></div>
      </form>
    </section>

    <section className="panel table-panel mongo-catalog-panel">
      <div className="panel-heading"><div><h2>Imported items</h2><p>Showing up to 100 most recently imported documents.</p></div></div>
      {loading ? <div className="empty-state"><LoaderCircle size={16} className="spin"/> Loading imported catalog…</div> : items.length === 0 ? <div className="empty-state">No catalog documents have been imported.</div> : <div className="mongo-catalog-list">
        {items.map((item) => <article className="mongo-catalog-item" key={item.id}>
          <div className="mongo-catalog-heading"><div><span className="status">{item.category}</span><h3>{item.title}</h3></div><small>Vendor #{item.vendorId}</small></div>
          <p>{item.description || 'No description.'}</p>
          <div className="mongo-catalog-meta"><span>{item.source} / {item.externalId}</span><span>Imported {new Date(item.importedAt).toLocaleString()}</span></div>
          {item.tags.length > 0 && <div className="mongo-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
          {Object.keys(item.attributes).length > 0 && <details className="mongo-catalog-details"><summary>Descriptive attributes</summary><pre>{JSON.stringify(item.attributes, null, 2)}</pre></details>}
          {item.sourceUrl && <a className="text-link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Open source listing</a>}
        </article>)}
      </div>}
    </section>
  </>;
}
