#!/usr/bin/env node
/**
 * Quick test: send a prompt to the GXE AI Assistant and check response
 */
const axios = require('axios');

async function test() {
  const resp = await axios.post('http://localhost:3010/api/v1/assistant/chat', {
    message: 'Создай граф для обработки PDF документа: извлечь текст, разбить на чанки, извлечь сущности, сохранить в граф знаний',
    graphState: { isEmpty: true, nodes: [], edges: [] }
  }, {
    responseType: 'stream',
    timeout: 120000
  });

  let fullText = '';
  let actions = [];

  return new Promise((resolve, reject) => {
    resp.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'chunk') fullText += evt.text;
          if (evt.type === 'done') {
            actions = evt.actions || [];
          }
        } catch(_) {}
      }
    });
    resp.data.on('end', () => {
      console.log('=== ACTIONS FOUND:', actions.length, '===');
      for (const a of actions) {
        if (a.type === 'ADD_NODE') {
          console.log('  ADD_NODE:', a.node?.id, '|', a.node?.type, '|', a.node?.label);
        } else if (a.type === 'ADD_EDGE') {
          console.log('  ADD_EDGE:', a.source, '->', a.target);
        } else {
          console.log(' ', a.type, JSON.stringify(a).slice(0, 80));
        }
      }
      console.log('\n=== HAS %%ACTION%% BLOCKS:', fullText.includes('%%ACTION%%'), '===');
      console.log('\n=== FIRST 800 CHARS ===');
      console.log(fullText.slice(0, 800));
      resolve();
    });
    resp.data.on('error', reject);
  });
}

test().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
