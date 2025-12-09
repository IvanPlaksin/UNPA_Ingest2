const fs = require('fs');
const pdf = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');

/**
 * @typedef {import('./structure.types').Atom} Atom
 */

class PdfParser {
    /**
     * Parses a PDF file into structural Atoms.
     * @param {string} filePath - Path to the PDF file.
     * @returns {Promise<Atom[]>}
     */
    async parse(filePath) {
        const dataBuffer = fs.readFileSync(filePath);

        try {
            const data = await pdf(dataBuffer);
            const rawText = data.text;

            // Normalize line endings
            const normalizedText = rawText.replace(/\r\n/g, '\n');

            // Split by double newline to get paragraphs/blocks
            const blocks = normalizedText.split(/\n\s*\n/);

            const atoms = [];
            let currentContext = "Document Start";

            for (const block of blocks) {
                const trimmedBlock = block.trim();
                if (!trimmedBlock) continue;

                // Heuristic for Header detection
                // 1. Short length (< 100 chars)
                // 2. AND (All Uppercase OR Ends with ':')
                const isHeader = trimmedBlock.length < 100 &&
                    (trimmedBlock === trimmedBlock.toUpperCase() || trimmedBlock.endsWith(':'));

                if (isHeader) {
                    currentContext = trimmedBlock;
                } else {
                    // It's a content paragraph
                    atoms.push({
                        id: uuidv4(),
                        type: 'paragraph',
                        content: trimmedBlock,
                        context: currentContext,
                        metadata: {
                            source: 'pdf',
                            page_count: data.numpages,
                            info: data.info
                        }
                    });
                }
            }

            return atoms;

        } catch (error) {
            console.error("Error parsing PDF:", error);
            throw error;
        }
    }
}

module.exports = new PdfParser();
