// KnowledgeGraph3D.jsx - 3D визуализация графа знаний в стиле Knowledge Planes

import React, { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { RotateCcw, Camera, Download, Eye, EyeOff } from 'lucide-react';

// Координаты Z для слоёв (Knowledge Planes)
const LAYER_Z = {
  Strategic: 200,
  Business: 0,
  Code: -200
};

// Цвета слоёв
const LAYER_COLORS = {
  Strategic: '#FF6B9D',
  Business: '#00D4FF',
  Code: '#7B61FF'
};

// Цвета типов узлов
const NODE_COLORS = {
  System: '#00D4FF',
  Person: '#FFB300',
  Process: '#10b981',
  Concept: '#FF6B9D',
  Code: '#7B61FF',
  Document: '#8A8A9E',
  Organization: '#FFB300',
  API: '#00D4FF',
  Database: '#10b981'
};

// Размеры узлов по типу
const NODE_SIZES = {
  System: 8,
  Organization: 7,
  Process: 6,
  Person: 6,
  Document: 6,
  Code: 5,
  Default: 5
};

export default function KnowledgeGraph3D({ nodes = [], links = [], isReady = false }) {
  const fgRef = useRef();
  const [graphMounted, setGraphMounted] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState({
    Strategic: true,
    Business: true,
    Code: true
  });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  // Проверка валидности данных графа
  const hasValidData = useMemo(() => {
    return isReady &&
           Array.isArray(nodes) &&
           nodes.length > 0 &&
           nodes.every(n => n && n.id !== undefined);
  }, [isReady, nodes]);

  // Настройка сил при монтировании графа
  useEffect(() => {
    if (!fgRef.current || !hasValidData || !graphMounted) return;

    const fg = fgRef.current;

    // Проверяем что d3Force доступен
    if (!fg.d3Force) return;

    try {
      // Сильная Z-позиционирующая сила для стратификации по слоям
      fg.d3Force('z', (alpha) => {
        nodes.forEach(node => {
          const targetZ = LAYER_Z[node.layer] || 0;
          node.vz = (node.vz || 0) + (targetZ - (node.z || 0)) * 0.1 * alpha;
        });
      });

      // Настройка силы заряда
      const chargeForce = fg.d3Force('charge');
      if (chargeForce) chargeForce.strength(-150);

      // Настройка расстояния связей
      const linkForce = fg.d3Force('link');
      if (linkForce) linkForce.distance(80).strength(0.5);

      // Центрирующая сила
      const centerForce = fg.d3Force('center');
      if (centerForce) centerForce.strength(0.05);

      // Перезапуск симуляции
      fg.d3ReheatSimulation();
    } catch (e) {
      console.warn('[KnowledgeGraph3D] Error configuring forces:', e.message);
    }

  }, [nodes, hasValidData, graphMounted]);

  // Callback при готовности графа
  const handleEngineStop = useCallback(() => {
    // Граф остановился, можно безопасно манипулировать
  }, []);

  // Callback при инициализации графа
  const handleEngineTick = useCallback(() => {
    if (!graphMounted) {
      setGraphMounted(true);
    }
  }, [graphMounted]);

  // Настройка bloom-эффекта
  useEffect(() => {
    if (!fgRef.current) return;

    const fg = fgRef.current;

    // Доступ к Three.js renderer и добавление bloom
    const renderer = fg.renderer();
    if (renderer) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
    }
  }, []);

  // Фильтрация данных по видимым слоям
  const filteredData = useMemo(() => {
    if (!hasValidData) {
      return { nodes: [], links: [] };
    }

    const visibleNodes = nodes
      .filter(n => n && visibleLayers[n.layer])
      .map(n => ({
        ...n,
        // Инициализируем позиции если их нет
        x: n.x ?? Math.random() * 100 - 50,
        y: n.y ?? Math.random() * 100 - 50,
        z: n.z ?? (LAYER_Z[n.layer] || 0)
      }));

    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    const visibleLinks = (links || []).filter(l => {
      if (!l) return false;
      const sourceId = typeof l.source === 'object' ? l.source?.id : l.source;
      const targetId = typeof l.target === 'object' ? l.target?.id : l.target;
      return sourceId && targetId && visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    });

    return { nodes: visibleNodes, links: visibleLinks };
  }, [nodes, links, visibleLayers, hasValidData]);

  // Кастомный рендеринг узлов
  const nodeThreeObject = useCallback((node) => {
    const size = NODE_SIZES[node.type] || NODE_SIZES.Default;
    const color = node.color || NODE_COLORS[node.type] || '#FFFFFF';
    const isHovered = hoveredNode?.id === node.id;
    const isSelected = selectedNode?.id === node.id;

    let geometry;
    switch (node.shape || node.type) {
      case 'sphere':
      case 'Person':
      case 'Code':
        geometry = new THREE.SphereGeometry(size * (isHovered ? 1.3 : 1), 16, 16);
        break;
      case 'icosahedron':
      case 'Concept':
        geometry = new THREE.IcosahedronGeometry(size * (isHovered ? 1.3 : 1));
        break;
      default:
        geometry = new THREE.BoxGeometry(
          size * (isHovered ? 1.3 : 1),
          size * (isHovered ? 1.3 : 1),
          size * (isHovered ? 1.3 : 1)
        );
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: isHovered ? 0.6 : isSelected ? 0.4 : 0.2,
      metalness: 0.3,
      roughness: 0.4
    });

    const mesh = new THREE.Mesh(geometry, material);

    // Добавление эффекта свечения для выбранных/наведённых узлов
    if (isHovered || isSelected) {
      const glowGeometry = geometry.clone();
      glowGeometry.scale(1.2, 1.2, 1.2);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.3
      });
      const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
      mesh.add(glowMesh);
    }

    return mesh;
  }, [hoveredNode, selectedNode]);

  // Управление камерой
  const handleResetView = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400);
    }
  }, []);

  const handleTopView = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: 0, y: 0, z: 600 },
        { x: 0, y: 0, z: 0 },
        1000
      );
    }
  }, []);

  const handleSideView = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: 600, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        1000
      );
    }
  }, []);

  const handleIsoView = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: 400, y: 300, z: 400 },
        { x: 0, y: 0, z: 0 },
        1000
      );
    }
  }, []);

  // Переключение видимости слоёв
  const handleLayerToggle = (layer) => {
    setVisibleLayers(prev => ({
      ...prev,
      [layer]: !prev[layer]
    }));
  };

  // Взаимодействие с узлами
  const handleNodeHover = useCallback((node) => {
    setHoveredNode(node);
    document.body.style.cursor = node ? 'pointer' : 'default';
  }, []);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);

    // Фокус на выбранном узле
    if (fgRef.current && node) {
      const distance = 200;
      const { x, y, z } = node;
      fgRef.current.cameraPosition(
        { x: x + distance, y: y + distance, z: z + distance },
        { x, y, z },
        1000
      );
    }
  }, []);

  // Экспорт скриншота
  const handleExport = useCallback(() => {
    if (fgRef.current) {
      const renderer = fgRef.current.renderer();
      const canvas = renderer.domElement;
      const link = document.createElement('a');
      link.download = 'knowledge-graph.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  }, []);

  // Отображение заглушки если граф не готов
  if (!hasValidData || filteredData.nodes.length === 0) {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 2,
        bgcolor: '#0a0a14'
      }}>
        <Typography variant="h1" sx={{ opacity: 0.2, fontSize: '6rem' }}>🕸️</Typography>
        <Typography color="text.secondary">
          {!isReady ? 'Graph will appear after processing' : 'Loading graph...'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', height: '100%', bgcolor: '#0a0a14' }}>
      {/* Панель управления */}
      <Box sx={{
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }}>
        {/* Управление камерой */}
        <Box sx={{ display: 'flex', gap: 0.5, bgcolor: 'rgba(0,0,0,0.6)', borderRadius: 1, p: 0.5 }}>
          <Tooltip title="Reset View">
            <IconButton size="small" onClick={handleResetView} sx={{ color: 'white' }}>
              <RotateCcw size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Top View">
            <IconButton size="small" onClick={handleTopView} sx={{ color: 'white' }}>
              <Typography variant="caption">↑</Typography>
            </IconButton>
          </Tooltip>
          <Tooltip title="Side View">
            <IconButton size="small" onClick={handleSideView} sx={{ color: 'white' }}>
              <Typography variant="caption">→</Typography>
            </IconButton>
          </Tooltip>
          <Tooltip title="Iso View">
            <IconButton size="small" onClick={handleIsoView} sx={{ color: 'white' }}>
              <Camera size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export PNG">
            <IconButton size="small" onClick={handleExport} sx={{ color: 'white' }}>
              <Download size={16} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Переключатели слоёв */}
        <Box sx={{ bgcolor: 'rgba(0,0,0,0.6)', borderRadius: 1, p: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Layers
          </Typography>
          {Object.entries(LAYER_COLORS).map(([layer, color]) => (
            <Box
              key={layer}
              onClick={() => handleLayerToggle(layer)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                cursor: 'pointer',
                opacity: visibleLayers[layer] ? 1 : 0.4,
                mb: 0.5,
                '&:hover': { opacity: 0.8 }
              }}>
              {visibleLayers[layer] ? <Eye size={14} /> : <EyeOff size={14} />}
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
              <Typography variant="caption">{layer}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Панель информации об узле */}
      {(hoveredNode || selectedNode) && (
        <Box sx={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          zIndex: 10,
          bgcolor: 'rgba(0,0,0,0.8)',
          borderRadius: 1,
          p: 1.5,
          minWidth: 200,
          border: '1px solid #2a2a3e'
        }}>
          <Typography variant="subtitle2" sx={{ color: (hoveredNode || selectedNode).color }}>
            {(hoveredNode || selectedNode).name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Type: {(hoveredNode || selectedNode).type}
          </Typography>
          <br />
          <Typography variant="caption" color="text.secondary">
            Layer: {(hoveredNode || selectedNode).layer}
          </Typography>
          {(hoveredNode || selectedNode).confidence && (
            <>
              <br />
              <Typography variant="caption" color="text.secondary">
                Confidence: {((hoveredNode || selectedNode).confidence * 100).toFixed(0)}%
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* Статистика */}
      <Box sx={{
        position: 'absolute',
        bottom: 8,
        right: 8,
        zIndex: 10,
        bgcolor: 'rgba(0,0,0,0.6)',
        borderRadius: 1,
        px: 1.5,
        py: 0.5
      }}>
        <Typography variant="caption" color="text.secondary">
          {filteredData.nodes.length} nodes • {filteredData.links.length} links
        </Typography>
      </Box>

      {/* 3D Граф */}
      {filteredData.nodes.length > 0 && (
        <ForceGraph3D
          ref={fgRef}
          graphData={filteredData}
          backgroundColor="#0a0a14"
          nodeThreeObject={nodeThreeObject}
          nodeLabel={node => node ? `${node.name} (${node.type})` : ''}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          onEngineStop={handleEngineStop}
          onEngineTick={handleEngineTick}
          linkColor={() => '#4A5568'}
          linkWidth={2}
          linkOpacity={0.6}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleSpeed={0.005}
          enableNodeDrag={true}
          enableNavigationControls={true}
          showNavInfo={false}
          warmupTicks={100}
          cooldownTicks={1000}
        />
      )}
    </Box>
  );
}
