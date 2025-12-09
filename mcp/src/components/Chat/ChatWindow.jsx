import React, { useEffect, useRef } from 'react';
import { useChat } from '../../context/ChatContext';
import Message from './Message';
import './Chat.css';

const ChatWindow = () => {
    const { messages, isLoading } = useChat();
    const endRef = useRef(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="chat-window">
            {messages.map((msg, index) => (
                <Message key={index} sender={msg.sender} text={msg.text} />
            ))}
            {isLoading && <div className="loading">AI is thinking...</div>}
            <div ref={endRef} />
        </div>
    );
};

export default ChatWindow;
