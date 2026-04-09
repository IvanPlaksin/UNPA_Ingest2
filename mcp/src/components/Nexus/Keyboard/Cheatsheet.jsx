import React from 'react';
import {
  SHORTCUT_CATEGORIES,
  getShortcutsByCategory,
  getDisplayKey,
} from './shortcutDefinitions';

/**
 * Keyboard shortcuts cheatsheet overlay
 */
const Cheatsheet = ({ onClose }) => {
  const categories = [
    { id: SHORTCUT_CATEGORIES.GLOBAL, name: 'Global' },
    { id: SHORTCUT_CATEGORIES.CANVAS, name: 'Canvas' },
    { id: SHORTCUT_CATEGORIES.GUIDED, name: 'Guided Mode' },
  ];

  return (
    <div className="cheatsheet-overlay" onClick={onClose}>
      <div className="cheatsheet" onClick={e => e.stopPropagation()}>
        <div className="cheatsheet__header">
          <h2 className="cheatsheet__title">Keyboard Shortcuts</h2>
          <button className="cheatsheet__close" onClick={onClose}>
            {'\u2715'}
          </button>
        </div>

        <div className="cheatsheet__content">
          {categories.map(category => {
            const shortcuts = getShortcutsByCategory(category.id);
            if (shortcuts.length === 0) return null;

            return (
              <div key={category.id} className="cheatsheet__category">
                <h3 className="cheatsheet__category-title">{category.name}</h3>
                <div className="cheatsheet__shortcuts">
                  {shortcuts.map(shortcut => (
                    <div key={shortcut.id} className="cheatsheet__shortcut">
                      <kbd className="cheatsheet__key">{getDisplayKey(shortcut)}</kbd>
                      <span className="cheatsheet__description">{shortcut.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="cheatsheet__footer">
          Press <kbd>?</kbd> or <kbd>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
};

export default Cheatsheet;
