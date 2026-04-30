import { GxeChatbot } from './components/GxeChatbot';

export default function App() {
  function handleComplete(result) {
    console.log('Request complete:', result);
  }

  // Demo: userId from URL param or default
  const userId = new URLSearchParams(window.location.search).get('userId') || 'demo-user';

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div>
        <h2 style={{ textAlign: 'center', marginBottom: 16, color: '#1e293b', fontFamily: 'system-ui, sans-serif' }}>
          FlowDesk — IT Self-Service Portal
        </h2>
        <GxeChatbot
          userId={userId}
          proxyBase=""
          onComplete={handleComplete}
        />
        <p style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: '#94a3b8', fontFamily: 'system-ui' }}>
          Protected by CaMeL security layer (Quarantined NLU + Runtime Controller)
        </p>
      </div>
    </div>
  );
}
