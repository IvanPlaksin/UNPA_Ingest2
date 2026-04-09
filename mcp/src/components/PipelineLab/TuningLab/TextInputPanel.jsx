/**
 * @fileoverview Text Input Panel for Tuning Lab
 * @module components/PipelineLab/TuningLab/TextInputPanel
 */

import React from 'react';
import { FileText, Upload, Trash2, Sparkles } from 'lucide-react';

const SAMPLE_TEXTS = [
  {
    id: 'technical',
    label: 'Technical Architecture',
    text: 'The UN ProjectAdvisor uses Memgraph for graph storage and Qdrant for vector embeddings. Redis handles caching through BullMQ job queues. The TEI service generates embeddings that are stored in Qdrant.',
  },
  {
    id: 'un_systems',
    label: 'UN Systems',
    text: 'IMIS (Integrated Management Information System) was replaced by Umoja as the new ERP system for the United Nations Secretariat. Inspira handles recruitment and talent management. UNICEF works closely with WHO on child health initiatives.',
  },
  {
    id: 'work_items',
    label: 'Work Items',
    text: 'Work item #12345 depends on completing task #12340 first. Bug #12350 was fixed by the same developer who implemented feature #12355. The sprint includes 5 user stories and 3 bug fixes.',
  },
];

export default function TextInputPanel({ text, onTextChange, onStartExtraction, loading, disabled }) {
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onTextChange(event.target.result);
      };
      reader.readAsText(file);
    }
  };

  const handleSampleSelect = (sampleText) => {
    onTextChange(sampleText);
  };

  const charCount = text?.length || 0;
  const wordCount = text?.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-medium text-white">Input Text</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Sample texts dropdown */}
          <div className="relative group">
            <button
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm flex items-center gap-1"
              disabled={disabled}
            >
              <Sparkles className="w-4 h-4" />
              Samples
            </button>
            <div className="absolute right-0 mt-1 w-56 bg-gray-900 rounded-lg shadow-xl border border-gray-700
                          opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
              {SAMPLE_TEXTS.map((sample) => (
                <button
                  key={sample.id}
                  onClick={() => handleSampleSelect(sample.text)}
                  disabled={disabled}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700
                           first:rounded-t-lg last:rounded-b-lg disabled:opacity-50"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {/* File upload */}
          <label className={`px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300
                           text-sm flex items-center gap-1 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Upload className="w-4 h-4" />
            Upload
            <input
              type="file"
              accept=".txt,.md"
              onChange={handleFileUpload}
              disabled={disabled}
              className="hidden"
            />
          </label>

          {/* Clear button */}
          <button
            onClick={() => onTextChange('')}
            disabled={disabled || !text}
            className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300
                     disabled:opacity-50 disabled:cursor-not-allowed"
            title="Clear text"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Text area */}
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        disabled={disabled}
        placeholder="Enter or paste text for entity and relationship extraction...

You can also:
• Use sample texts from the 'Samples' dropdown
• Upload a .txt or .md file"
        className="w-full h-48 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg
                 text-gray-200 placeholder-gray-500 resize-none
                 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500
                 disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {/* Footer with stats and action */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {charCount > 0 ? (
            <span>{wordCount} words • {charCount} characters</span>
          ) : (
            <span>No text entered</span>
          )}
        </div>
        <button
          onClick={onStartExtraction}
          disabled={disabled || loading || !text?.trim()}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium
                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                   flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Extract & Evaluate
            </>
          )}
        </button>
      </div>
    </div>
  );
}
