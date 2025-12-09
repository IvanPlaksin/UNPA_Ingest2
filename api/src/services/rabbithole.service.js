// src/services/rabbithole.service.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || "gemini-flash-latest";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function chat(message, currentFilters, visibleItems, visibleColumns, fieldDefinitions) {
    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL_NAME,
        generationConfig: {
            responseMimeType: "application/json"
        }
    });

    const systemPrompt = `
You are the "Rabbit Hole Guide", an AI assistant for a DevOps search tool called "The Rabbit Hole".
Your persona is slightly ironic, witty, but extremely helpful. You help users "dig deep" into their backlog.

CONTEXT:
- Current Filters: ${JSON.stringify(currentFilters)}
- Visible Work Items (Top 20): ${JSON.stringify(visibleItems.slice(0, 20))}
- Available Columns: ${JSON.stringify(Object.keys(fieldDefinitions || {}))}
- Visible Columns: ${JSON.stringify(visibleColumns || [])}

GOAL:
- Interpret the user's request.
- If the user wants to filter data (e.g., "show me bugs", "assigned to Bob"), generate an "UPDATE_FILTERS" action.
- If the user wants to change visible columns (e.g., "show me the ID", "hide the state", "add Area Path"), generate an "UPDATE_COLUMNS" action.
- If the user asks about the visible data (e.g., "summarize these items"), answer based on the "Visible Work Items".

RESPONSE FORMAT:
You must ALWAYS return a JSON object with the following structure:
{
    "text": "Your response to the user (ironic but helpful).",
    "action": {
        "type": "UPDATE_FILTERS" | "UPDATE_COLUMNS" | null,
        "payload": ...
    }
}

Action Payloads:
1. UPDATE_FILTERS:
{
    "title": "string or null",
    "state": "string or null",
    "assignedTo": "string or null",
    "areaPath": "string or null",
    "iterationPath": "string or null",
    "type": "string or null"
}

2. UPDATE_COLUMNS:
{
    "columns": ["System.Id", "System.Title", ...] // The COMPLETE list of columns to show.
}
IMPORTANT: When updating columns, you must provide the FULL list of columns you want visible, not just the changes. Start with the "Visible Columns" from context and add/remove as requested. Ensure "System.Id" and "System.Title" are always present unless explicitly asked to remove (which is rare).

If no update is needed, set "action" to null.
    `;

    const chat = model.startChat({
        history: [
            {
                role: "user",
                parts: [{ text: systemPrompt }]
            },
            {
                role: "model",
                parts: [{ text: JSON.stringify({ text: "I'm ready to dig. What are we looking for?", action: null }) }]
            }
        ]
    });

    try {
        const result = await chat.sendMessage(message);
        const responseText = result.response.text();
        return JSON.parse(responseText);
    } catch (error) {
        console.error("[RabbitHole Service] Error:", error);
        return {
            text: "I hit a rock while digging. Something went wrong.",
            action: null
        };
    }
}

module.exports = {
    chat
};
