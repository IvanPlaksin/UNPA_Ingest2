/**
 * RuleDetailPanel - detail view for a selected Codex node (Part/Section/Rule)
 */
import React, { useState } from 'react';
import { Box, Typography, Chip, Divider, Card, CardContent, IconButton, Collapse } from '@mui/material';
import { Book, FileText, CheckSquare, Lightbulb, X, Copy, Code, ChevronDown, ChevronRight } from 'lucide-react';

const MODALITY_INFO = {
  MUST:        { color: 'error',   label: 'MUST',     desc: 'Mandatory — must be followed.' },
  SHOULD:      { color: 'warning', label: 'SHOULD',   desc: 'Recommended but not required.' },
  MAY:         { color: 'info',    label: 'MAY',      desc: 'Optional.' },
  MUST_NOT:    { color: 'error',   label: 'MUST NOT',  desc: 'Prohibited.' },
  SHOULD_NOT:  { color: 'warning', label: 'SHOULD NOT', desc: 'Not recommended.' },
  DESCRIPTIVE: { color: 'default', label: 'INFO',     desc: 'Informational content.' },
  mandatory:   { color: 'error',   label: 'MUST',     desc: 'Mandatory — must be followed.' },
  recommended: { color: 'warning', label: 'SHOULD',   desc: 'Recommended but not required.' },
  optional:    { color: 'info',    label: 'MAY',      desc: 'Optional.' },
  prohibited:  { color: 'error',   label: 'MUST NOT',  desc: 'Prohibited.' },
  descriptive: { color: 'default', label: 'INFO',     desc: 'Informational content.' },
  mapping:     { color: 'success', label: 'MAP',      desc: 'Mapping/routing rule.' },
};

function prop(node, key) {
  return node?.properties?.[key] ?? node?.[key] ?? '';
}

function MetaRow({ label, value, mono }) {
  if (!value) return null;
  return (
    <Box sx={{ display: 'flex', mb: 0.75 }}>
      <Typography variant="caption" sx={{ color: 'text.disabled', width: 90, flexShrink: 0 }}>{label}</Typography>
      <Typography variant="caption" sx={{ fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
        {value}
      </Typography>
    </Box>
  );
}

function JsonHighlight({ data }) {
  const json = JSON.stringify(data, null, 2);
  const lines = json.split('\n');

  return (
    <Box
      component="pre"
      sx={{
        m: 0, p: 1.5, fontSize: '11.5px', fontFamily: 'monospace',
        lineHeight: 1.6, overflow: 'auto', maxHeight: 500,
        bgcolor: '#0d1117', borderRadius: 1, color: '#c9d1d9',
        '& .json-key': { color: '#7ee787' },
        '& .json-string': { color: '#a5d6ff' },
        '& .json-number': { color: '#79c0ff' },
        '& .json-bool': { color: '#ff7b72' },
        '& .json-null': { color: '#8b949e', fontStyle: 'italic' },
        '& .json-brace': { color: '#8b949e' },
      }}
    >
      {lines.map((line, i) => {
        const parts = [];
        let rest = line;
        let key = 0;

        // Match: "key": value
        const keyMatch = rest.match(/^(\s*)"([^"]+)"(\s*:\s*)/);
        if (keyMatch) {
          parts.push(keyMatch[1]); // indent
          parts.push(<span key={key++} className="json-key">"{keyMatch[2]}"</span>);
          parts.push(keyMatch[3]); // colon
          rest = rest.slice(keyMatch[0].length);
        }

        // Tokenize remaining value
        const tokenRegex = /("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\],])/g;
        let lastIndex = 0;
        let match;
        while ((match = tokenRegex.exec(rest)) !== null) {
          if (match.index > lastIndex) parts.push(rest.slice(lastIndex, match.index));
          if (match[1]) parts.push(<span key={key++} className="json-string">{match[1]}</span>);
          else if (match[2]) parts.push(<span key={key++} className="json-number">{match[2]}</span>);
          else if (match[3]) parts.push(<span key={key++} className="json-bool">{match[3]}</span>);
          else if (match[4]) parts.push(<span key={key++} className="json-null">{match[4]}</span>);
          else if (match[5]) parts.push(<span key={key++} className="json-brace">{match[5]}</span>);
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < rest.length) parts.push(rest.slice(lastIndex));

        return <div key={i}>{parts}</div>;
      })}
    </Box>
  );
}

function RawJsonPanel({ node }) {
  const [open, setOpen] = useState(false);

  return (
    <Box sx={{ mt: 1 }}>
      <Box
        onClick={() => setOpen(!open)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer',
          py: 0.75, px: 0.5, borderRadius: 1, userSelect: 'none',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Code size={14} style={{ opacity: 0.6 }} />
        <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 500 }}>
          Raw JSON
        </Typography>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ mt: 0.5 }}>
          <JsonHighlight data={node} />
        </Box>
      </Collapse>
    </Box>
  );
}

export default function RuleDetailPanel({ node, type, onClose }) {
  if (!node) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled' }}>
        <Typography variant="body2">Select an item to view details</Typography>
      </Box>
    );
  }

  const title = prop(node, 'title');
  const id = prop(node, 'ruleId') || prop(node, 'definitionId') || prop(node, 'sectionId') || prop(node, 'partId') || prop(node, 'principleId') || prop(node, 'codexId');
  const description = prop(node, 'description');
  const content = prop(node, 'content');
  const modality = prop(node, 'modality');
  const scope = prop(node, 'scope');
  const code = prop(node, 'code');
  const partId = prop(node, 'partId');
  const sectionId = prop(node, 'sectionId');
  const order = prop(node, 'order');
  const hash = prop(node, 'hash');
  const namespace = prop(node, 'namespace');
  const mi = modality ? MODALITY_INFO[modality] : null;

  // Governance narrative fields (CodexRule from proposals)
  const summary = prop(node, 'summary');
  const rationale = prop(node, 'rationale');
  const whyItExists = prop(node, 'whyItExists');
  const examples = prop(node, 'examples');
  const derivesFromPrinciple = prop(node, 'derivesFromPrinciple');

  // CodexDefinition specific fields (structured table data)
  const subsectionHeading = prop(node, 'subsectionHeading');
  const tableType = prop(node, 'tableType');
  const rowCount = prop(node, 'rowCount');
  let tableColumns = [];
  let tableRows = [];
  try {
    const cn = prop(node, 'columnNames');
    if (cn) tableColumns = typeof cn === 'string' ? JSON.parse(cn) : cn;
  } catch {}
  try {
    const att = prop(node, 'attributes');
    if (att) tableRows = typeof att === 'string' ? JSON.parse(att) : att;
  } catch {}
  let exampleList = [];
  try {
    if (examples) exampleList = typeof examples === 'string' ? JSON.parse(examples) : examples;
  } catch { exampleList = [examples]; }

  const icons = {
    part: <Book size={20} />, section: <FileText size={20} />, rule: <CheckSquare size={20} />,
    CodexPart: <Book size={20} />, CodexSection: <FileText size={20} />, CodexRule: <CheckSquare size={20} />,
    CodexPrinciple: <Lightbulb size={20} />,
  };

  const handleCopy = () => { navigator.clipboard?.writeText(id); };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ color: '#4fd1c5', mt: 0.5 }}>{icons[type] || <FileText size={20} />}</Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5, lineHeight: 1.3 }}>{title || id}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Chip label={id} size="small" variant="outlined" onClick={handleCopy}
              icon={<Copy size={11} />}
              sx={{ height: 20, fontSize: '10px', fontFamily: 'monospace' }} />
            {mi && <Chip label={mi.label} size="small" color={mi.color} sx={{ height: 20, fontSize: '10px', fontWeight: 'bold' }} />}
            {scope && <Chip label={scope} size="small" variant="outlined" sx={{ height: 20, fontSize: '10px' }} />}
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose}><X size={18} /></IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {mi && (
          <Card sx={{ mb: 2, bgcolor: 'action.hover' }}>
            <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{mi.desc}</Typography>
            </CardContent>
          </Card>
        )}

        {/* Subsection context for CodexDefinition */}
        {subsectionHeading && subsectionHeading !== title && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 0.5, display: 'block' }}>From subsection</Typography>
            <Typography variant="body2" sx={{ fontSize: '12.5px', fontStyle: 'italic' }}>{subsectionHeading}</Typography>
          </Box>
        )}

        {/* Summary (governance rules) */}
        {summary && (
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 0.5, display: 'block' }}>Summary</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '12.5px' }}>{summary}</Typography>
          </Box>
        )}

        {/* Rationale (governance rules) */}
        {rationale && (
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 0.5, display: 'block' }}>Rationale (Why this rule exists)</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '12.5px' }}>{rationale}</Typography>
          </Box>
        )}

        {/* Why it exists (governance rules) */}
        {whyItExists && whyItExists !== rationale && (
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 0.5, display: 'block' }}>Origin event</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '12.5px' }}>{whyItExists}</Typography>
          </Box>
        )}

        {/* Examples (governance rules) */}
        {exampleList.length > 0 && (
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 0.5, display: 'block' }}>Examples</Typography>
            {exampleList.map((ex, i) => (
              <Box key={i} sx={{
                mb: 0.75, p: 1, bgcolor: 'action.hover', borderRadius: 1,
                fontFamily: 'monospace', fontSize: '11.5px', whiteSpace: 'pre-wrap'
              }}>{ex}</Box>
            ))}
          </Box>
        )}

        {/* Structured table data (CodexDefinition) */}
        {tableRows.length > 0 && (
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 0.5, display: 'block' }}>
              {tableType === 'attribute-value' ? 'Attributes' : `Table (${rowCount} rows)`}
            </Typography>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <Box component="thead">
                  <Box component="tr" sx={{ bgcolor: 'action.selected' }}>
                    {tableColumns.map((col, i) => (
                      <Box component="th" key={i} sx={{
                        textAlign: 'left', p: 1, fontWeight: 600,
                        borderBottom: 1, borderColor: 'divider'
                      }}>{col}</Box>
                    ))}
                  </Box>
                </Box>
                <Box component="tbody">
                  {tableRows.map((row, i) => (
                    <Box component="tr" key={i} sx={{
                      '&:nth-of-type(even)': { bgcolor: 'action.hover' }
                    }}>
                      {tableColumns.map((col, j) => (
                        <Box component="td" key={j} sx={{
                          p: 1, verticalAlign: 'top',
                          borderBottom: i < tableRows.length - 1 ? 1 : 0, borderColor: 'divider',
                          fontFamily: String(row[col] || '').startsWith('`') ? 'monospace' : 'inherit'
                        }}>{row[col] || ''}</Box>
                      ))}
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>
        )}

        {description && !tableRows.length && (
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 0.5, display: 'block' }}>Description</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '12.5px' }}>{description}</Typography>
          </Box>
        )}

        {content && (
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 0.5, display: 'block' }}>Content</Typography>
            <Typography variant="body2" sx={{
              whiteSpace: 'pre-wrap', fontSize: '11.5px',
              bgcolor: 'action.hover', p: 1.5, borderRadius: 1,
              maxHeight: 300, overflow: 'auto', fontFamily: 'monospace'
            }}>
              {content}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="caption" sx={{ color: 'text.disabled', mb: 1, display: 'block' }}>Metadata</Typography>
        <MetaRow label="ID" value={id} mono />
        <MetaRow label="Part" value={partId} mono />
        <MetaRow label="Section" value={sectionId} mono />
        <MetaRow label="Code" value={code} mono />
        <MetaRow label="Order" value={order?.toString()} />
        <MetaRow label="Namespace" value={namespace} />
        <MetaRow label="Table type" value={tableType} />
        <MetaRow label="Derived from" value={derivesFromPrinciple} mono />
        <MetaRow label="Hash" value={hash} mono />

        <Divider sx={{ my: 2 }} />
        <RawJsonPanel node={node} />
      </Box>
    </Box>
  );
}
