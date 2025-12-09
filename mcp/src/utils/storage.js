/**
 * Utility for handling localStorage operations safely.
 */
export class Storage {
    /**
     * Save a value to localStorage.
     * @param {string} key - The key to save under.
     * @param {any} value - The value to save (will be JSON stringified).
     */
    static save(key, value) {
        try {
            const serializedValue = JSON.stringify(value);
            localStorage.setItem(key, serializedValue);
        } catch (error) {
            console.error(`Error saving to localStorage key "${key}":`, error);
        }
    }

    /**
     * Load a value from localStorage.
     * @param {string} key - The key to load.
     * @param {any} defaultValue - The default value to return if key doesn't exist or error occurs.
     * @returns {any} The loaded value or defaultValue.
     */
    static load(key, defaultValue) {
        try {
            const serializedValue = localStorage.getItem(key);
            if (serializedValue === null) {
                return defaultValue;
            }
            return JSON.parse(serializedValue);
        } catch (error) {
            console.error(`Error loading from localStorage key "${key}":`, error);
            return defaultValue;
        }
    }

    /**
     * Remove a value from localStorage.
     * @param {string} key - The key to remove.
     */
    static remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error(`Error removing from localStorage key "${key}":`, error);
        }
    }
}
