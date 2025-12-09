// src/services/role.service.js
const fs = require('fs');
const path = require('path');

// Загружаем нашу "базу данных" ролей при старте
const dbPath = path.join(__dirname, 'role_definitions.json');
const ROLES_DB = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log("[Role Service] Загружены определения ролей (локальный режим).");

/**
 * Собирает все уникальные инструкции для конкретного пользователя.
 * @param {string} userId (например, 'manager@un.org')
 * @returns {Promise<string>} Строка, содержащая все инструкции для этого пользователя.
 */
async function getContextForUser(userId) {
    console.log(`[Role Service] Поиск контекста для пользователя: ${userId}`);
    
    // 1. Найти пользователя
    const user = ROLES_DB.users.find(u => u.id === userId);
    if (!user) {
        console.log(`[Role Service] Пользователь ${userId} не найден. Используется базовый контекст.`);
        return ""; // Возвращаем пустой контекст
    }

    // 2. Собрать все ID инструкций (уникальные)
    const instructionIds = new Set();
    for (const roleId of user.roles) {
        const role = ROLES_DB.roles.find(r => r.id === roleId);
        if (role) {
            role.instructionIds.forEach(id => instructionIds.add(id));
        }
    }

    if (instructionIds.size === 0) {
        console.log(`[Role Service] У пользователя ${userId} нет инструкций.`);
        return "";
    }

    // 3. Собрать тексты инструкций
    const instructions = [];
    for (const id of instructionIds) {
        const instruction = ROLES_DB.instructions.find(i => i.id === id);
        if (instruction) {
            instructions.push(`- ${instruction.prompt_text}`);
        }
    }

    const contextString = instructions.join("\n");
    console.log(`[Role Service] ДИАГНОСТИКА: Контекст для ${userId}:`, JSON.stringify(contextString, null, 2));
    
    return contextString;
}

module.exports = {
    getContextForUser
};