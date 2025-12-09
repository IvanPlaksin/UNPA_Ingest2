// src/services/vector.service.js

// ⭐ ЗАГЛУШКА: Мы импортируем файловую систему (fs) вместо Google Cloud
const fs = require('fs');
const path = require('path');

// ⭐ ЗАГЛУШКА: Весь код @google-cloud/aiplatform удален

// Путь к нашему локальному файлу "мастер-данных"
const localDataPath = path.join(__dirname, 'local_master_data.json');

console.log(`[Stub Vector Service] Настроен на чтение из: ${localDataPath}`);

/**
 * Ищет релевантный контекст (ЗАГЛУШКА).
 * Игнорирует queryVector и просто возвращает ВЕСЬ контекст из файла.
 * @param {number[]} queryVector Фейковый вектор (игнорируется).
 * @returns {Promise<string>} Строка с полным контекстом.
 */
async function searchContext(queryVector) {
    console.log("[Stub Vector Service] Чтение 'мастер-данных' из локального JSON...");

    try {
        const fileContents = fs.readFileSync(localDataPath, 'utf8');
        const data = JSON.parse(fileContents);

        // Извлекаем весь текст из нашего JSON
        const contextItems = data.map(item => item.text_content);

        if (contextItems.length === 0) {
            console.log("[Stub Vector Service] Локальный файл не вернул данных.");
            return "";
        }

        const contextString = contextItems.join("\n---\n");
        
        console.log(`[Stub Vector Service] Найдено ${contextItems.length} фрагментов локального контекста.`);
        console.log(`[Stub Vector Service] ДИАГНОСТИКА: Контекст:`, JSON.stringify(contextString, null, 2));
        
        return contextString;

    } catch (error) {
        console.error("[Stub Vector Service] Ошибка при чтении локального файла:", error);
        // Не останавливаем Агента, просто возвращаем пустой контекст
        return ""; 
    }
}

module.exports = {
    searchContext
};