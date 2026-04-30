import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useUnpaChat } from './useUnpaChat';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import FormWidget from './components/FormWidget';
import './styles/unpa-chat.css';

/**
 * UnpaChat — embeddable AI chat component backed by GXE dialog graphs.
 *
 * @param {object} props
 * @param {string}   props.apiBaseUrl    - e.g. '/api/v1'
 * @param {string}   props.userId        - authenticated user ID
 * @param {string}   [props.graphId]     - specific graph to use
 * @param {string}   [props.graphVersion]
 * @param {string}   [props.sessionId]   - override auto-generated session ID
 * @param {string}   [props.welcomeText] - initial bot message
 * @param {string}   [props.placeholder] - input placeholder
 * @param {'dark'|'light'} [props.theme] - theme preset
 * @param {string}   [props.className]
 * @param {string|number} [props.width]  - CSS width (default '100%')
 * @param {string|number} [props.height] - CSS height (default '600px')
 * @param {object}   [props.style]       - additional inline styles
 * @param {function} [props.onComplete]  - called when graph reaches end node
 * @param {function} [props.onError]
 */
export default function UnpaChat({
  apiBaseUrl,
  userId,
  graphId,
  graphVersion,
  sessionId: initialSessionId,
  welcomeText,
  placeholder,
  theme = 'dark',
  className = '',
  width = '100%',
  height = '600px',
  style,
  onComplete,
  onError,
}) {
  const [input, setInput] = useState('');
  const initializedRef = useRef(false);

  const chat = useUnpaChat({
    apiBaseUrl,
    userId,
    graphId,
    graphVersion,
    initialSessionId,
    onComplete,
    onError,
  });

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    console.log('[UnpaChat] mount effect — calling initialize');
    chat.initialize({ welcomeText });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || chat.isLoading) return;
    setInput('');
    chat.sendMessage(text);
  }, [input, chat]);

  // Called by ChatMessage to render the form for a waiting node
  const renderForm = useCallback((message) => {
    if (!message.waitingNode) return null;
    return (
      <FormWidget
        waitingNode={message.waitingNode}
        choices={message.waitingNode.choices || message.choices}
        sessionState={chat.dialogState}
        isLoading={chat.isLoading}
        onSubmit={(value) => chat.submitForm(value, message)}
        onChoiceClick={(choice) => chat.handleChoiceClick(choice, message)}
      />
    );
  }, [chat]);

  const rootStyle = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  };

  return (
    <div
      className={`unpa-chat-root unpa-theme-${theme} ${className}`.trim()}
      style={rootStyle}
    >
      <MessageList
        messages={chat.messages}
        isLoading={chat.isLoading}
        onFormSubmit={renderForm}
        onChoiceClick={(choice, msg) => chat.handleChoiceClick(choice, msg)}
        dialogState={chat.dialogState}
      />
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        isLoading={chat.isLoading}
        placeholder={placeholder}
      />
    </div>
  );
}
