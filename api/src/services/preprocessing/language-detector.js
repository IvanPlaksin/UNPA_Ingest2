/**
 * Language Detector Service
 *
 * Detects the language of text using multiple methods:
 * - Unicode script analysis
 * - Common word matching
 * - Character frequency analysis
 *
 * Optimized for UN official languages (Arabic, Chinese, English, French, Russian, Spanish)
 * plus common programming/technical content detection.
 *
 * @module services/preprocessing/language-detector
 */

/**
 * UN Official Languages
 */
const UN_LANGUAGES = {
  ar: { name: 'Arabic', nativeName: 'العربية', script: 'Arabic' },
  zh: { name: 'Chinese', nativeName: '中文', script: 'Han' },
  en: { name: 'English', nativeName: 'English', script: 'Latin' },
  fr: { name: 'French', nativeName: 'Français', script: 'Latin' },
  ru: { name: 'Russian', nativeName: 'Русский', script: 'Cyrillic' },
  es: { name: 'Spanish', nativeName: 'Español', script: 'Latin' }
};

/**
 * Common words by language for quick detection
 */
const COMMON_WORDS = {
  en: new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
    'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
    'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
    'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
    'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
    'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
    'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us'
  ]),
  fr: new Set([
    'le', 'la', 'les', 'un', 'une', 'de', 'du', 'des', 'et', 'est',
    'en', 'que', 'qui', 'dans', 'ce', 'il', 'ne', 'sur', 'se', 'pas',
    'plus', 'par', 'pour', 'son', 'avec', 'tout', 'mais', 'nous', 'ou', 'sa',
    'lui', 'cette', 'ils', 'elle', 'ont', 'été', 'être', 'fait', 'si', 'bien',
    'au', 'aux', 'ces', 'leur', 'même', 'faire', 'sans', 'peut', 'comme', 'tous',
    'très', 'aussi', 'dont', 'où', 'alors', 'encore', 'après', 'donc', 'notre', 'autre'
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'en',
    'que', 'es', 'por', 'con', 'no', 'para', 'se', 'al', 'lo', 'como',
    'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'si', 'porque', 'esta',
    'entre', 'cuando', 'muy', 'sin', 'sobre', 'ser', 'tiene', 'también', 'me', 'hasta',
    'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les',
    'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto', 'mi'
  ]),
  ru: new Set([
    'и', 'в', 'не', 'на', 'я', 'что', 'он', 'с', 'как', 'а',
    'то', 'все', 'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у',
    'же', 'вы', 'за', 'бы', 'по', 'только', 'её', 'мне', 'было', 'вот',
    'от', 'меня', 'ещё', 'нет', 'о', 'из', 'ему', 'теперь', 'когда', 'даже',
    'ну', 'вдруг', 'ли', 'если', 'уже', 'или', 'ни', 'быть', 'был', 'него',
    'до', 'вас', 'нибудь', 'опять', 'уж', 'вам', 'ведь', 'там', 'потом', 'себя'
  ]),
  de: new Set([
    'der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich',
    'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als',
    'auch', 'es', 'an', 'werden', 'aus', 'er', 'hat', 'dass', 'sie', 'nach',
    'wird', 'bei', 'einer', 'um', 'am', 'sind', 'noch', 'wie', 'einem', 'über'
  ]),
  pt: new Set([
    'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para',
    'é', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais',
    'as', 'dos', 'como', 'mas', 'foi', 'ao', 'ele', 'das', 'tem', 'à',
    'seu', 'sua', 'ou', 'ser', 'quando', 'muito', 'há', 'nos', 'já', 'está'
  ]),
  it: new Set([
    'di', 'che', 'e', 'il', 'la', 'a', 'è', 'per', 'in', 'un',
    'non', 'sono', 'da', 'una', 'del', 'le', 'con', 'si', 'come', 'ha',
    'lo', 'i', 'ma', 'al', 'dei', 'nel', 'della', 'questo', 'anche', 'più',
    'se', 'alla', 'o', 'era', 'io', 'degli', 'tutti', 'essere', 'dal', 'suo'
  ])
};

/**
 * Unicode script ranges for detection
 * IMPORTANT: Order matters - more specific scripts should be checked first
 * Latin is checked last as it's the fallback for many alphabetic scripts
 */
const SCRIPT_RANGES_ORDERED = [
  ['Arabic', /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/],
  ['Han', /[\u4E00-\u9FFF\u3400-\u4DBF]/],
  ['Cyrillic', /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/],
  ['Hebrew', /[\u0590-\u05FF\uFB1D-\uFB4F]/],
  ['Japanese', /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF]/],
  ['Korean', /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F]/],
  ['Greek', /[\u0370-\u03FF\u1F00-\u1FFF]/],
  ['Thai', /[\u0E00-\u0E7F]/],
  ['Devanagari', /[\u0900-\u097F]/],
  ['Latin', /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/]
];

// Keep SCRIPT_RANGES for backward compatibility
const SCRIPT_RANGES = Object.fromEntries(SCRIPT_RANGES_ORDERED);

/**
 * Code/Technical content indicators
 */
const CODE_INDICATORS = {
  patterns: [
    /\b(function|const|let|var|class|interface|import|export|return|if|else|for|while)\b/,
    /\b(public|private|protected|static|async|await|void|null|undefined|true|false)\b/,
    /[{}\[\]();]/,
    /=>/,
    /\.(js|ts|jsx|tsx|py|java|cs|cpp|sql)$/i,
    /\/\*[\s\S]*?\*\//,
    /\/\/.+$/m
  ],
  threshold: 0.15 // 15% of text should be code-like to classify as code
};

/**
 * Language detection result
 * @typedef {Object} DetectionResult
 * @property {string} language - ISO 639-1 language code
 * @property {string} name - Language name
 * @property {number} confidence - Confidence score (0-1)
 * @property {string} script - Detected script
 * @property {boolean} isCode - Whether text appears to be code
 * @property {Object} scores - Scores for all detected languages
 */

/**
 * LanguageDetector class
 */
class LanguageDetector {
  /**
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      minTextLength: 20,
      defaultLanguage: 'en',
      detectCode: true,
      ...options
    };
  }

  /**
   * Detect language of text
   * @param {string} text - Input text
   * @returns {DetectionResult} Detection result
   */
  detect(text) {
    if (!text || typeof text !== 'string') {
      return this._defaultResult();
    }

    const cleanedText = this._cleanText(text);

    if (cleanedText.length < this.options.minTextLength) {
      return this._defaultResult();
    }

    // Check for code content first
    const isCode = this.options.detectCode && this._isCodeContent(cleanedText);
    if (isCode) {
      return {
        language: 'code',
        name: 'Programming Code',
        confidence: 0.9,
        script: 'Mixed',
        isCode: true,
        scores: { code: 0.9 }
      };
    }

    // Detect script first
    const scriptResult = this._detectScript(cleanedText);

    // If non-Latin script detected with high confidence, use script-based detection
    if (scriptResult.script !== 'Latin' && scriptResult.confidence > 0.3) {
      return this._scriptBasedDetection(cleanedText, scriptResult);
    }

    // For Latin scripts, use word-based detection
    return this._wordBasedDetection(cleanedText, scriptResult);
  }

  /**
   * Detect language with detailed analysis
   * @param {string} text - Input text
   * @returns {Object} Detailed detection with all scores
   */
  detectDetailed(text) {
    const result = this.detect(text);
    const cleanedText = this._cleanText(text);

    return {
      ...result,
      analysis: {
        textLength: cleanedText.length,
        wordCount: cleanedText.split(/\s+/).length,
        scriptDistribution: this._getScriptDistribution(cleanedText),
        wordMatches: this._getWordMatches(cleanedText)
      }
    };
  }

  /**
   * Detect multiple languages in text (for multilingual content)
   * @param {string} text - Input text
   * @returns {Array} Array of detected languages with positions
   */
  detectMultiple(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const sentences = text.split(/[.!?。！？\n]+/).filter(s => s.trim().length > 10);
    const detections = [];

    for (const sentence of sentences) {
      const result = this.detect(sentence);
      if (result.confidence > 0.5) {
        detections.push({
          text: sentence.trim().substring(0, 100),
          language: result.language,
          confidence: result.confidence
        });
      }
    }

    // Aggregate results
    const languageCounts = {};
    for (const d of detections) {
      if (!languageCounts[d.language]) {
        languageCounts[d.language] = { count: 0, totalConfidence: 0 };
      }
      languageCounts[d.language].count++;
      languageCounts[d.language].totalConfidence += d.confidence;
    }

    return Object.entries(languageCounts)
      .map(([lang, data]) => ({
        language: lang,
        segments: data.count,
        avgConfidence: data.totalConfidence / data.count
      }))
      .sort((a, b) => b.segments - a.segments);
  }

  // ===== Private Methods =====

  /**
   * Clean text for analysis
   * @private
   */
  _cleanText(text) {
    // Remove URLs
    let cleaned = text.replace(/https?:\/\/[^\s]+/g, '');
    // Remove email addresses
    cleaned = cleaned.replace(/[^\s]+@[^\s]+\.[^\s]+/g, '');
    // Remove numbers (keep for code detection)
    // cleaned = cleaned.replace(/\d+/g, '');
    return cleaned.trim();
  }

  /**
   * Check if text is primarily code
   * @private
   */
  _isCodeContent(text) {
    let codeIndicators = 0;
    const totalLength = text.length;

    for (const pattern of CODE_INDICATORS.patterns) {
      const matches = text.match(pattern);
      if (matches) {
        codeIndicators += matches.join('').length;
      }
    }

    // Check bracket ratio
    const brackets = (text.match(/[{}\[\]()]/g) || []).length;
    const bracketRatio = brackets / totalLength;

    return (codeIndicators / totalLength > CODE_INDICATORS.threshold) ||
           (bracketRatio > 0.05);
  }

  /**
   * Detect script from text
   * @private
   */
  _detectScript(text) {
    const counts = {};
    let total = 0;

    for (const char of text) {
      // Use ordered array for consistent script detection
      for (const [script, pattern] of SCRIPT_RANGES_ORDERED) {
        if (pattern.test(char)) {
          counts[script] = (counts[script] || 0) + 1;
          total++;
          break;
        }
      }
    }

    if (total === 0) {
      return { script: 'Unknown', confidence: 0 };
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const topScript = sorted[0];

    return {
      script: topScript[0],
      confidence: topScript[1] / total,
      distribution: counts
    };
  }

  /**
   * Get script distribution
   * @private
   */
  _getScriptDistribution(text) {
    const result = this._detectScript(text);
    return result.distribution || {};
  }

  /**
   * Script-based language detection
   * @private
   */
  _scriptBasedDetection(text, scriptResult) {
    const scriptToLanguage = {
      Arabic: { code: 'ar', name: 'Arabic' },
      Han: { code: 'zh', name: 'Chinese' },
      Cyrillic: { code: 'ru', name: 'Russian' },
      Hebrew: { code: 'he', name: 'Hebrew' },
      Japanese: { code: 'ja', name: 'Japanese' },
      Korean: { code: 'ko', name: 'Korean' },
      Greek: { code: 'el', name: 'Greek' },
      Thai: { code: 'th', name: 'Thai' },
      Devanagari: { code: 'hi', name: 'Hindi' }
    };

    const langInfo = scriptToLanguage[scriptResult.script];
    if (langInfo) {
      return {
        language: langInfo.code,
        name: langInfo.name,
        confidence: scriptResult.confidence,
        script: scriptResult.script,
        isCode: false,
        scores: { [langInfo.code]: scriptResult.confidence }
      };
    }

    return this._wordBasedDetection(text, scriptResult);
  }

  /**
   * Word-based language detection for Latin scripts
   * @private
   */
  _wordBasedDetection(text, scriptResult) {
    const words = text.toLowerCase().split(/\s+/);
    const scores = {};

    for (const [lang, wordSet] of Object.entries(COMMON_WORDS)) {
      let matches = 0;
      for (const word of words) {
        if (wordSet.has(word)) {
          matches++;
        }
      }
      scores[lang] = words.length > 0 ? matches / words.length : 0;
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topLang = sorted[0];

    if (topLang[1] < 0.05) {
      return this._defaultResult();
    }

    const langInfo = UN_LANGUAGES[topLang[0]] || { name: topLang[0] };

    return {
      language: topLang[0],
      name: langInfo.name || topLang[0],
      confidence: Math.min(topLang[1] * 3, 0.95), // Scale confidence
      script: scriptResult.script,
      isCode: false,
      scores
    };
  }

  /**
   * Get word matches for each language
   * @private
   */
  _getWordMatches(text) {
    const words = text.toLowerCase().split(/\s+/);
    const matches = {};

    for (const [lang, wordSet] of Object.entries(COMMON_WORDS)) {
      matches[lang] = words.filter(w => wordSet.has(w));
    }

    return matches;
  }

  /**
   * Return default result
   * @private
   */
  _defaultResult() {
    return {
      language: this.options.defaultLanguage,
      name: UN_LANGUAGES[this.options.defaultLanguage]?.name || 'English',
      confidence: 0.1,
      script: 'Unknown',
      isCode: false,
      scores: {}
    };
  }
}

/**
 * Create a language detector instance
 * @param {Object} options - Configuration options
 * @returns {LanguageDetector} Detector instance
 */
function createDetector(options = {}) {
  return new LanguageDetector(options);
}

/**
 * Default detector instance
 */
const defaultDetector = new LanguageDetector();

/**
 * Quick detect function
 * @param {string} text - Input text
 * @returns {DetectionResult} Detection result
 */
function detectLanguage(text) {
  return defaultDetector.detect(text);
}

/**
 * Check if text is a UN official language
 * @param {string} langCode - Language code
 * @returns {boolean} True if UN official language
 */
function isUNLanguage(langCode) {
  return langCode in UN_LANGUAGES;
}

/**
 * Get UN language info
 * @param {string} langCode - Language code
 * @returns {Object|null} Language info or null
 */
function getUNLanguageInfo(langCode) {
  return UN_LANGUAGES[langCode] || null;
}

module.exports = {
  LanguageDetector,
  createDetector,
  detectLanguage,
  isUNLanguage,
  getUNLanguageInfo,
  UN_LANGUAGES,
  COMMON_WORDS,
  SCRIPT_RANGES
};
