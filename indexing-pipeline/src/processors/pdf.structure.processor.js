const fs = require('fs');
const pdf = require('pdf-parse');

class PdfStructureProcessor {
    async process(input) {
        let dataBuffer;
        if (Buffer.isBuffer(input)) {
            dataBuffer = input;
        } else {
            dataBuffer = fs.readFileSync(input);
        }

        try {
            const data = await pdf(dataBuffer);
            const text = data.text;

            // Split by double newlines to find paragraphs
            const paragraphs = text.split(/\n\s*\n/);

            const atoms = [];
            let currentContext = "";

            for (const para of paragraphs) {
                const cleanPara = para.trim();
                if (!cleanPara) continue;

                // Heuristic for headers
                if (this.isHeader(cleanPara)) {
                    currentContext = cleanPara;
                    // We also add headers as atoms? The prompt says "add as context to NEXT paragraphs".
                    // It doesn't explicitly say to NOT add the header itself as an atom, but usually headers are context.
                    // However, if we don't add it, we lose the text of the header in the vector store (except as context).
                    // I will add it as context only as per "context: Заголовок раздела" instruction.
                } else {
                    atoms.push({
                        type: "paragraph",
                        content: cleanPara,
                        context: currentContext,
                        metadata: {
                            page: 1, // pdf-parse basic usage aggregates text. For per-page, we'd need render_page callback.
                            source: "pdf"
                        }
                    });
                }
            }

            return atoms;
        } catch (e) {
            console.error("PDF Parse Error:", e);
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

module.exports = new PdfStructureProcessor();
