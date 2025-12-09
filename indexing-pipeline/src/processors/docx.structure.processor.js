const fs = require('fs');
const mammoth = require('mammoth');

class DocxStructureProcessor {
    /**
     * Processes a DOCX file or buffer and returns structured atoms.
     * @param {string|Buffer} input File path or Buffer
     * @returns {Promise<Array>} Array of atoms
     */
    async process(input) {
        let buffer;
        if (Buffer.isBuffer(input)) {
            buffer = input;
        } else {
            buffer = fs.readFileSync(input);
        }

        try {
            const result = await mammoth.extractRawText({ buffer: buffer });
            const text = result.value;
            const messages = result.messages; // Warnings, etc.

            if (messages.length > 0) {
                console.warn("DOCX Parse Warnings:", messages);
            }

            // Split by double newlines to find paragraphs
            const paragraphs = text.split(/\n\s*\n/);

            const atoms = [];
            let currentContext = "";

            for (const para of paragraphs) {
                const cleanPara = para.trim();
                if (!cleanPara) continue;

                // Heuristic for headers (similar to PDF)
                if (this.isHeader(cleanPara)) {
                    currentContext = cleanPara;
                } else {
                    atoms.push({
                        type: "paragraph",
                        content: cleanPara,
                        context: currentContext,
                        metadata: {
                            source: "docx"
                        }
                    });
                }
            }

            return atoms;
        } catch (e) {
            console.error("DOCX Parse Error:", e);
            throw e;
        }
    }

    isHeader(text) {
        // Heuristic: Short, UPPERCASE or ends with :
        const isShort = text.length < 100;
        const isUpper = text === text.toUpperCase() && /[A-Z]/.test(text);
        const endsWithColon = text.trim().endsWith(':');

        return isShort && (isUpper || endsWithColon);
    }
}

module.exports = new DocxStructureProcessor();
