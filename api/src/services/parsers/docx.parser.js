const mammoth = require('mammoth');
const { v4: uuidv4 } = require('uuid');

/**
 * @typedef {import('./structure.types').Atom} Atom
 */

class DocxParser {
    /**
     * Parses a DOCX file into structural Atoms.
     * @param {string} filePath - Path to the DOCX file.
     * @returns {Promise<Atom[]>}
     */
    async parse(filePath) {
        try {
            const result = await mammoth.extractRawText({ path: filePath });
            const rawText = result.value;

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
                            source: 'docx',
                            messages: result.messages // Warnings from mammoth
                        }
                    });
                }
            }

            return atoms;

        } catch (error) {
            console.error("Error parsing DOCX:", error);
            throw error;
        }
    }
}

module.exports = new DocxParser();
