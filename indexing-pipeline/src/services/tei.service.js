const axios = require('axios');

const TEI_URL = process.env.TEI_URL || 'http://tei:80';

class TeiService {
    /**
     * Generates embeddings for a list of texts.
     * @param {string[]} texts - Array of texts to embed.
     * @returns {Promise<number[][]>} - Array of embedding vectors.
     */
    async getEmbeddings(texts) {
        try {
            const response = await axios.post(`${TEI_URL}/embed`, {
                inputs: texts,
                normalize: true,
                truncate: true
            });
            return response.data;
        } catch (error) {
            console.error('Error generating embeddings:', error.message);
            throw error;
        }
    }
}

module.exports = new TeiService();
