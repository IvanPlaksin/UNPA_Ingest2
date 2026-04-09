import React from 'react';
import ModeSelector from './ModeSelector';

const NexusHeader = ({ namespace }) => {
  return (
    <div className="nexus-header">
      <div className="nexus-header__top">
        <div className="nexus-header__brand">
          <span className="nexus-header__logo">◈</span>
          <div className="nexus-header__titles">
            <h1 className="nexus-header__title">NEXUS</h1>
            <span className="nexus-header__subtitle">Graph Intelligence</span>
          </div>
        </div>

        <div className="nexus-header__actions">
          <span className="nexus-header__namespace" title="Current namespace">
            {namespace}
          </span>
        </div>
      </div>

      <ModeSelector />
    </div>
  );
};

export default NexusHeader;
