import React from 'react';

const Message = ({ sender, text }) => {
    const isAi = sender === 'ai';
    return (
        <div className={`message ${isAi ? 'ai' : 'user'}`}>
            <div className="message-content">
                {text}
            </div>
        </div>
    );
};

export default Message;
