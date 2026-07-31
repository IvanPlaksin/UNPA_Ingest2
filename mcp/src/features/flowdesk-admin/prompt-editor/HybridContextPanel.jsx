/**
 * PE-004 — how much of the dialogue these rules actually govern.
 *
 * The prompt is not the whole assistant. Under the hybrid interpreter a click in the
 * middle of a form is answered by a TEMPLATE: the question comes from the field's own
 * prompt hint and the acknowledgement from a fixed string, with no model call and so
 * no prompt involved. An operator who does not know that will rewrite a rule, see no
 * change in those turns, and conclude the editor is broken.
 *
 * The share is MEASURED from telemetry, never written into the UI as a constant. My
 * own arena run gave 39% model / 61% template, but that was one scenario, one form
 * length, in English — the real share moves with all three. A benchmark presented as
 * production is exactly the sort of confident wrong number this whole section exists
 * to stop producing.
 */
import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Alert, LinearProgress, Tooltip, Accordion,
  AccordionSummary, AccordionDetails, Table, TableBody, TableRow, TableCell, TextField, MenuItem,
} from '@mui/material';
import { ChevronDown } from 'lucide-react';
import { promptAuthorship } from '../api/adminClient';
import { useTourAnchor } from '@guided-ux/tour/react';

const REASON_TEXT = {
  free_text: 'the user typed instead of clicking',
  control_rejected: 'the answer was refused and needed explaining',
  cascade_reset: 'answering reset dependent fields',
  repair_active: 'the repair ladder was up',
  not_fill_phase: 'the form was not being filled yet',
  no_prompt_hint: 'the field carries no question of its own',
  first_field: 'the first field of a form is introduced',
  non_english: 'the session is not in English',
  large_form_offer: 'a long form was being offered',
  unknown: 'not recorded',
};

const pct = (x) => `${Math.round(x * 100)}%`;

export default function HybridContextPanel() {
  const rootRef = useTourAnchor('editor.scope', { label: 'Scope of the prompt', route: '/flowdesk-admin/prompt' });
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null); setErr(null);
    promptAuthorship(days)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setErr(e); });
    return () => { live = false; };
  }, [days]);

  return (
    <Box sx={{ p: 1.5 }} ref={rootRef}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>What these rules govern</Typography>
        <TextField select size="small" value={days} onChange={(e) => setDays(Number(e.target.value))} sx={{ width: 110 }}>
          {[1, 7, 30, 90].map((d) => <MenuItem key={d} value={d}>{d}d</MenuItem>)}
        </TextField>
      </Stack>

      {err && <Alert severity="warning" sx={{ py: 0 }}>{err.message}</Alert>}

      {data && data.note && <Alert severity="info" sx={{ py: 0, mb: 1 }}>{data.note}</Alert>}

      {data && data.total > 0 && (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Chip size="small" color="primary" label={`${pct(data.modelShare)} model`} />
            <Chip size="small" variant="outlined" label={`${pct(data.templateShare)} template`} />
            <Typography variant="caption" color="text.secondary">{data.total} turns</Typography>
          </Stack>
          <Tooltip title={`${data.model} turns written by the model (these rules), ${data.template} by the template (field hints + fixed acknowledgements)`}>
            <LinearProgress variant="determinate" value={data.modelShare * 100} sx={{ height: 8, borderRadius: 1, mb: 1 }} />
          </Tooltip>
          <Alert severity="info" sx={{ py: 0, mb: 1 }}>
            These rules are given to the model. The {pct(data.templateShare)} of turns written by the
            template take their question from the form field’s own hint and their acknowledgement from
            the fixed strings below — no rule reaches them.
          </Alert>

          {!!data.reasons?.length && (
            <Accordion disableGutters>
              <AccordionSummary expandIcon={<ChevronDown size={15} />}>
                <Typography variant="caption">Why a turn went to the model</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Table size="small">
                  <TableBody>
                    {data.reasons.map((r) => (
                      <TableRow key={r.reason}>
                        <TableCell sx={{ py: 0.25, border: 0 }}>
                          <Typography variant="caption">{REASON_TEXT[r.reason] || r.reason}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 0.25, border: 0, width: 90 }}>
                          <Typography variant="caption" color="text.secondary">
                            {r.turns} · {pct(r.turns / data.model)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AccordionDetails>
            </Accordion>
          )}
        </>
      )}

      {data && data.controlAcks && (
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ChevronDown size={15} />}>
            <Typography variant="caption">The template’s own words (read-only)</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Fixed acknowledgements, one per control type and language. They live in the interface
              strings, not in this graph — editing a rule will not change them.
            </Typography>
            {Object.entries(data.controlAcks).map(([lang, acks]) => (
              <Box key={lang} sx={{ mb: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{lang}</Typography>
                {Object.entries(acks).map(([kind, text]) => (
                  <Typography key={kind} variant="caption" sx={{ display: 'block', pl: 1, color: 'text.secondary' }}>
                    <Box component="span" sx={{ fontFamily: 'monospace' }}>{kind}</Box>: {text}
                  </Typography>
                ))}
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
}
