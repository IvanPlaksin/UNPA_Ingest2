/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PARSE DOCUMENT EXECUTOR
 * Parses various document formats (PDF, DOCX, etc.) to text
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  BaseExecutor,
  ExecutionContext,
  NodeExecutionResult,
} from '../../../plugins/plugin-base';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

interface ParseDocumentParameters {
  filePath?: string;
  content?: Buffer | string;
  mimeType?: string;
  filename?: string;
  extractMetadata?: boolean;
  extractStructure?: boolean;
}

interface DocumentSection {
  title: string;
  level: number;
  start: number;
  end: number;
  content?: string;
}

interface ParseDocumentResult {
  text: string;
  format: string;
  metadata: {
    title?: string;
    author?: string;
    createdAt?: string;
    modifiedAt?: string;
    pageCount?: number;
    wordCount: number;
    charCount: number;
    [key: string]: unknown;
  };
  structure?: {
    sections: DocumentSection[];
    hasTableOfContents: boolean;
    hasTables: boolean;
    hasImages: boolean;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class ParseDocumentExecutor extends BaseExecutor {
  readonly type = 'ingestion.parse_document';
  readonly displayName = 'Parse Document';
  readonly description = 'Parse PDF, DOCX, and other document formats to extract text';
  readonly domain = 'ingestion';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the document file',
      },
      content: {
        type: 'string',
        description: 'Base64-encoded document content',
      },
      mimeType: {
        type: 'string',
        description: 'MIME type of the document',
      },
      filename: {
        type: 'string',
        description: 'Original filename for format detection',
      },
      extractMetadata: {
        type: 'boolean',
        default: true,
        description: 'Extract document metadata',
      },
      extractStructure: {
        type: 'boolean',
        default: true,
        description: 'Extract document structure (sections, headings)',
      },
    },
    required: [],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as ParseDocumentParameters;

      // Get file path or content
      const filePath = params.filePath || (context.variables.filePath as string);
      const content = params.content || (context.variables.content as Buffer | string);
      const filename = params.filename || (context.variables.filename as string) || filePath?.split(/[/\\]/).pop();
      const mimeType = params.mimeType || (context.variables.mimeType as string);

      if (!filePath && !content) {
        return this.error('INVALID_INPUT', 'No file path or content provided', true);
      }

      // Detect format
      const format = this.detectFormat(filename, mimeType);

      if (!format) {
        return this.error('UNSUPPORTED_FORMAT', `Unable to detect document format from: ${filename || 'unknown'}`, true);
      }

      // Parse based on format
      let result: ParseDocumentResult;

      switch (format) {
        case 'pdf':
          result = await this.parsePDF(filePath, content);
          break;
        case 'docx':
          result = await this.parseDOCX(filePath, content);
          break;
        case 'txt':
        case 'md':
          result = await this.parseText(filePath, content, format);
          break;
        case 'html':
          result = await this.parseHTML(filePath, content);
          break;
        default:
          return this.error('UNSUPPORTED_FORMAT', `Format not supported: ${format}`, true);
      }

      // Extract structure if requested
      if (params.extractStructure !== false && !result.structure) {
        result.structure = this.extractStructure(result.text);
      }

      // Quality score based on content extraction
      const qualityScore = result.text.length > 100 ? 0.9 : result.text.length > 0 ? 0.7 : 0.3;

      return this.success(
        result,
        {
          format,
          textLength: result.text.length,
          wordCount: result.metadata.wordCount,
          sectionCount: result.structure?.sections.length || 0,
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('PARSE_ERROR', `Document parsing failed: ${message}`, true);
    }
  }

  /**
   * Detect document format
   */
  private detectFormat(filename?: string, mimeType?: string): string | null {
    if (mimeType) {
      const mimeMap: Record<string, string> = {
        'application/pdf': 'pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/msword': 'doc',
        'text/plain': 'txt',
        'text/markdown': 'md',
        'text/html': 'html',
      };
      if (mimeType in mimeMap) {
        return mimeMap[mimeType];
      }
    }

    if (filename) {
      const ext = filename.split('.').pop()?.toLowerCase();
      const extMap: Record<string, string> = {
        pdf: 'pdf',
        docx: 'docx',
        doc: 'doc',
        txt: 'txt',
        md: 'md',
        html: 'html',
        htm: 'html',
      };
      if (ext && ext in extMap) {
        return extMap[ext];
      }
    }

    return null;
  }

  /**
   * Parse PDF document
   */
  private async parsePDF(filePath?: string, content?: Buffer | string): Promise<ParseDocumentResult> {
    try {
      const pdfParser = await import('../../../../../services/parsers/pdf.parser');

      let result;
      if (filePath) {
        result = await pdfParser.parseFile(filePath);
      } else if (content) {
        const buffer = typeof content === 'string' ? Buffer.from(content, 'base64') : content;
        result = await pdfParser.parseBuffer(buffer);
      } else {
        throw new Error('No file path or content provided');
      }

      return {
        text: result.text || '',
        format: 'pdf',
        metadata: {
          title: result.metadata?.title,
          author: result.metadata?.author,
          pageCount: result.metadata?.pageCount,
          wordCount: this.countWords(result.text || ''),
          charCount: (result.text || '').length,
          ...result.metadata,
        },
      };
    } catch (error) {
      // Fallback: return empty result if parser fails
      return {
        text: '',
        format: 'pdf',
        metadata: {
          wordCount: 0,
          charCount: 0,
          parseError: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Parse DOCX document
   */
  private async parseDOCX(filePath?: string, content?: Buffer | string): Promise<ParseDocumentResult> {
    try {
      const docxParser = await import('../../../../../services/parsers/docx.parser');

      let result;
      if (filePath) {
        result = await docxParser.parseFile(filePath);
      } else if (content) {
        const buffer = typeof content === 'string' ? Buffer.from(content, 'base64') : content;
        result = await docxParser.parseBuffer(buffer);
      } else {
        throw new Error('No file path or content provided');
      }

      return {
        text: result.text || '',
        format: 'docx',
        metadata: {
          title: result.metadata?.title,
          author: result.metadata?.author,
          wordCount: this.countWords(result.text || ''),
          charCount: (result.text || '').length,
          ...result.metadata,
        },
        structure: result.structure,
      };
    } catch (error) {
      return {
        text: '',
        format: 'docx',
        metadata: {
          wordCount: 0,
          charCount: 0,
          parseError: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Parse plain text or markdown
   */
  private async parseText(
    filePath?: string,
    content?: Buffer | string,
    format: string = 'txt'
  ): Promise<ParseDocumentResult> {
    let text = '';

    if (typeof content === 'string') {
      // Check if it's base64
      if (/^[A-Za-z0-9+/]+=*$/.test(content) && content.length > 100) {
        text = Buffer.from(content, 'base64').toString('utf-8');
      } else {
        text = content;
      }
    } else if (content instanceof Buffer) {
      text = content.toString('utf-8');
    } else if (filePath) {
      const fs = await import('fs/promises');
      text = await fs.readFile(filePath, 'utf-8');
    }

    return {
      text,
      format,
      metadata: {
        wordCount: this.countWords(text),
        charCount: text.length,
      },
    };
  }

  /**
   * Parse HTML document
   */
  private async parseHTML(filePath?: string, content?: Buffer | string): Promise<ParseDocumentResult> {
    let html = '';

    if (typeof content === 'string') {
      if (/^[A-Za-z0-9+/]+=*$/.test(content) && content.length > 100) {
        html = Buffer.from(content, 'base64').toString('utf-8');
      } else {
        html = content;
      }
    } else if (content instanceof Buffer) {
      html = content.toString('utf-8');
    } else if (filePath) {
      const fs = await import('fs/promises');
      html = await fs.readFile(filePath, 'utf-8');
    }

    // Simple HTML to text conversion
    const text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<\/?(p|div|br|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Extract title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);

    return {
      text,
      format: 'html',
      metadata: {
        title: titleMatch?.[1],
        wordCount: this.countWords(text),
        charCount: text.length,
      },
    };
  }

  /**
   * Extract document structure from text
   */
  private extractStructure(text: string): ParseDocumentResult['structure'] {
    const sections: DocumentSection[] = [];
    const lines = text.split('\n');

    let currentOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect markdown headers
      const mdMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (mdMatch) {
        sections.push({
          title: mdMatch[2],
          level: mdMatch[1].length,
          start: currentOffset,
          end: currentOffset + line.length,
        });
      }

      // Detect numbered sections (1. Introduction, 2.1 Overview)
      const numMatch = line.match(/^(\d+(?:\.\d+)*)\s+([A-Z].+)$/);
      if (numMatch) {
        const level = numMatch[1].split('.').length;
        sections.push({
          title: numMatch[2],
          level,
          start: currentOffset,
          end: currentOffset + line.length,
        });
      }

      // Detect ALL CAPS headers
      if (/^[A-Z][A-Z\s]{10,50}$/.test(line.trim())) {
        sections.push({
          title: line.trim(),
          level: 1,
          start: currentOffset,
          end: currentOffset + line.length,
        });
      }

      currentOffset += line.length + 1; // +1 for newline
    }

    // Set end positions to start of next section
    for (let i = 0; i < sections.length - 1; i++) {
      sections[i].end = sections[i + 1].start - 1;
    }
    if (sections.length > 0) {
      sections[sections.length - 1].end = text.length;
    }

    return {
      sections,
      hasTableOfContents: text.toLowerCase().includes('table of contents') ||
                          text.toLowerCase().includes('contents'),
      hasTables: /\|.*\|.*\|/.test(text) || /<table/i.test(text),
      hasImages: /!\[.*\]\(.*\)/.test(text) || /<img/i.test(text),
    };
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }
}

export default ParseDocumentExecutor;
