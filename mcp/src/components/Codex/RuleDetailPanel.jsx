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
  const id = prop(node, 'ruleId') || prop(node, 'sectionId') || prop(node, 'partId') || prop(node, 'principleId');
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

        {description && (
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
        <MetaRow label="Hash" value={hash} mono />

        <Divider sx={{ my: 2 }} />
        <RawJsonPanel node={node} />
      </Box>
    </Box>
  );
}
