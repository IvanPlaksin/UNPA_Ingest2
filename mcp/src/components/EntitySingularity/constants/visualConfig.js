export const NODE_VISUAL_CONFIG = {
    ACTOR:        { shape: 'icosahedron', size: 8,  color: 0x00ff88 },
    ORGANIZATION: { shape: 'icosahedron', size: 10, color: 0x00ffcc },
    POLICY:       { shape: 'octahedron',  size: 8,  color: 0xff6600 },
    PROCESS:      { shape: 'octahedron',  size: 7,  color: 0xffaa00 },
    DOCUMENT:     { shape: 'box',         size: 7,  color: 0x00aaff },
    DOCUMENTREF:  { shape: 'box',         size: 6,  color: 0x0077cc },
    SYSTEM:       { shape: 'cylinder',    size: 8,  color: 0xff00ff },
    TECHNOLOGY:   { shape: 'cylinder',    size: 6,  color: 0xcc00ff },
    CONCEPT:      { shape: 'sphere',      size: 6,  color: 0xffff00 },
    LOCATION:     { shape: 'tetrahedron', size: 7,  color: 0x00ffff },
    EVENT:        { shape: 'tetrahedron', size: 6,  color: 0xff0066 },
    RESOURCE:     { shape: 'box',         size: 5,  color: 0x66ff00 },
    METRIC:       { shape: 'sphere',      size: 5,  color: 0xffffff },
    PERSON:       { shape: 'sphere',      size: 7,  color: 0x22c55e },
    WORK_ITEM:    { shape: 'box',         size: 5,  color: 0x6b7280 },
    default:      { shape: 'sphere',      size: 6,  color: 0x888888 },
};

export const SCENE_CONFIG = {
    background: 0x050510,
    fog: { color: 0x050510, near: 800, far: 4000 },
    ambientLight: { intensity: 0.6 },
    pointLight: { intensity: 1.0, position: [100, 100, 100] },
};

export const BLOOM_CONFIG = {
    intensity: 1.2,
    luminanceThreshold: 0.1,
    luminanceSmoothing: 0.9,
};

// Z-positions for stratified layout (by canonical type)
export const LAYER_Z = {
    POLICY: 400, ORGANIZATION: 300, ACTOR: 300,
    PERSON: 200, PROCESS: 100, EVENT: 100,
    CONCEPT: 0, TECHNOLOGY: -100, SYSTEM: -100,
    DOCUMENT: -200, DOCUMENTREF: -200, WORK_ITEM: -300,
};
