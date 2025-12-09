const fs = require('fs');
const pdf = require('pdf-parse');

class PdfStructureProcessor {
    /**
     * @param {Buffer|string} input 
     * @returns {Promise<import('../services/parsers/structure.types').Atom[]>}
     */
    async process(input) {
        let dataBuffer;
        if (Buffer.isBuffer(input)) {
            dataBuffer = input;
        } else {
            dataBuffer = fs.readFileSync(input);
        }

        try {
            // Use pdf-parse to extract raw text
            // Note: render_page or pagerender options could give us per-page info if we need it
            // For now, we take the full text and split by lines/paragraphs.
            const data = await pdf(dataBuffer);
            const text = data.text;

            // Split into lines first to detect headers accurately
            const lines = text.split(/\n/);

            const atoms = [];
            let contextStack = []; // Stack of active headers
            let currentParagraph = []; // Accumulate text lines into a paragraph

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();

                if (!line) {
                    // Empty line implies end of paragraph (if we have one accumulated)
                    if (currentParagraph.length > 0) {
                        this._addAtom(atoms, currentParagraph.join(' '), contextStack, data.numpages);
                        currentParagraph = [];
                    }
                    continue;
                }

                // 1. Filter Noise
                if (this._isNoise(line)) continue;

                // 2. Check for Header
                if (this._isHeader(line)) {
                    // Flush existing paragraph first
                    if (currentParagraph.length > 0) {
                        this._addAtom(atoms, currentParagraph.join(' '), contextStack, data.numpages);
                        currentParagraph = [];
                    }

                    // Manage Stack
                    // Heuristic: If new header looks like a "Top Level" (e.g. Chapter X), clear stack?
                    // For safety in this MVP, we'll try to keep it simple:
                    // If we find a header, we assume it's a child of the previous unless likely top level.
                    // Or simpler: Just replace the last item if it looks like a sibling? 
                    // Real hierarchy is hard. Let's stick to "Append" but limit depth to avoid infinite growth?
                    // USER INSTRUCTION: "If you can infer ... pop the stack ... for now 'current active header' is sufficient"

                    // Simple "Active Header" mode:
                    // Only keep the LATEST header as the main context, plus maybe one parent if obvious?
                    // Let's implement: [Most Recent Header] as the context.
                    // But if we want hierarchy (Manual > Chapter 1), we need to be smarter.

                    // Improved Logic:
                    // If line is ALL CAPS, it might be a major section -> Clear stack, push this.
                    // If line is Mixed Case, it might be a sub-section -> Push this.

                    if (this._isMajorHeader(line)) {
                        contextStack = [line];
                    } else {
                        // Sub-header logic is risky without font size.
                        // Let's just set the stack to [line] for normal headers too to prevent mess,
                        // unless we are VERY sure.
                        // For MVP: Context = [Line]. This effectively implements "current active header".
                        contextStack = [line];
                    }

                    // Also add the header itself as an atom types 'header'
                    atoms.push({
                        type: 'header',
                        content: line,
                        context: [], // Headers define context, they don't have it (usually)
                        metadata: { source: 'pdf' }
                    });

                } else {
                    // Normal text
                    currentParagraph.push(line);
                }
            }

            // Flush last paragraph
            if (currentParagraph.length > 0) {
                this._addAtom(atoms, currentParagraph.join(' '), contextStack, data.numpages);
            }

            return atoms;

        } catch (e) {
            console.error("PDF Parse Error:", e);
            throw e;
        }
    }

    _addAtom(atoms, content, context, totalPages) {
        if (!content) return;
        atoms.push({
            type: 'text',
            content: content,
            context: [...context], // Clone stack
            metadata: {
                source: "pdf",
                // page: hard to trace with simple text split, defaulting to 1 or null
            }
        });
    }

    _isNoise(line) {
        // Page X of Y
        if (/^Page \d+( of \d+)?$/i.test(line)) return true;
        // Copyright footers (simple heuristic)
        if (/^©.*20\d\d/.test(line)) return true;
        return false;
    }

    _isMajorHeader(line) {
        // ALL CAPS usually major
        return (line === line.toUpperCase() && /[A-Z]/.test(line));
    }

    _isHeader(line) {
        // 1. Short and ends with colon
        if (line.length < 100 && line.endsWith(':')) return true;
        // 2. Short and All Caps
        if (line.length < 80 && this._isMajorHeader(line)) return true;
        // 3. Numbered (1. Introduction)
        if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(line) && line.length < 80) return true;

        return false;
    }
}

module.exports = new PdfStructureProcessor();
