import React, { createContext, useState, useContext } from 'react';
import { sendChatMessage } from '../services/api';

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
    const [messages, setMessages] = useState([{ sender: 'ai', text: 'Привет! Я UN ProjectAdvisor. Чем могу помочь?' }]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState('manager@un.org');

    const sendMessage = async (text) => {
        setMessages(prev => [...prev, { sender: 'user', text }]);
        setIsLoading(true);
        try {
            const response = await sendChatMessage(text, currentUser);
            setMessages(prev => [...prev, { sender: 'ai', text: response }]);
        } catch (error) {
            setMessages(prev => [...prev, { sender: 'ai', text: 'Ошибка соединения с сервером.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <ChatContext.Provider value={{ messages, isLoading, sendMessage, currentUser, setCurrentUser }}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => useContext(ChatContext);
