import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Safe markdown renderer for assistant messages (F5).
 * react-markdown does NOT render raw HTML by default (XSS-safe). GFM adds
 * tables / strikethrough / task lists. Links open in a new tab with noopener.
 */
const COMPONENTS = {
  a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
  // react-markdown v10 removed the `inline` prop; detect inline via the absence
  // of a language- className and of newlines (block code lives inside <pre>).
  code: ({ node, className, children, ...props }) => {
    const isInline = !/^language-/.test(className || '') && !String(children).includes('\n');
    return isInline
      ? <code className="fdv2-md-code-inline" {...props}>{children}</code>
      : <code className={className} {...props}>{children}</code>;
  },
  table: ({ node, ...props }) => (
    <div className="fdv2-md-table-wrap"><table {...props} /></div>
  ),
};

export default function MarkdownText({ children }) {
  return (
    <div className="fdv2-md">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children || ''}
      </Markdown>
    </div>
  );
}
