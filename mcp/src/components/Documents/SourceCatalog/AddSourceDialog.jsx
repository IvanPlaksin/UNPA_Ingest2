/**
 * AddSourceDialog
 * Create or edit a Source Catalog entry.
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Typography, Select,
  MenuItem, FormControl, InputLabel, Chip, IconButton,
  Accordion, AccordionSummary, AccordionDetails, Divider,
  Alert
} from '@mui/material';
import { ChevronDown, X } from 'lucide-react';
import { createSource, updateSource } from '../../../services/sourceCatalog.service';

const NAMESPACES = ['DEFAULT', 'INEED', 'KM', 'HR', 'FINANCE', 'PROCUREMENT', 'LEGAL', 'IT', 'AUDIT'];

const TYPE_META = {
  URL_CATALOG:  { label: 'Web Page Catalog',        desc: 'HTML page with downloadable document links', color: 'primary' },
  REST_API:     { label: 'REST API',                desc: 'Configurable REST/JSON endpoint',            color: 'secondary' },
  RSS_FEED:     { label: 'RSS / Atom Feed',          desc: 'Syndication feed (XML)',                    color: 'info' },
  ODS_API:      { label: 'UN Official Documents',   desc: 'documents.un.org search',                   color: 'warning' },
  OIOS_PORTAL:  { label: 'OIOS Reports Portal',     desc: 'UN OIOS evaluation reports',                color: 'success' },
};

function UrlCatalogFields({ cfg, onChange }) {
  return (
    <Stack spacing={2}>
      <TextField label="Page URL *" value={cfg.url || ''} onChange={e => onChange({ ...cfg, url: e.target.value })}
        fullWidth size="small" placeholder="https://example.org/documents" />
      <TextField label="Search URL Template" value={cfg.searchUrlTemplate || ''}
        onChange={e => onChange({ ...cfg, searchUrlTemplate: e.target.value })}
        fullWidth size="small" placeholder="https://example.org/search?q={query}"
        helperText="Use {query} as placeholder. Leave empty for client-side filter." />
      <TextField label="Link Filter (substring)" value={cfg.linkFilter || ''}
        onChange={e => onChange({ ...cfg, linkFilter: e.target.value })}
        fullWidth size="small" placeholder=".pdf" helperText="Only include links containing this substring" />
    </Stack>
  );
}

function RestApiFields({ cfg, onChange }) {
  const upd = (key, val) => onChange({ ...cfg, [key]: val });
  const updMapping = (key, val) => onChange({ ...cfg, responseMapping: { ...(cfg.responseMapping || {}), [key]: val } });
  const m = cfg.responseMapping || {};

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1}>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Method</InputLabel>
          <Select value={cfg.method || 'GET'} label="Method" onChange={e => upd('method', e.target.value)}>
            {['GET', 'POST'].map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Endpoint URL *" value={cfg.endpoint || ''} onChange={e => upd('endpoint', e.target.value)}
          fullWidth size="small" placeholder="https://api.example.org/documents" />
      </Stack>
      <TextField label="Search parameter name" value={cfg.searchParam || ''} onChange={e => upd('searchParam', e.target.value)}
        fullWidth size="small" placeholder="q" helperText="Query string key for the search term" />
      <TextField label="Fixed query parameters (JSON)" value={cfg._queryParamsText || JSON.stringify(cfg.queryParams || {})}
        onChange={e => { try { upd('queryParams', JSON.parse(e.target.value)); } catch {} upd('_queryParamsText', e.target.value); }}
        fullWidth size="small" multiline minRows={2} placeholder='{"format": "json", "size": "20"}' />

      <Divider><Typography variant="caption">Auth</Typography></Divider>
      <FormControl size="small">
        <InputLabel>Auth type</InputLabel>
        <Select value={cfg.auth?.type || 'none'} label="Auth type"
          onChange={e => upd('auth', { ...(cfg.auth || {}), type: e.target.value })}>
          {['none', 'bearer', 'apiKey', 'basic'].map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </Select>
      </FormControl>
      {cfg.auth?.type === 'bearer' && (
        <TextField label="Bearer token" value={cfg.auth?.token || ''} size="small" fullWidth type="password"
          onChange={e => upd('auth', { ...cfg.auth, token: e.target.value })} />
      )}
      {cfg.auth?.type === 'apiKey' && (
        <Stack direction="row" spacing={1}>
          <TextField label="Header name" value={cfg.auth?.headerName || 'X-API-Key'} size="small"
            onChange={e => upd('auth', { ...cfg.auth, headerName: e.target.value })} />
          <TextField label="API key" value={cfg.auth?.key || ''} size="small" type="password" fullWidth
            onChange={e => upd('auth', { ...cfg.auth, key: e.target.value })} />
        </Stack>
      )}
      {cfg.auth?.type === 'basic' && (
        <Stack direction="row" spacing={1}>
          <TextField label="Username" value={cfg.auth?.username || ''} size="small"
            onChange={e => upd('auth', { ...cfg.auth, username: e.target.value })} />
          <TextField label="Password" value={cfg.auth?.password || ''} size="small" type="password"
            onChange={e => upd('auth', { ...cfg.auth, password: e.target.value })} />
        </Stack>
      )}

      <Divider><Typography variant="caption">Response mapping (dot-path)</Typography></Divider>
      {[
        { key: 'items', label: 'Items array', ph: 'data.results' },
        { key: 'title', label: 'Title field',  ph: 'title' },
        { key: 'url',   label: 'URL field',    ph: 'download_url' },
        { key: 'date',  label: 'Date field',   ph: 'published_at' },
        { key: 'total', label: 'Total count',  ph: 'meta.total' },
        { key: 'symbol',label: 'Symbol field', ph: 'document_symbol' },
      ].map(({ key, label, ph }) => (
        <TextField key={key} label={label} value={m[key] || ''} size="small"
          onChange={e => updMapping(key, e.target.value)} placeholder={ph} fullWidth />
      ))}
    </Stack>
  );
}

function RssFeedFields({ cfg, onChange }) {
  return (
    <TextField label="Feed URL *" value={cfg.url || ''} onChange={e => onChange({ ...cfg, url: e.target.value })}
      fullWidth size="small" placeholder="https://example.org/feed.xml" />
  );
}

function OdsFields({ cfg, onChange }) {
  return (
    <Stack spacing={2}>
      <TextField label="Default symbol prefix / query" value={cfg.defaultQuery || ''}
        onChange={e => onChange({ ...cfg, defaultQuery: e.target.value })}
        fullWidth size="small" placeholder="A/ or S/RES/" helperText="Pre-fill the search box when browsing" />
      <FormControl size="small">
        <InputLabel>Language</InputLabel>
        <Select value={cfg.language || 'E'} label="Language"
          onChange={e => onChange({ ...cfg, language: e.target.value })}>
          {[['E','English'],['F','Français'],['S','Español'],['R','Русский'],['A','العربية'],['C','中文']].map(([v,l]) => (
            <MenuItem key={v} value={v}>{l}</MenuItem>
          ))}
        </Select>
      </FormControl>
    </Stack>
  );
}

function OiosFields({ cfg, onChange }) {
  return (
    <TextField label="Portal URL" value={cfg.url || 'https://oios.un.org/resources/'}
      onChange={e => onChange({ ...cfg, url: e.target.value })}
      fullWidth size="small" />
  );
}

const CONFIG_FIELDS = {
  URL_CATALOG:  UrlCatalogFields,
  REST_API:     RestApiFields,
  RSS_FEED:     RssFeedFields,
  ODS_API:      OdsFields,
  OIOS_PORTAL:  OiosFields,
};

export default function AddSourceDialog({ open, source, onClose, onSaved }) {
  const isEdit = Boolean(source?.id);

  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [type,        setType]        = useState('URL_CATALOG');
  const [namespace,   setNamespace]   = useState('DEFAULT');
  const [config,      setConfig]      = useState({});
  const [tag,         setTag]         = useState('');
  const [tags,        setTags]        = useState([]);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    if (open) {
      if (source) {
        setName(source.name || '');
        setDescription(source.description || '');
        setType(source.type || 'URL_CATALOG');
        setNamespace(source.namespace || 'DEFAULT');
        setConfig(source.config || {});
        setTags(source.tags || []);
      } else {
        setName(''); setDescription(''); setType('URL_CATALOG');
        setNamespace('DEFAULT'); setConfig({}); setTags([]);
      }
      setError(null);
    }
  }, [open, source]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError(null);
    try {
      const payload = { name: name.trim(), description, type, namespace, config, tags };
      const result = isEdit
        ? await updateSource(source.id, payload)
        : await createSource(payload);
      onSaved?.(result.data);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
    setSaving(false);
  };

  const ConfigFields = CONFIG_FIELDS[type] || UrlCatalogFields;
  const meta = TYPE_META[type];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {isEdit ? 'Edit Source' : 'Add Information Source'}
        </Typography>
        <IconButton size="small" onClick={onClose}><X size={16} /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Stack spacing={2.5}>
          {/* Base fields */}
          <Stack direction="row" spacing={1.5}>
            <TextField label="Name *" value={name} onChange={e => setName(e.target.value)}
              fullWidth size="small" />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Namespace</InputLabel>
              <Select value={namespace} label="Namespace" onChange={e => setNamespace(e.target.value)}>
                {NAMESPACES.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>

          <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)}
            fullWidth size="small" multiline minRows={2} />

          {/* Type selector */}
          <FormControl size="small" fullWidth>
            <InputLabel>Source Type</InputLabel>
            <Select value={type} label="Source Type" onChange={e => { setType(e.target.value); setConfig({}); }}>
              {Object.entries(TYPE_META).map(([k, v]) => (
                <MenuItem key={k} value={k}>
                  <Stack>
                    <Typography variant="body2">{v.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{v.desc}</Typography>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {meta && (
            <Chip label={meta.label} color={meta.color} size="small" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
          )}

          {/* Type-specific config */}
          <Accordion defaultExpanded elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px !important' }}>
            <AccordionSummary expandIcon={<ChevronDown size={16} />}>
              <Typography variant="subtitle2">Connection Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <ConfigFields cfg={config} onChange={setConfig} />
            </AccordionDetails>
          </Accordion>

          {/* Tags */}
          <Stack spacing={1}>
            <Typography variant="caption" color="text.secondary">Tags</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap">
              {tags.map(t => (
                <Chip key={t} label={t} size="small" onDelete={() => setTags(tags.filter(x => x !== t))} />
              ))}
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField value={tag} onChange={e => setTag(e.target.value)} size="small" placeholder="Add tag"
                onKeyDown={e => { if (e.key === 'Enter' && tag.trim()) { setTags([...tags, tag.trim()]); setTag(''); } }} />
              <Button size="small" variant="outlined" disabled={!tag.trim()}
                onClick={() => { setTags([...tags, tag.trim()]); setTag(''); }}>Add</Button>
            </Stack>
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Source'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
