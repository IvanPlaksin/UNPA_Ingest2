'use strict';

class VlmProvider {
  async recognize(_inputPath, _opts) {
    // VLM stub — returns escalation signal rather than throwing
    return {
      searchablePdf:  null,
      text:           '',
      blocks:         [],
      confidence:     0,
      engine:         'vlm',
      engineVersion:  'stub',
      profile:        'heavy',
      langsDetected:  [],
      pagesProcessed: 0,
      escalationPending: true,
      escalationReason: 'VLM profile not yet available — document queued for manual review',
    };
  }
}

module.exports = { VlmProvider };
