import React from 'react';
import SearchResult from './SearchResult';

/**
 * Search results list
 */
const SearchResults = ({
  results,
  loading,
  error,
  query,
  onResultClick,
  onResultNavigate,
}) => {
  if (loading) {
    return (
      <div className="search-results search-results--loading">
        <span className="search-results__spinner">⟳</span>
        <span className="search-results__loading-text">Searching...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="search-results search-results--error">
        <span className="search-results__error-icon">⚠️</span>
        <span className="search-results__error-text">{error}</span>
      </div>
    );
  }

  if (!query) {
    return (
      <div className="search-results search-results--empty">
        <span className="search-results__empty-icon">🔍</span>
        <span className="search-results__empty-text">
          Enter a search query to find nodes
        </span>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="search-results search-results--no-results">
        <span className="search-results__no-results-icon">🤷</span>
        <span className="search-results__no-results-text">
          No results for "{query}"
        </span>
      </div>
    );
  }

  return (
    <div className="search-results">
      <div className="search-results__header">
        <span className="search-results__count">
          {results.length} result{results.length !== 1 ? 's' : ''}
        </span>
        <span className="search-results__query">for "{query}"</span>
      </div>

      <div className="search-results__list">
        {results.map((result, index) => (
          <SearchResult
            key={result.node?.id || index}
            result={result}
            onClick={onResultClick}
            onNavigate={onResultNavigate}
          />
        ))}
      </div>
    </div>
  );
};

export default SearchResults;
