import { Layers, Share2, GitMerge, Target } from 'lucide-react';

export const VIEW_MODES = [
    {
        id: 'stratified',
        label: 'STRATIFIED',
        description: 'Architectural Layers (Z-Axis). Separates Work Items, Parents, and Artifacts.',
        icon: Layers,
        tooltip: 'Business / Tasks / Code'
    },
    {
        id: 'force_cluster',
        label: 'FORCE CLUSTER',
        description: 'Natural organic grouping based on connections.',
        icon: Share2,
        tooltip: 'Standard Graph'
    },
    {
        id: 'TRACEABILITY_DAG',
        label: 'TRACEABILITY FLOW',
        description: '2.5D Oriented Graph. DAG Layout on Y-Axis, Functional Layers on Z-Axis.',
        icon: GitMerge,
        tooltip: 'DAG + Multi-Layer'
    },
    {
        id: 'dependency_tree',
        label: 'DEPENDENCY TREE',
        description: 'Hierarchical DAG (Directed Acyclic Graph) showing parent-child flow.',
        icon: GitMerge,
        tooltip: 'Vertical Hierarchy'
    },
    {
        id: 'radial_context',
        label: 'RADIAL CONTEXT',
        description: 'Circular arrangement focusing on the root item.',
        icon: Target,
        tooltip: 'Focus on Center'
    },
    {
        id: 'BLOCK_HIERARCHY',
        label: 'BLOCK HIERARCHY',
        description: 'Classic Org-Chart style blocks with details.',
        icon: Layers, // Placeholder, will fix import
        tooltip: 'Detailed Blocks'
    },
    {
        id: 'BLOCK_HIERARCHY_2D',
        label: 'BLOCK HIERARCHY 2D',
        description: 'Classic Org-Chart style blocks with details.',
        icon: Layers, // Placeholder, will fix import
        tooltip: 'Detailed Blocks'
    }
];

export const LAYERS = {
    BUSINESS: { z: 200, label: 'Business (Epics/Features)' },
    TASKS: { z: 0, label: 'Execution (Tasks/Bugs)' },
    CODE: { z: -200, label: 'Artifacts (Files/Commits)' }
};

export const DEFAULT_SETTINGS = {
    activeView: 'stratified',
    physics: {
        gravity: -100, // Negative charge
        linkDistance: 50,
        dagLevelDistance: 60
    },
    vis: {
        showFiles: true,
        showLinks: true,
        showLabels: true
    }
};
