/**
 * AssistantPanel (P6) — embedded Claude Code AI chat for the prompt editor.
 * Streams via SSE (token/tool_call/tool_result/mutations/usage/done), renders
 * inline tool calls, and applies proposed graph mutations to the canvas.
 * Modeled on the GXE ExecutionAssistantPanel stream consumer.
 */
import React, { useRef, useState } from 'react';
import {
  Box, Stack, TextField, IconButton, Typography, Paper, Chip, Button, Divider, Tooltip,
  FormControlLabel, Switch,
} from '@mui/material';
import { Send, Square, Bot, User, Wrench, GitMerge, Sparkles, Undo2 } from 'lucide-react';
import { promptAssistantChat } from '../api/adminClient';
import { useRulesStore } from './rulesStore';

export default function AssistantPanel() {
  const [messages, setMessages] = useState([]); // {role, content, toolCalls?, mutations?}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [autoApply, setAutoApply] = useState(true);
  const abortRef = useRef(null);
  const toGraph = useRulesStore((s) => s.toGraph);
  const applyMutations = useRulesStore((s) => s.applyMutations);
  const undo = useRulesStore((s) => s.undo);
  const scrollRef = useRef(null);

  const scroll = () => { requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }); };

  const send = () => {
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const userMsg = { role: 'user', content: message };
    const asst = { role: 'assistant', content: '', toolCalls: [], mutations: null, usage: null };
    setMessages((m) => [...m, userMsg, asst]);
    setBusy(true);
    scroll();

    const patchAsst = (fn) => setMessages((m) => {
      const copy = m.slice();
      const idx = copy.length - 1;
      copy[idx] = fn({ ...copy[idx] });
      return copy;
    });

    const { abort } = promptAssistantChat({ message, history, graph: toGraph() }, (ev) => {
      switch (ev.type) {
        case 'token': patchAsst((a) => ({ ...a, content: a.content + (ev.content || '') })); scroll(); break;
        case 'tool_call': patchAsst((a) => ({ ...a, toolCalls: [...a.toolCalls, { tool: ev.tool, pending: true }] })); break;
        case 'tool_result': patchAsst((a) => {
          const tc = a.toolCalls.slice();
          const i = tc.findIndex((t) => t.pending);
          if (i >= 0) tc[i] = { ...tc[i], pending: false, success: ev.success };
          return { ...a, toolCalls: tc };
        }); break;
        case 'mutations': patchAsst((a) => {
          // Auto-apply: the assistant edits the canvas directly (with undo available).
          if (autoApply) { const res = applyMutations(ev.mutations); return { ...a, mutations: ev.mutations, applied: res, auto: true }; }
          return { ...a, mutations: ev.mutations };
        }); break;
        case 'usage': patchAsst((a) => ({ ...a, usage: ev.costUsd })); break;
        case 'error': patchAsst((a) => ({ ...a, content: `${a.content}\n\n⚠ ${ev.message}` })); break;
        case 'done': setBusy(false); scroll(); break;
        default: break;
      }
    });
    abortRef.current = abort;
  };

  const stop = () => { abortRef.current?.(); setBusy(false); };
  const applyMut = (idx, ops) => {
    const res = applyMutations(ops);
    setMessages((m) => m.map((x, i) => (i === idx ? { ...x, applied: res } : x)));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
        <Sparkles size={15} /><Typography variant="subtitle2">AI assistant</Typography>
        <Typography variant="caption" color="text.secondary">Claude Code · edits the graph · MCP</Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="When on, the assistant's proposed rule changes are applied to the canvas automatically (undo available).">
          <FormControlLabel sx={{ m: 0 }} control={<Switch size="small" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} />}
            label={<Typography variant="caption">auto-edit</Typography>} />
        </Tooltip>
      </Stack>

      <Box ref={scrollRef} sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {!messages.length && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            Ask the assistant to improve the system prompt. It can read real chat sessions
            (negative ones, analysis, stats) via MCP, propose rule changes (applied to the
            canvas), and validate / sandbox-test them. Try: <em>“Find the most common failure
            in recent sessions and add a rule to fix it.”</em>
          </Typography>
        )}
        {messages.map((m, i) => (
          <Stack key={i} direction="row" spacing={1} sx={{ mb: 1.5 }} justifyContent={m.role === 'user' ? 'flex-end' : 'flex-start'}>
            {m.role === 'assistant' && <Bot size={16} style={{ marginTop: 4, flexShrink: 0, opacity: 0.6 }} />}
            <Box sx={{ maxWidth: '88%' }}>
              <Paper variant="outlined" sx={{ px: 1.25, py: 0.75, bgcolor: m.role === 'user' ? 'primary.main' : 'action.hover', color: m.role === 'user' ? 'primary.contrastText' : 'text.primary' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content || (busy && i === messages.length - 1 ? '…' : '')}</Typography>
              </Paper>
              {(m.toolCalls || []).length > 0 && (
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                  {m.toolCalls.map((t, j) => (
                    <Chip key={j} size="small" icon={<Wrench size={11} />} label={t.tool}
                      color={t.pending ? 'default' : (t.success ? 'success' : 'error')} variant="outlined" />
                  ))}
                </Stack>
              )}
              {m.mutations && (
                <Paper variant="outlined" sx={{ mt: 0.5, p: 1, borderColor: 'primary.main' }}>
                  <Typography variant="caption" color="text.secondary">Proposed graph changes: {m.mutations.length} op(s)</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ my: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                    {m.mutations.map((op, k) => <Chip key={k} size="small" label={`${op.op} ${op.node?.key || op.key || ''}`} />)}
                  </Stack>
                  {m.applied ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption" color="success.main">
                        {m.auto ? 'Auto-applied' : 'Applied'} to canvas: +{m.applied.added} ~{m.applied.updated} -{m.applied.removed}
                      </Typography>
                      {m.auto && <Button size="small" variant="text" color="inherit" startIcon={<Undo2 size={12} />} onClick={undo}>Undo</Button>}
                    </Stack>
                  ) : (
                    <Button size="small" variant="contained" startIcon={<GitMerge size={13} />} onClick={() => applyMut(i, m.mutations)}>Apply to canvas</Button>
                  )}
                </Paper>
              )}
              {m.usage != null && <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>${Number(m.usage).toFixed(4)}</Typography>}
            </Box>
            {m.role === 'user' && <User size={16} style={{ marginTop: 4, flexShrink: 0, opacity: 0.6 }} />}
          </Stack>
        ))}
      </Box>

      <Divider />
      <Stack direction="row" spacing={1} sx={{ p: 1 }}>
        <TextField size="small" fullWidth multiline maxRows={4} placeholder="Ask the assistant…" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} disabled={busy} />
        {busy
          ? <Tooltip title="Stop"><IconButton color="error" onClick={stop}><Square size={18} /></IconButton></Tooltip>
          : <Tooltip title="Send"><span><IconButton color="primary" onClick={send} disabled={!input.trim()}><Send size={18} /></IconButton></span></Tooltip>}
      </Stack>
    </Box>
  );
}
