import React, { useState, useRef, useEffect } from 'react';

/**
 * Search input with debounce and keyboard support
 */
const SearchInput = ({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder = 'Search nodes, content, relationships...',
  disabled = false,
  autoFocus = false,
}) => {
  const [localValue, setLocalValue] = useState(value || '');
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onChange?.(newValue);
    }, 300);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      onChange?.(localValue);
      onSubmit?.(localValue);
    } else if (e.key === 'Escape') {
      setLocalValue('');
      onChange?.('');
      onClear?.();
    }
  };

  const handleClear = () => {
    setLocalValue('');
    onChange?.('');
    onClear?.();
    inputRef.current?.focus();
  };

  return (
    <div className={`search-input ${disabled ? 'search-input--disabled' : ''}`}>
      <span className="search-input__icon">🔍</span>

      <input
        ref={inputRef}
        type="text"
        className="search-input__field"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
      />

      {localValue && (
        <button
          className="search-input__clear"
          onClick={handleClear}
          disabled={disabled}
          title="Clear (Esc)"
        >
          ✕
        </button>
      )}

      <button
        className="search-input__submit"
        onClick={() => onSubmit?.(localValue)}
        disabled={disabled || !localValue}
        title="Search (Enter)"
      >
        ⏎
      </button>
    </div>
  );
};

export default SearchInput;
