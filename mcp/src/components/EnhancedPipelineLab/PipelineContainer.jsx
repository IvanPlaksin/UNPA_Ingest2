import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '@mui/material';
import {
  ChevronDown,
  Check,
  Edit,
  RotateCcw,
  Clock,
  CheckCircle,
  Loader
} from 'lucide-react';

const STAGES = [
  { id: 1, name: 'Sanitization', icon: '🧹', desc: 'Clean HTML, normalize text' },
  { id: 2, name: 'Language Detection', icon: '🌐', desc: 'Detect natural & code languages' },
  { id: 3, name: 'Chunking', icon: '✂️', desc: 'Split into semantic chunks' },
  { id: 4, name: 'Entity Extraction', icon: '🔍', desc: 'Extract named entities' },
  { id: 5, name: 'Query Expansion', icon: '🔗', desc: 'Expand with UN synonyms' },
  { id: 6, name: 'Embedding', icon: '📊', desc: 'Generate vector embeddings' },
  { id: 7, name: 'Classification', icon: '📁', desc: 'Assign ontology layers' },
  { id: 8, name: 'Relationships', icon: '🔀', desc: 'Infer entity relationships' },
  { id: 9, name: 'Graph Build', icon: '🕸️', desc: 'Construct knowledge graph' },
];

const StatusBadge = ({ status }) => {
  const config = {
    pending: { color: '#6b7280', bg: '#1f2937', icon: Clock, label: 'Pending' },
    processing: { color: '#3b82f6', bg: '#1e3a5f', icon: Loader, label: 'Processing' },
    complete: { color: '#10b981', bg: '#064e3b', icon: CheckCircle, label: 'Complete' },
    error: { color: '#ef4444', bg: '#450a0a', icon: null, label: 'Error' }
  };

  const { color, bg, icon: Icon, label } = config[status] || config.pending;

  return (
    <Chip
      size="small"
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {Icon && <Icon size={12} className={status === 'processing' ? 'animate-spin' : ''} />}
          {label}
        </Box>
      }
      sx={{ bgcolor: bg, color, fontSize: '0.7rem', height: 22 }}
    />
  );
};

const ConfidenceBar = ({ value, color = '#00D4FF' }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Box sx={{ width: 80, height: 6, bgcolor: '#1e1e2e', borderRadius: 3, overflow: 'hidden' }}>
      <Box
        sx={{
          height: '100%',
          width: `${value * 100}%`,
          bgcolor: color,
          borderRadius: 3,
          transition: 'width 0.5s'
        }}
      />
    </Box>
    <Typography variant="caption" color="text.secondary">
      {(value * 100).toFixed(0)}%
    </Typography>
  </Box>
);

function getEntityColor(type) {
  const colors = {
    System: '#0891b2',
    Person: '#f59e0b',
    Process: '#10b981',
    Concept: '#ec4899',
    Code: '#7c3aed',
    Document: '#6b7280',
    Organization: '#f59e0b',
    Technology: '#0891b2'
  };
  return colors[type] || '#6b7280';
}

const StageOutputs = {
  1: ({ data }) => (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {Object.entries(data.stats || {}).map(([key, value]) => (
          <Chip key={key} size="small" label={`${key}: ${value}`} sx={{ bgcolor: '#1e1e2e' }} />
        ))}
      </Box>
      <Paper sx={{ p: 2, bgcolor: '#0a0a14', maxHeight: 200, overflow: 'auto' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Sanitized Output:
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
          {data.sanitized}
        </Typography>
      </Paper>
    </Box>
  ),

  2: ({ data }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2">Natural Language</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip size="small" label={data.language || 'EN'} sx={{ bgcolor: '#0891b2' }} />
          <ConfidenceBar value={data.confidence || 0.95} />
        </Box>
      </Box>
      {data.codeLanguage && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2">Code Language</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip size="small" label={data.codeLanguage} sx={{ bgcolor: '#7c3aed' }} />
            <ConfidenceBar value={data.codeConfidence || 0.8} color="#7c3aed" />
          </Box>
        </Box>
      )}
    </Box>
  ),

  3: ({ data }) => (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {data.chunks?.length || 0} chunks created
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 250, overflow: 'auto' }}>
        {(data.chunks || []).slice(0, 5).map((chunk, i) => (
          <Paper key={i} sx={{ p: 1.5, bgcolor: '#0a0a14' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">Chunk {chunk.id || i + 1}</Typography>
              <Typography variant="caption" sx={{ color: '#0891b2' }}>
                {chunk.tokens || chunk.tokenCount || '~'} tokens
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }} noWrap>
              {chunk.preview || chunk.content?.substring(0, 100) + '...'}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  ),

  4: ({ data }) => (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {data.entities?.length || 0} entities extracted
      </Typography>
      <Box sx={{ maxHeight: 250, overflow: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: 'text.secondary', py: 0.5 }}>Type</TableCell>
              <TableCell sx={{ color: 'text.secondary', py: 0.5 }}>Name</TableCell>
              <TableCell sx={{ color: 'text.secondary', py: 0.5 }}>Confidence</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data.entities || []).map((entity, i) => (
              <TableRow key={i}>
                <TableCell sx={{ py: 0.5 }}>
                  <Chip
                    size="small"
                    label={entity.type}
                    sx={{ bgcolor: getEntityColor(entity.type), fontSize: '0.7rem', height: 20 }}
                  />
                </TableCell>
                <TableCell sx={{ py: 0.5, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {entity.name}
                </TableCell>
                <TableCell sx={{ py: 0.5 }}>
                  <ConfidenceBar value={entity.confidence} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  ),

  5: ({ data }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 250, overflow: 'auto' }}>
      {(data.expansions || []).map((exp, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip size="small" label={exp.term} sx={{ bgcolor: '#0891b2', fontFamily: 'monospace' }} />
          <Typography color="text.secondary">→</Typography>
          {(exp.synonyms || []).map((syn, j) => (
            <Chip key={j} size="small" label={syn} sx={{ bgcolor: '#1e1e2e', fontSize: '0.7rem' }} />
          ))}
        </Box>
      ))}
    </Box>
  ),

  6: ({ data }) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
      {[
        { label: 'Vectors', value: data.vectors || data.totalVectors },
        { label: 'Dimensions', value: data.dimension },
        { label: 'Avg Time', value: data.avgTime || `${data.avgGenerationTime}ms` },
        { label: 'Clusters', value: data.clusters || data.clustersDetected }
      ].map(item => (
        <Paper key={item.label} sx={{ p: 2, bgcolor: '#0a0a14', textAlign: 'center' }}>
          <Typography variant="h5" sx={{ color: '#0891b2' }}>{item.value}</Typography>
          <Typography variant="caption" color="text.secondary">{item.label}</Typography>
        </Paper>
      ))}
    </Box>
  ),

  7: ({ data }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {Object.entries(data.distribution || {}).map(([layer, count]) => {
        const colors = { Strategic: '#FF6B9D', Business: '#00D4FF', Code: '#7B61FF' };
        const total = Object.values(data.distribution).reduce((a, b) => a + b, 0);
        return (
          <Box key={layer} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" sx={{ width: 80, color: colors[layer] }}>{layer}</Typography>
            <Box sx={{ flex: 1, height: 20, bgcolor: '#1e1e2e', borderRadius: 1, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${(count / total) * 100}%`, bgcolor: colors[layer], transition: 'width 0.5s' }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ width: 30 }}>{count}</Typography>
          </Box>
        );
      })}
    </Box>
  ),

  8: ({ data }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 250, overflow: 'auto' }}>
      {(data.relationships || []).map((rel, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: '#0a0a14', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: '#0891b2' }}>{rel.from || rel.sourceName}</Typography>
          <Chip size="small" label={rel.type} sx={{ bgcolor: '#1e1e2e', fontSize: '0.65rem', height: 18 }} />
          <Typography variant="body2" sx={{ color: '#0891b2' }}>{rel.to || rel.targetName}</Typography>
        </Box>
      ))}
    </Box>
  ),

  9: ({ data }) => (
    <Box sx={{ p: 3, bgcolor: '#064e3b', borderRadius: 2, textAlign: 'center' }}>
      <Typography variant="h6" sx={{ color: '#10b981', mb: 1 }}>✓ Graph Ready</Typography>
      <Typography variant="body2" color="text.secondary">
        {data.nodes?.length || 0} nodes • {data.links?.length || 0} relationships
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        View in 3D panel →
      </Typography>
    </Box>
  )
};

// Стили для аккордеона
const accordionStyles = {
  bgcolor: 'transparent',
  boxShadow: 'none',
  '&:before': { display: 'none' },
  '&.Mui-expanded': { margin: 0 },
};

const getAccordionSummaryStyles = (status) => {
  const borderColor = status === 'complete' ? '#065f46' : status === 'processing' ? '#1e3a5f' : '#2a2a3e';
  const bgColor = status === 'complete' ? 'rgba(6, 95, 70, 0.15)' : status === 'processing' ? 'rgba(30, 58, 95, 0.2)' : '#12121c';

  return {
    bgcolor: bgColor,
    border: `1px solid ${borderColor}`,
    borderRadius: 1,
    minHeight: '48px !important',
    '&.Mui-expanded': {
      minHeight: '48px !important',
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
    '& .MuiAccordionSummary-content': {
      margin: '8px 0 !important',
      '&.Mui-expanded': { margin: '8px 0 !important' }
    },
    '&:hover': {
      bgcolor: status === 'complete' ? 'rgba(6, 95, 70, 0.25)' : status === 'processing' ? 'rgba(30, 58, 95, 0.3)' : 'rgba(255,255,255,0.03)'
    }
  };
};

const getAccordionDetailsStyles = (status) => {
  const borderColor = status === 'complete' ? '#065f46' : status === 'processing' ? '#1e3a5f' : '#2a2a3e';

  return {
    bgcolor: '#0d0d15',
    border: `1px solid ${borderColor}`,
    borderTop: 'none',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    p: 2,
  };
};

export default function PipelineContainer({ stageOutputs, currentStage, onValidate }) {
  const [expanded, setExpanded] = useState(false);

  // Автоматически разворачивать последний завершённый этап
  useEffect(() => {
    const completedStages = Object.entries(stageOutputs)
      .filter(([_, data]) => data.status === 'complete')
      .map(([id]) => parseInt(id));

    if (completedStages.length > 0) {
      const lastCompleted = Math.max(...completedStages);
      setExpanded(`panel${lastCompleted}`);
    }
  }, [stageOutputs]);

  const handleChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };

  return (
    <Box sx={{
      flex: 1,
      overflow: 'auto',
      p: 2,
      minHeight: 0,
      '&::-webkit-scrollbar': {
        width: 8,
      },
      '&::-webkit-scrollbar-track': {
        bgcolor: '#1e1e2e',
        borderRadius: 4,
      },
      '&::-webkit-scrollbar-thumb': {
        bgcolor: '#3b3b4f',
        borderRadius: 4,
        '&:hover': {
          bgcolor: '#4b4b5f',
        }
      }
    }}>
      {STAGES.map(stage => {
        const stageData = stageOutputs[stage.id] || {};
        const status = stageData.status || 'pending';
        const output = stageData.output;
        const OutputComponent = StageOutputs[stage.id];
        const panelId = `panel${stage.id}`;

        return (
          <Accordion
            key={stage.id}
            expanded={expanded === panelId}
            onChange={handleChange(panelId)}
            disabled={status === 'pending'}
            sx={{
              ...accordionStyles,
              mb: 1,
              opacity: status === 'pending' ? 0.6 : 1,
            }}
          >
            <AccordionSummary
              expandIcon={<ChevronDown size={18} color={status === 'pending' ? '#4a4a5a' : '#fff'} />}
              sx={getAccordionSummaryStyles(status)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography sx={{ fontSize: '1.2rem' }}>{stage.icon}</Typography>
                  <Box>
                    <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
                      Stage {stage.id}: {stage.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                      {stage.desc}
                    </Typography>
                  </Box>
                </Box>
                <StatusBadge status={status} />
              </Box>
            </AccordionSummary>

            <AccordionDetails sx={getAccordionDetailsStyles(status)}>
              {OutputComponent && output && <OutputComponent data={output} />}

              {status === 'complete' && (
                <Box sx={{ display: 'flex', gap: 1, mt: 2, pt: 2, borderTop: '1px solid #2a2a3e' }}>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<Check size={14} />}
                    onClick={(e) => { e.stopPropagation(); onValidate(stage.id, 'accept'); }}
                    sx={{ bgcolor: '#065f46', '&:hover': { bgcolor: '#047857' } }}
                  >
                    Accept
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Edit size={14} />}
                    onClick={(e) => { e.stopPropagation(); onValidate(stage.id, 'edit'); }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RotateCcw size={14} />}
                    onClick={(e) => { e.stopPropagation(); onValidate(stage.id, 'rerun'); }}
                  >
                    Re-run
                  </Button>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
