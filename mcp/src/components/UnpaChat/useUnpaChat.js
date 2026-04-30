import { useState, useCallback, useRef } from 'react';
import { sendChatMessage, fetchGraphInfo } from './services/chatApi';
import { generateSessionId } from './utils/sessionId';

/**
 * Headless hook — all UnpaChat logic, no UI.
 *
 * @param {object} config
 * @param {string} config.apiBaseUrl - base URL, e.g. '/api/v1'
 * @param {string} config.userId - authenticated user ID
 * @param {string} [config.graphId] - specific graph to use
 * @param {string} [config.graphVersion] - specific version
 * @param {string} [config.initialSessionId] - override auto-generated session ID
 * @param {function} [config.onComplete] - called when graph reaches end node
 * @param {function} [config.onError] - called on API error
 *
 * @returns {{ messages, isLoading, dialogState, sessionId, sendMessage, submitForm, handleChoiceClick, reset }}
 */
export function useUnpaChat({
  apiBaseUrl,
  userId,
  graphId,
  graphVersion,
  initialSessionId,
  onComplete,
  onError,
} = {}) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dialogState, setDialogState] = useState({});
  const [sessionId, setSessionId] = useState(() => initialSessionId || generateSessionId());

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const addBotMessage = useCallback((text, { choices, waitingNode, isError } = {}) => {
    setMessages(prev => [...prev, { role: 'bot', text, choices: choices || null, waitingNode: waitingNode || null, isError: Boolean(isError) }]);
  }, []);

  const addUserMessage = useCallback((text) => {
    setMessages(prev => [...prev, { role: 'user', text }]);
  }, []);

  const _postMessage = useCallback(async (text) => {
    console.trace('[UnpaChat] _postMessage called', { text: text?.slice(0, 40), apiBaseUrl, graphId });
    setIsLoading(true);
    try {
      const data = await sendChatMessage(apiBaseUrl, {
        sessionId: sessionIdRef.current,
        userId,
        message: text,
        graphVersion,
        graphId,
      });

      setDialogState(data.state || {});

      if (data.executionLog) {
        // nothing to store here — passed through message payload
      }

      if (data.response) {
        const waitingNode = data.executionLog?.find(e => e.status === 'waiting');
        addBotMessage(data.response, {
          choices: data.choices || null,
          waitingNode: waitingNode ? {
            nodeId: waitingNode.node,
            label: waitingNode.label,
            prompt: waitingNode.inputState?.prompt,
            inputType: waitingNode.inputState?.inputType || 'text',
            choices: waitingNode.inputState?.choices,
          } : null,
        });
      }

      if (data.isComplete && onComplete) {
        onComplete(data);
      }

      return data;
    } catch (err) {
      const msg = err.message || 'Unknown error';
      addBotMessage(`Error: ${msg}`, { isError: true });
      if (onError) onError(err);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, userId, graphVersion, graphId, addBotMessage, onComplete, onError]);

  const sendMessage = useCallback(async (text) => {
    if (!text?.trim() || isLoading) return;
    addUserMessage(text.trim());
    await _postMessage(text.trim());
  }, [isLoading, addUserMessage, _postMessage]);

  const submitForm = useCallback(async (rawValue, sourceMessage) => {
    if (!rawValue || isLoading) return;

    // rawValue: string (simple inputs) or plain object (STRUCTURAL multi-field forms)
    const value = (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue))
      || typeof rawValue === 'string'
        ? rawValue
        : null;

    if (!value) return;

    if (sourceMessage) {
      setMessages(prev => prev.map(m => m === sourceMessage ? { ...m, formSubmitted: true } : m));
    }

    const msgText = typeof value === 'object' ? JSON.stringify(value) : String(value);
    addUserMessage(msgText);
    await _postMessage(msgText);
  }, [isLoading, addUserMessage, _postMessage]);

  const handleChoiceClick = useCallback(async (choice, sourceMessage) => {
    if (isLoading) return;

    // Disable choices on the source message
    if (sourceMessage) {
      setMessages(prev => prev.map(m =>
        m === sourceMessage
          ? { ...m, choices: m.choices?.map(c => ({ ...c, disabled: true, selected: c.value === choice.value })) }
          : m
      ));
    }

    addUserMessage(choice.label);
    await _postMessage(choice.value);
  }, [isLoading, addUserMessage, _postMessage]);

  const reset = useCallback(async (newGraphId) => {
    const newSid = generateSessionId();
    setSessionId(newSid);
    sessionIdRef.current = newSid;
    setMessages([]);
    setDialogState({});
    setIsLoading(false);

    if (newGraphId || graphId) {
      try {
        const info = await fetchGraphInfo(apiBaseUrl, newGraphId || graphId);
        const name = info.name || (newGraphId || graphId);
        addBotMessage(`Graph loaded: **${name}**. How can I help you?`);
      } catch (err) {
        addBotMessage('Session reset. How can I help you?');
        if (onError) onError(err);
      }
    }
  }, [apiBaseUrl, graphId, addBotMessage, onError]);

  const initialize = useCallback(async (options = {}) => {
    console.log('[UnpaChat] initialize called', { graphId: options.graphId || graphId });
    const gId = options.graphId || graphId;
    const welcomeText = options.welcomeText;

    if (gId) {
      try {
        const info = await fetchGraphInfo(apiBaseUrl, gId);
        const name = info.name || gId;
        addBotMessage(welcomeText || `Graph loaded: **${name}**. How can I help you?`);
        return info;
      } catch (err) {
        addBotMessage(welcomeText || 'How can I help you?');
        if (onError) onError(err);
      }
    } else {
      addBotMessage(welcomeText || 'How can I help you?');
    }
  }, [apiBaseUrl, graphId, addBotMessage, onError]);

  return {
    messages,
    isLoading,
    dialogState,
    sessionId,
    sendMessage,
    submitForm,
    handleChoiceClick,
    reset,
    initialize,
  };
}
