// src/services/embedding.service.js

// ⭐ ЗАГЛУШКА: Мы больше не импортируем GoogleGenerativeAI
// const { GoogleGenerativeAI } = require('@google/generative-ai');
// ... (весь старый код настройки удален) ...

console.log(`[Stub Embedding Service] Инициализирован (локальный режим).`);

/**
 * Превращает текстовый запрос в вектор (ЗАГЛУШКА).
 * @param {string} text Текст запроса пользователя.
 * @returns {Promise<number[]>} Фейковый вектор.
 */
async function embedText(text) {
    console.log(`[Stub Embedding] Создание фейкового вектора для: "${text}"`);
    // Нам не важен результат, так как vector.service.js (заглушка)
    // все равно его проигнорирует.
    return [0.1, 0.2, 0.3, 0.4, 0.5];
}

module.exports = {
    embedText
};