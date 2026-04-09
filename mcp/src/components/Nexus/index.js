/**
 * NEXUS - Graph Intelligence Hub
 */

// Store
export { useNexusStore } from '../../stores/nexusStore';

// Main component
export { default as Nexus } from './Nexus';

// Header components
export { default as NexusHeader } from './Header/NexusHeader';
export { default as ModeSelector } from './Header/ModeSelector';


// Insights
export { default as InsightsBar } from './Insights/InsightsBar';
export { default as InsightCard } from './Insights/InsightCard';
export { useInsights } from './Insights/useInsights';

// Guided Mode
export { default as GuidedMode } from './Modes/GuidedMode/GuidedMode';
export { default as PipelineProgress } from './Modes/GuidedMode/PipelineProgress';
export { default as PhaseUnderstand } from './Modes/GuidedMode/PhaseUnderstand';
export { default as PhaseDiscover } from './Modes/GuidedMode/PhaseDiscover';
export { default as StrategySelector } from './Modes/GuidedMode/StrategySelector';
export { default as ClusterCard } from './Modes/GuidedMode/ClusterCard';
export { default as PhaseEvaluate } from './Modes/GuidedMode/PhaseEvaluate';
export { default as EvaluationCard } from './Modes/GuidedMode/EvaluationCard';
export { default as PhaseAct } from './Modes/GuidedMode/PhaseAct';
export { default as ActionCard } from './Modes/GuidedMode/ActionCard';
export { default as ExecutionLog } from './Modes/GuidedMode/ExecutionLog';
export { default as ResultSummary } from './Modes/GuidedMode/ResultSummary';
export { useGuidedAnalysis } from './Modes/GuidedMode/useGuidedAnalysis';

// Explore Mode
export { default as ExploreMode } from './Modes/ExploreMode/ExploreMode';
export { default as ExploreToolbar } from './Modes/ExploreMode/ExploreToolbar';
export { default as FilterBar } from './Modes/ExploreMode/FilterBar';
export { default as NodeList } from './Modes/ExploreMode/NodeList';
export { default as NodeListItem } from './Modes/ExploreMode/NodeListItem';

// Inspector
export { default as NodeInspector } from './Inspector/NodeInspector';
export { default as InspectorHeader } from './Inspector/InspectorHeader';
export { default as PropertiesTab } from './Inspector/PropertiesTab';
export { default as ConnectionsTab } from './Inspector/ConnectionsTab';
export { default as ConnectionItem } from './Inspector/ConnectionItem';
export { default as ActionsTab } from './Inspector/ActionsTab';

// Path Finder
export { default as PathFinderPanel } from './PathFinder/PathFinderPanel';
export { default as NodeSelector } from './PathFinder/NodeSelector';
export { default as PathOptions } from './PathFinder/PathOptions';
export { default as PathResult } from './PathFinder/PathResult';
export { default as PathList } from './PathFinder/PathList';

// Search
export { default as SearchPanel } from './Search/SearchPanel';
export { default as SearchInput } from './Search/SearchInput';
export { default as SearchModeSelector } from './Search/SearchModeSelector';
export { default as SearchFilters } from './Search/SearchFilters';
export { default as SearchResult } from './Search/SearchResult';
export { default as SearchResults } from './Search/SearchResults';


// Session
export { default as SessionPanel } from './Session/SessionPanel';
export { default as SessionStep } from './Session/SessionStep';
export { useSession } from './Session/useSession';
export * from './Session/SessionTracker';


// AI Assistant
export { default as AssistantPanel } from './Assistant/AssistantPanel';
export { default as ContextBar } from './Assistant/ContextBar';
export { default as ChatMessage } from './Assistant/ChatMessage';
export { default as ChatInput } from './Assistant/ChatInput';
export { default as QuickActions } from './Assistant/QuickActions';
export { useAssistant } from './Assistant/useAssistant';

// GNN Predictions
export { default as GNNPredictionsPanel } from './GNN/GNNPredictionsPanel';
export { default as GNNStatus } from './GNN/GNNStatus';
export { default as PredictionSettings } from './GNN/PredictionSettings';
export { default as PredictionResult } from './GNN/PredictionResult';
export { default as PredictionsList } from './GNN/PredictionsList';
export { useGNNPredictions } from './GNN/useGNNPredictions';

// Keyboard Shortcuts
export { default as KeyboardShortcuts } from './Keyboard/KeyboardShortcuts';
export { default as Cheatsheet } from './Keyboard/Cheatsheet';
export * from './Keyboard/shortcutDefinitions';

// Hooks
export { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

export const NEXUS_VERSION = '1.0.0-alpha';
