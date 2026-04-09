/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VOTE COLLECTOR
 * Collects and resolves votes for QUORUM/VOTE resolution modes.
 * Supports 4 resolution strategies and 4 tie-break strategies.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { ResolutionMode, VoteResolutionStrategy, TieBreakStrategy } = require('./signal-constants');

// ────────────────────────────────────────────────────────────────────────────
// VOTE COLLECTOR
// ────────────────────────────────────────────────────────────────────────────

class VoteCollector {
  /**
   * Record a vote and check if resolution is reached.
   *
   * @param {object} contract - AsyncSignalContract
   * @param {object[]} existingVotes - Already recorded votes
   * @param {object} newVote - New vote { actorId, vote, confidence?, reasoning? }
   * @returns {{ recorded: boolean, resolved: boolean, result?: object, votes: object[] }}
   */
  recordVote(contract, existingVotes, newVote) {
    const votes = [...existingVotes];
    const policy = contract.resolutionPolicy;

    // Check for duplicate vote
    if (votes.some(v => v.actorId === newVote.actorId)) {
      return { recorded: false, resolved: false, votes, error: 'Duplicate vote from actor' };
    }

    // Check if actor is authorized participant
    if (policy.participants.length > 0) {
      const isAuthorized = policy.participants.some(p => p.refId === newVote.actorId);
      if (!isAuthorized && policy.mode !== ResolutionMode.FORCE) {
        return { recorded: false, resolved: false, votes, error: 'Actor not authorized to vote' };
      }
    }

    votes.push({
      ...newVote,
      timestamp: new Date().toISOString(),
    });

    // Check if resolution criteria met
    const resolved = this._isResolved(contract, votes);

    if (resolved) {
      const result = this.resolve(contract, votes);
      return { recorded: true, resolved: true, result, votes };
    }

    return { recorded: true, resolved: false, votes };
  }

  /**
   * Resolve votes according to resolution strategy.
   *
   * @param {object} contract - AsyncSignalContract
   * @param {object[]} votes - All collected votes
   * @returns {{ winner: *, tally: object, method: string }}
   */
  resolve(contract, votes) {
    const policy = contract.resolutionPolicy;
    const strategy = policy.resolutionStrategy || VoteResolutionStrategy.MAJORITY;

    switch (strategy) {
      case VoteResolutionStrategy.MAJORITY:
        return this._resolveMajority(policy, votes);
      case VoteResolutionStrategy.WEIGHTED:
        return this._resolveWeighted(policy, votes);
      case VoteResolutionStrategy.UNANIMOUS:
        return this._resolveUnanimous(policy, votes);
      case VoteResolutionStrategy.CONDORCET:
        return this._resolveCondorcet(policy, votes);
      default:
        return this._resolveMajority(policy, votes);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESOLUTION STRATEGIES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * MAJORITY: most votes wins.
   */
  _resolveMajority(policy, votes) {
    const tally = this._countVotes(votes);
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
      return { winner: null, tally, method: 'MAJORITY' };
    }

    // Check for tie
    if (sorted.length >= 2 && sorted[0][1] === sorted[1][1]) {
      return this._handleTie(policy, sorted, tally);
    }

    return { winner: sorted[0][0], tally, method: 'MAJORITY' };
  }

  /**
   * WEIGHTED: sum participant weights per vote option.
   */
  _resolveWeighted(policy, votes) {
    const weightMap = {};
    for (const p of policy.participants) {
      weightMap[p.refId] = p.weight || 1.0;
    }

    const tally = {};
    for (const v of votes) {
      const weight = weightMap[v.actorId] || 1.0;
      const voteValue = String(v.vote);
      tally[voteValue] = (tally[voteValue] || 0) + weight;
    }

    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
      return { winner: null, tally, method: 'WEIGHTED' };
    }

    if (sorted.length >= 2 && Math.abs(sorted[0][1] - sorted[1][1]) < 0.001) {
      return this._handleTie(policy, sorted, tally);
    }

    return { winner: sorted[0][0], tally, method: 'WEIGHTED' };
  }

  /**
   * UNANIMOUS: all must agree.
   */
  _resolveUnanimous(policy, votes) {
    const tally = this._countVotes(votes);
    const options = Object.keys(tally);

    if (options.length === 1) {
      return { winner: options[0], tally, method: 'UNANIMOUS', unanimous: true };
    }

    // Not unanimous
    return { winner: null, tally, method: 'UNANIMOUS', unanimous: false };
  }

  /**
   * CONDORCET: pairwise comparison (simplified — head-to-head majority).
   * Full Condorcet requires ranked ballots; this is a simplified version
   * using simple vote values where the option that beats all others wins.
   */
  _resolveCondorcet(policy, votes) {
    const tally = this._countVotes(votes);
    const options = Object.keys(tally);

    if (options.length <= 1) {
      return { winner: options[0] || null, tally, method: 'CONDORCET' };
    }

    // Simplified: treat as majority when we only have simple votes
    // Full Condorcet would require ranked preferences
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);

    if (sorted.length >= 2 && sorted[0][1] === sorted[1][1]) {
      return this._handleTie(policy, sorted, tally);
    }

    return { winner: sorted[0][0], tally, method: 'CONDORCET' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIE BREAKING
  // ══════════════════════════════════════════════════════════════════════════

  _handleTie(policy, sorted, tally) {
    const tieBreak = policy.tieBreak || TieBreakStrategy.ESCALATE;
    const tiedOptions = sorted.filter(([, count]) => count === sorted[0][1]).map(([opt]) => opt);

    switch (tieBreak) {
      case TieBreakStrategy.ESCALATE:
        return { winner: null, tally, method: 'TIE_ESCALATED', tie: true, tiedOptions };

      case TieBreakStrategy.ABSTAIN:
        return { winner: null, tally, method: 'TIE_ABSTAINED', tie: true, tiedOptions };

      case TieBreakStrategy.RANDOM:
        const randomIdx = Math.floor(Math.random() * tiedOptions.length);
        return { winner: tiedOptions[randomIdx], tally, method: 'TIE_RANDOM', tie: true, tiedOptions };

      case TieBreakStrategy.TIMEOUT_DEFAULT:
        // Use first vote option as default
        return { winner: tiedOptions[0], tally, method: 'TIE_TIMEOUT_DEFAULT', tie: true, tiedOptions };

      default:
        return { winner: null, tally, method: 'TIE_ESCALATED', tie: true, tiedOptions };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  _countVotes(votes) {
    const tally = {};
    for (const v of votes) {
      const voteValue = String(v.vote);
      tally[voteValue] = (tally[voteValue] || 0) + 1;
    }
    return tally;
  }

  _isResolved(contract, votes) {
    const policy = contract.resolutionPolicy;
    const { mode, quorumRequired, participants } = policy;

    switch (mode) {
      case ResolutionMode.SINGLE:
        return votes.length >= 1;
      case ResolutionMode.FORCE:
        return votes.length >= 1;
      case ResolutionMode.QUORUM:
        return votes.length >= (quorumRequired || Math.ceil(participants.length / 2));
      case ResolutionMode.VOTE:
        return votes.length >= participants.length;
      default:
        return votes.length >= 1;
    }
  }
}

module.exports = { VoteCollector };
