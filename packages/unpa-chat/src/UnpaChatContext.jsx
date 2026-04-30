import React, { createContext, useContext } from 'react';

const UnpaChatContext = createContext(null);

export function UnpaChatProvider({ children, value }) {
  return (
    <UnpaChatContext.Provider value={value}>
      {children}
    </UnpaChatContext.Provider>
  );
}

export function useUnpaChatContext() {
  const ctx = useContext(UnpaChatContext);
  if (!ctx) throw new Error('useUnpaChatContext must be used within UnpaChatProvider');
  return ctx;
}
