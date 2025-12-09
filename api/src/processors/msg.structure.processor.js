const fs = require('fs');
const MsgReader = require('@kenjiuno/msgreader').default;

class MsgStructureProcessor {
    async process(buffer) {
        // Modified to accept buffer directly instead of filePath
        const msgReader = new MsgReader(buffer);
        const fileData = msgReader.getFileData();

        const { senderName, senderEmail, subject, body, messageDeliveryTime } = fileData;

        const cleanBody = this.sanitize(body || "");

        // Split threads
        const messages = this.splitThread(cleanBody);

        const atoms = messages.map(msgContent => ({
            type: "email_message",
            content: msgContent.trim(),
            context: `Subject: ${subject}, Sender: ${senderName} <${senderEmail}>, Date: ${messageDeliveryTime}`,
            metadata: {
                messageId: fileData.internetMessageId,
                recipients: fileData.recipients ? fileData.recipients.map(r => r.name || r.email) : []
            }
        }));

        return atoms;
    }

    sanitize(text) {
        if (!text) return "";
        // Remove disclaimers (simple heuristic)
        let clean = text.replace(/This email is confidential.*/gis, "");
        // Remove extra newlines
        clean = clean.replace(/\r\n/g, "\n");
        return clean;
    }

    splitThread(text) {
        // Atomization: Split by "Original Message" or "From:"
        // We use a regex that looks for common thread separators
        const separatorRegex = /(?:-----Original Message-----|From:\s+.*Sent:\s+.*To:\s+.*Subject:\s+.*)/i;

        // Split and keep the delimiters? The prompt says "break into separate messages".
        // Usually the first part is the latest message.
        // We will just split.
        const parts = text.split(separatorRegex);

        return parts.filter(p => p.trim().length > 0);
    }
}

module.exports = new MsgStructureProcessor();
