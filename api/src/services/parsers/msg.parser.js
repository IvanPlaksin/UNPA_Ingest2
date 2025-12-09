const fs = require('fs');
const MsgReader = require('@kenjiuno/msgreader').default;
const { v4: uuidv4 } = require('uuid');

/**
 * @typedef {import('./structure.types').Atom} Atom
 */

class MsgParser {
    /**
     * Parses an Outlook .msg file into structural Atoms.
     * @param {string} filePath - Path to the .msg file.
     * @returns {Promise<Atom[]>}
     */
    async parse(filePath) {
        const fileBuffer = fs.readFileSync(filePath);
        const msgReader = new MsgReader(fileBuffer);

        try {
            const fileData = msgReader.getFileData();

            if (!fileData.body) {
                return [];
            }

            const subject = fileData.subject || "No Subject";
            const sender = fileData.senderName || fileData.senderEmail || "Unknown Sender";
            const context = `Subject: ${subject} | From: ${sender}`;

            let body = fileData.body;

            // Clean standard disclaimers (Simple example)
            body = body.replace(/Confidentiality Notice:.*$/gims, '');
            body = body.replace(/Sent from my iPhone/gi, '');

            // Atomization: Split by "Original Message" indicators to separate thread parts
            // Common separators: "-----Original Message-----", "From: ... Sent: ... To: ..."
            const threadParts = body.split(/-----Original Message-----|From:\s+.*Sent:\s+.*To:\s+.*/);

            const atoms = [];

            // The first part is the latest message
            if (threadParts[0] && threadParts[0].trim()) {
                atoms.push({
                    id: uuidv4(),
                    type: 'email_message',
                    content: threadParts[0].trim(),
                    context: context, // Context for the main message
                    metadata: {
                        source: 'msg',
                        subject: subject,
                        sender: sender,
                        date: fileData.messageDeliveryTime,
                        recipients: fileData.recipients ? fileData.recipients.map(r => r.name || r.email) : []
                    }
                });
            }

            // Process older parts if needed (optional, often we just want the latest or treat them as history)
            // For now, let's treat the rest as "Email History" atoms
            for (let i = 1; i < threadParts.length; i++) {
                const part = threadParts[i].trim();
                if (part) {
                    atoms.push({
                        id: uuidv4(),
                        type: 'email_message',
                        content: part,
                        context: `${context} (History)`,
                        metadata: {
                            source: 'msg',
                            isHistory: true
                        }
                    });
                }
            }

            return atoms;

        } catch (error) {
            console.error("Error parsing MSG:", error);
            throw error;
        }
    }
}

module.exports = new MsgParser();
