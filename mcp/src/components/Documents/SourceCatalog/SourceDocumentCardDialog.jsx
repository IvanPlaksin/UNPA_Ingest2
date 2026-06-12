/**
 * SourceDocumentCardDialog
 * Full-screen card for a document discovered while browsing an external source.
 * Shows all available metadata (including full MARC21 fields after enrichment)
 * and provides import / fetch-metadata actions.
 */
import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Stack, Chip, Divider, Box, IconButton,
  Tooltip, CircularProgress, Alert, Paper, Grid
} from '@mui/material';
import {
  X, FileText, Hash, Calendar, Globe, ExternalLink,
  Download, Tag, Building2, BookOpen, StickyNote, FolderOpen,
  Link2, CheckCircle, DatabaseZap, FileArchive, Vote,
  GitBranch, Layers, BookMarked, Info, BarChart2
} from 'lucide-react';
import { importDocument, startEnrich } from '../../../services/sourceCatalog.service';

/* ── helpers ─────────────────────────────────────────────────── */

const LANG_LABELS = {
  ara: 'Arabic',   chi: 'Chinese', eng: 'English', fre: 'French',
  rus: 'Russian',  spa: 'Spanish', ger: 'German',  por: 'Portuguese',
  AR:  'Arabic',   ZH:  'Chinese', EN:  'English',  FR:  'French',
  RU:  'Russian',  ES:  'Spanish', DE:  'German',
};

function LangChips({ languages }) {
  if (!languages?.length) return null;
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap">
      {languages.map(l => (
        <Chip key={l} label={l} size="small"
          sx={{ fontSize: '0.62rem', height: 18,
               bgcolor: l === 'EN' ? 'primary.main' : 'action.hover',
               color:   l === 'EN' ? 'primary.contrastText' : 'text.primary' }} />
      ))}
    </Stack>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <Box>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
        <Icon size={14} style={{ opacity: 0.55 }} />
        <Typography variant="caption" fontWeight={700} color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' }}>
          {title}
        </Typography>
      </Stack>
      {children}
    </Box>
  );
}

function ChipRow({ values, bgcolor }) {
  if (!values?.length) return null;
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap">
      {values.map((v, i) => (
        <Chip key={i} label={v} size="small"
          sx={{ fontSize: '0.62rem', height: 20,
               bgcolor: bgcolor || 'action.selected',
               color:   bgcolor ? '#fff' : 'text.primary' }} />
      ))}
    </Stack>
  );
}

function FieldRow({ label, children }) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <Typography variant="caption" color="text.disabled"
        sx={{ flexShrink: 0, minWidth: 110, lineHeight: 1.8, fontSize: '0.65rem',
              textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </Typography>
      <Box flex={1}>{children}</Box>
    </Stack>
  );
}

function UrlLine({ href, label }) {
  if (!href) return null;
  return (
    <Stack direction="row" spacing={0.5} alignItems="flex-start">
      {label && (
        <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, lineHeight: 1.8 }}>
          {label}:
        </Typography>
      )}
      <Typography variant="caption" color="primary.light"
        sx={{ fontFamily: 'monospace', fontSize: '0.65rem', wordBreak: 'break-all', lineHeight: 1.8, flex: 1 }}>
        {href}
      </Typography>
      <IconButton size="small" component="a" href={href} target="_blank" rel="noopener"
        sx={{ p: 0.2, flexShrink: 0 }}>
        <ExternalLink size={11} />
      </IconButton>
    </Stack>
  );
}

/* ── main component ───────────────────────────────────────────── */

const NAMESPACES = ['DEFAULT', 'INEED', 'KM', 'HR', 'FINANCE', 'PROCUREMENT', 'LEGAL', 'IT', 'AUDIT'];

export default function SourceDocumentCardDialog({ open, onClose, item, sourceId, sourceName }) {
  const [importNs,   setImportNs]   = useState('DEFAULT');
  const [importing,  setImporting]  = useState(false);
  const [imported,   setImported]   = useState(false);
  const [enriching,  setEnriching]  = useState(false);
  const [enriched,   setEnriched]   = useState(false);
  const [error,      setError]      = useState(null);

  if (!item) return null;

  const files   = item.metadata?.files || item.marcData?.files || [];
  const marc    = item.marcData || null;
  const hasMarc = Boolean(marc);

  const handleImport = async () => {
    setImporting(true); setError(null);
    try {
      await importDocument(sourceId, {
        url:       item.url,
        pdfUrl:    item.pdfUrl,
        title:     item.title,
        namespace: importNs,
        meta: { symbol: item.symbol, date: item.date, languages: item.languages,
                description: item.description, ...(item.metadata || {}) },
      });
      setImported(true);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
    setImporting(false);
  };

  const handleFetchMetadata = async () => {
    setEnriching(true); setError(null);
    try {
      await startEnrich(sourceId, [item]);
      setEnriched(true);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
    setEnriching(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth
      PaperProps={{ sx: { borderRadius: 2, maxHeight: '94vh' } }}>

      {/* ── Header ── */}
      <DialogTitle sx={{ pb: 1.5 }}>
        <Stack spacing={0.75}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Globe size={13} style={{ opacity: 0.5 }} />
              <Typography variant="caption" color="text.secondary">{sourceName}</Typography>
              {hasMarc && (
                <Chip label="MARCXML" size="small" color="info" variant="outlined"
                  sx={{ fontSize: '0.58rem', height: 16 }} />
              )}
            </Stack>
            <IconButton size="small" onClick={onClose}><X size={16} /></IconButton>
          </Stack>

          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {marc?.fullTitle || item.title}
          </Typography>
          {marc?.fullTitle && marc.fullTitle !== item.title && (
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.4 }}>
              {item.title}
            </Typography>
          )}

          <Stack direction="row" spacing={0.75} flexWrap="wrap" alignItems="center">
            {(marc?.symbol || item.symbol) && (
              <Chip icon={<Hash size={12} />} label={marc?.symbol || item.symbol} size="small"
                variant="outlined" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.72rem' }} />
            )}
            {(marc?.dateIssued || item.date) && (
              <Chip icon={<Calendar size={12} />}
                label={(() => {
                  const d = marc?.dateIssued || item.date;
                  try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
                  catch { return d; }
                })()}
                size="small" variant="outlined" sx={{ fontSize: '0.72rem' }} />
            )}
            {item.pdfUrl && (
              <Chip icon={<FileText size={12} />} label="PDF available" size="small"
                color="error" variant="outlined" sx={{ fontSize: '0.72rem' }} />
            )}
            {item.fileType && (
              <Chip icon={<FileArchive size={12} />} label={item.fileType.toUpperCase()} size="small"
                variant="outlined" sx={{ fontSize: '0.72rem' }} />
            )}
            {(marc?.langCodes?.length ? marc.langCodes : item.languages)?.map(l => (
              <Tooltip key={l} title={l}>
                <Chip label={LANG_LABELS[l] || l} size="small"
                  sx={{ fontSize: '0.62rem', height: 18,
                       bgcolor: (l === 'EN' || l === 'eng') ? 'primary.main' : 'action.hover',
                       color:   (l === 'EN' || l === 'eng') ? 'primary.contrastText' : 'text.primary' }} />
              </Tooltip>
            ))}
          </Stack>
        </Stack>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ py: 2 }}>
        <Stack spacing={2.5}>

          {error    && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
          {imported && <Alert severity="success" icon={<CheckCircle size={16} />}>Document imported successfully</Alert>}
          {enriched && <Alert severity="info" icon={<DatabaseZap size={16} />}>Metadata fetch started in background</Alert>}

          {/* ── Abstract / Description ── */}
          {(item.abstract || marc?.fullTitle || item.description) && (
            <Section title="Abstract / Description" icon={BookOpen}>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2" color="text.primary"
                  sx={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {item.abstract || marc?.fullTitle || item.description}
                </Typography>
              </Paper>
            </Section>
          )}

          {/* ── MARC Title / Publication info ── */}
          {hasMarc && (marc.titleMain || marc.titleSub || marc.pubPlace || marc.extent) && (
            <Section title="Publication Details" icon={Info}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                <Stack spacing={0.75}>
                  {marc.titleMain && (
                    <FieldRow label="Title">
                      <Typography variant="body2">{marc.titleMain}</Typography>
                    </FieldRow>
                  )}
                  {marc.titleSub && (
                    <FieldRow label="Subtitle">
                      <Typography variant="body2" color="text.secondary">{marc.titleSub}</Typography>
                    </FieldRow>
                  )}
                  {marc.titleStmt && (
                    <FieldRow label="Responsibility">
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>{marc.titleStmt}</Typography>
                    </FieldRow>
                  )}
                  {(marc.pubPlace || marc.publisher || marc.pubDate) && (
                    <FieldRow label="Published">
                      <Typography variant="body2">
                        {[marc.pubPlace, marc.publisher, marc.pubDate].filter(Boolean).join(' — ')}
                      </Typography>
                    </FieldRow>
                  )}
                  {marc.dateIssued && (
                    <FieldRow label="Date Issued">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{marc.dateIssued}</Typography>
                    </FieldRow>
                  )}
                  {marc.dateAdopted && marc.dateAdopted !== marc.dateIssued && (
                    <FieldRow label="Date Adopted">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{marc.dateAdopted}</Typography>
                    </FieldRow>
                  )}
                  {marc.extent && (
                    <FieldRow label="Extent">
                      <Typography variant="body2" color="text.secondary">{marc.extent}</Typography>
                    </FieldRow>
                  )}
                  {marc.bodyName && (
                    <FieldRow label="Issuing Body">
                      <Typography variant="body2" fontWeight={600}>{marc.bodyName}</Typography>
                    </FieldRow>
                  )}
                  {marc.callNum && (
                    <FieldRow label="Call Number">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{marc.callNum}</Typography>
                    </FieldRow>
                  )}
                </Stack>
              </Paper>
            </Section>
          )}

          {/* ── UNDL Record ── */}
          {hasMarc && (marc.systemControlNumber || marc.documentClass || marc.recordType || marc.lastModified) && (
            <Section title="UNDL Record" icon={DatabaseZap}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                <Stack spacing={0.75}>
                  {marc.systemControlNumber && (
                    <FieldRow label="Control Number">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {marc.systemControlNumber}
                      </Typography>
                    </FieldRow>
                  )}
                  {(marc.seriesSymbol || marc.sessionNumber) && (
                    <FieldRow label="Series / Session">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {[marc.seriesSymbol, marc.sessionNumber && `Session ${marc.sessionNumber}`].filter(Boolean).join(' — ')}
                      </Typography>
                    </FieldRow>
                  )}
                  {marc.documentClass && (
                    <FieldRow label="Document Class">
                      <Chip label={marc.documentClass} size="small" variant="outlined"
                        sx={{ fontSize: '0.68rem', height: 20, width: 'fit-content' }} />
                    </FieldRow>
                  )}
                  {marc.recordType && (
                    <FieldRow label="Record Type">
                      <Typography variant="body2" color="text.secondary">{marc.recordType}</Typography>
                    </FieldRow>
                  )}
                  {marc.normalizedSymbols?.length > 0 && (
                    <FieldRow label="Norm. Symbols">
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        {marc.normalizedSymbols.map((s, i) => (
                          <Chip key={i} label={s} size="small"
                            sx={{ fontFamily: 'monospace', fontSize: '0.62rem', height: 18 }} />
                        ))}
                      </Stack>
                    </FieldRow>
                  )}
                  {marc.lastModified && (
                    <FieldRow label="Record Updated">
                      <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.75rem' }}>
                        {marc.lastModified}
                      </Typography>
                    </FieldRow>
                  )}
                </Stack>
              </Paper>
            </Section>
          )}

          {/* ── Classification ── */}
          {(item.subjects?.length > 0 || marc?.subjects?.length > 0
            || item.bodies?.length > 0  || marc?.bodies?.length > 0
            || item.reportNumbers?.length > 0
            || marc?.corpSubjects?.length > 0) && (
            <Section title="Classification" icon={Tag}>
              <Stack spacing={1}>
                {(marc?.subjects?.length > 0 || item.subjects?.length > 0) && (
                  <Stack spacing={0.4}>
                    <Typography variant="caption" color="text.disabled">Subjects</Typography>
                    <ChipRow values={marc?.subjects?.length ? marc.subjects : item.subjects} bgcolor="#1d4ed8" />
                  </Stack>
                )}
                {marc?.corpSubjects?.length > 0 && (
                  <Stack spacing={0.4}>
                    <Typography variant="caption" color="text.disabled">Corporate Subjects</Typography>
                    <ChipRow values={marc.corpSubjects} bgcolor="#0f766e" />
                  </Stack>
                )}
                {(marc?.bodies?.length > 0 || item.bodies?.length > 0) && (
                  <Stack spacing={0.4}>
                    <Typography variant="caption" color="text.disabled">Bodies / Committees</Typography>
                    <ChipRow values={marc?.bodies?.length ? marc.bodies : item.bodies} bgcolor="#7c3aed" />
                  </Stack>
                )}
                {item.reportNumbers?.length > 0 && (
                  <Stack spacing={0.4}>
                    <Typography variant="caption" color="text.disabled">Report / Document Numbers</Typography>
                    <ChipRow values={item.reportNumbers} />
                  </Stack>
                )}
              </Stack>
            </Section>
          )}

          {/* ── Voting Record ── */}
          {marc?.votingRecord && (
            <Section title="Voting Record" icon={Vote}>
              <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2" color="text.primary">{marc.votingRecord}</Typography>
              </Paper>
            </Section>
          )}

          {/* ── Agenda Items ── */}
          {marc?.agendaItems?.length > 0 && (
            <Section title="Agenda Items" icon={BarChart2}>
              <Stack spacing={0.75}>
                {marc.agendaItems.map((a, i) => (
                  <Paper key={i} variant="outlined" sx={{ px: 1.25, py: 0.75, borderRadius: 1 }}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start" flexWrap="wrap">
                      {a.symbol && (
                        <Chip label={a.symbol} size="small" variant="outlined"
                          sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.68rem', flexShrink: 0 }} />
                      )}
                      {a.item && (
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                          item {a.item}
                        </Typography>
                      )}
                      {a.situation && (
                        <Typography variant="caption" color="text.primary" sx={{ lineHeight: 1.8 }}>
                          {a.situation}
                        </Typography>
                      )}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Section>
          )}

          {/* ── Related Documents ── */}
          {marc?.relatedDocs?.length > 0 && (
            <Section title="Related Documents" icon={GitBranch}>
              <Stack spacing={0.5}>
                {marc.draftDoc && (
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography variant="caption" color="text.disabled" sx={{ minWidth: 90 }}>Draft:</Typography>
                    <Chip label={marc.draftDoc} size="small" variant="outlined"
                      sx={{ fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 600 }} />
                  </Stack>
                )}
                {marc.verbatimRecord && (
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography variant="caption" color="text.disabled" sx={{ minWidth: 90 }}>Verbatim:</Typography>
                    <Chip label={marc.verbatimRecord} size="small" variant="outlined"
                      sx={{ fontFamily: 'monospace', fontSize: '0.68rem' }} />
                  </Stack>
                )}
                {marc.relatedDocs
                  .filter(r => r.type === 'related')
                  .map((r, i) => (
                    <Stack key={i} direction="row" spacing={0.75} alignItems="center">
                      <Typography variant="caption" color="text.disabled" sx={{ minWidth: 90 }}>Related:</Typography>
                      <Chip label={r.symbol} size="small" variant="outlined"
                        sx={{ fontFamily: 'monospace', fontSize: '0.68rem' }} />
                    </Stack>
                  ))}
              </Stack>
            </Section>
          )}

          {/* ── Collection Hierarchy ── */}
          {(marc?.hierarchy?.length > 0 || item.collections?.length > 0) && (
            <Section title="Collections / Hierarchy" icon={Layers}>
              <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                {(marc?.hierarchy?.length ? marc.hierarchy : item.collections).map((c, i, arr) => (
                  <React.Fragment key={i}>
                    <Chip label={c} size="small" sx={{ fontSize: '0.62rem', height: 20 }} />
                    {i < arr.length - 1 && (
                      <Typography variant="caption" color="text.disabled">›</Typography>
                    )}
                  </React.Fragment>
                ))}
              </Stack>
            </Section>
          )}

          {/* ── Notes ── */}
          {item.notes?.length > 0 && (
            <Section title="Notes" icon={StickyNote}>
              <Stack spacing={0.3}>
                {item.notes.map((n, i) => (
                  <Typography key={i} variant="caption" color="text.secondary">{n}</Typography>
                ))}
              </Stack>
            </Section>
          )}

          {/* ── Source URLs ── */}
          <Section title="Source Links" icon={Link2}>
            <Stack spacing={0.5}>
              <UrlLine href={item.url}    label="Record page" />
              <UrlLine href={item.pdfUrl} label="English PDF" />
            </Stack>
          </Section>

          {/* ── File Versions ── */}
          {files.length > 0 && (
            <Section title={`File Versions (${files.length})`} icon={FolderOpen}>
              <Grid container spacing={0.75}>
                {files.map((f, i) => {
                  const name     = f.full_name || f.name || '';
                  const isEn     = name.toUpperCase().includes('-EN.');
                  const recid    = item.metadata?.recid || marc?.recid;
                  const fileHref = f.url || (recid
                    ? `https://digitallibrary.un.org/record/${recid}/files/${encodeURIComponent(name)}`
                    : null);
                  const langLabel = f.lang || (name.match(/-([A-Z]{1,3})\.[a-z]+$/i)?.[1]?.toUpperCase() || null);
                  const sizeKb   = f.size ? `${(f.size / 1024).toFixed(0)} KB` : null;
                  return (
                    <Grid item key={i} xs={12} sm={6}>
                      <Paper variant="outlined" sx={{ px: 1.25, py: 0.6, borderRadius: 1,
                        bgcolor: isEn ? 'error.dark' : 'action.hover',
                        display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <FileText size={13} style={{ opacity: 0.7, flexShrink: 0,
                          color: isEn ? '#fff' : 'inherit' }} />
                        <Typography variant="caption" noWrap flex={1}
                          sx={{ fontFamily: 'monospace', fontSize: '0.62rem',
                               color: isEn ? '#fff' : 'text.secondary',
                               fontWeight: isEn ? 700 : 400 }}
                          title={name}>
                          {name}
                        </Typography>
                        {langLabel && (
                          <Chip label={langLabel} size="small"
                            sx={{ fontSize: '0.55rem', height: 16,
                                 bgcolor: isEn ? 'rgba(255,255,255,0.2)' : 'action.selected',
                                 color:   isEn ? '#fff' : 'text.primary' }} />
                        )}
                        {sizeKb && (
                          <Typography variant="caption" sx={{ fontSize: '0.55rem', opacity: 0.7,
                            color: isEn ? '#fff' : 'text.disabled', flexShrink: 0 }}>
                            {sizeKb}
                          </Typography>
                        )}
                        {fileHref && (
                          <IconButton size="small" component="a" href={fileHref} target="_blank"
                            rel="noopener" sx={{ p: 0.2, color: isEn ? '#fff' : 'inherit' }}>
                            <ExternalLink size={11} />
                          </IconButton>
                        )}
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </Section>
          )}

          {/* ── Enrich status ── */}
          {item.enrichStatus && item.enrichStatus !== 'none' && (
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Chip label={`metadata: ${item.enrichStatus}`} size="small"
                color={item.enrichStatus === 'full' ? 'success' : 'warning'}
                variant="outlined" sx={{ fontSize: '0.62rem' }} />
              {item.enrichedAt && (
                <Typography variant="caption" color="text.disabled">
                  enriched {new Date(item.enrichedAt).toLocaleString()}
                </Typography>
              )}
            </Stack>
          )}

        </Stack>
      </DialogContent>

      <Divider />

      {/* ── Actions ── */}
      <DialogActions sx={{ px: 2.5, py: 1.5, gap: 1, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Tooltip title="Fetch full MARC metadata from source in background">
          <span>
            <Button variant="outlined" size="small"
              disabled={enriching || enriched}
              startIcon={enriching ? <CircularProgress size={13} /> : enriched ? <CheckCircle size={13} /> : <DatabaseZap size={13} />}
              onClick={handleFetchMetadata}>
              {enriched ? 'Metadata fetched' : enriching ? 'Starting…' : 'Fetch Metadata'}
            </Button>
          </span>
        </Tooltip>

        <Stack direction="row" spacing={1} alignItems="center">
          {!imported && (
            <>
              <Box sx={{ minWidth: 120 }}>
                <select
                  value={importNs}
                  onChange={e => setImportNs(e.target.value)}
                  style={{ fontSize: '0.75rem', padding: '4px 6px', borderRadius: 4,
                           border: '1px solid rgba(255,255,255,0.2)',
                           background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
                  {NAMESPACES.map(ns => <option key={ns} value={ns}>{ns}</option>)}
                </select>
              </Box>
              <Button variant="contained" size="small" disabled={importing}
                startIcon={importing ? <CircularProgress size={13} /> : <Download size={13} />}
                onClick={handleImport}>
                {importing ? 'Importing…' : item.pdfUrl ? 'Import PDF' : 'Import'}
              </Button>
            </>
          )}
          {imported && (
            <Chip icon={<CheckCircle size={13} />} label="Imported" color="success" size="small" />
          )}
          <Button size="small" onClick={onClose}>Close</Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
