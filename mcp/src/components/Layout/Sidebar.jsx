import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, Database, GitGraph, Settings, Search, LayoutDashboard, ListTodo, FolderTree, Bot, FlaskConical, Layers, Microscope, Workflow, Brain, Network, Globe, DatabaseZap, Activity, Cpu, ClipboardList, BookOpen, BarChart3, FolderKanban, PenTool, FormInput, ChevronDown, ChevronRight, Headphones, FileText, Triangle, AlertTriangle, HeartPulse, Archive, Boxes, Map, LineChart, ShieldAlert, ScanSearch, ShieldCheck, Sparkles, ArrowLeftRight, Gauge } from 'lucide-react';
import {
    Box,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Typography,
    Divider,
    Stack,
    Avatar,
    Collapse
} from '@mui/material';
import ServiceStatusWidget from './ServiceStatusWidget';
import AIUsageWidget from './AIUsageWidget';
import TensorMonitorWidget from './TensorMonitorWidget';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const DRAWER_WIDTH = 240;

const Sidebar = () => {
    const location = useLocation();

    const workspaces = useWorkspaceStore(s => s.workspaces);
    const fetchWorkspaces = useWorkspaceStore(s => s.fetchWorkspaces);
    const [workspacesExpanded, setWorkspacesExpanded] = useState(
        () => location.pathname.startsWith('/workspaces')
    );

    useEffect(() => {
        // Fetch once on mount; WorkspacesPage may also refresh later
        if (workspaces.length === 0) {
            fetchWorkspaces().catch(() => {});
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const isActive = (path) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    const isExactActive = (path) => location.pathname === path;

    const NavItem = ({ to, icon: Icon, label, exact = false, indent = false }) => {
        const active = exact ? isExactActive(to) : isActive(to);
        return (
            <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                    component={Link}
                    to={to}
                    selected={active}
                    sx={{
                        borderRadius: 2,
                        mx: 1,
                        ...(indent && { pl: 3.5 }),
                        '&.Mui-selected': {
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            '&:hover': { bgcolor: 'primary.dark' },
                            '& .MuiListItemIcon-root': { color: 'primary.contrastText' }
                        }
                    }}
                >
                    <ListItemIcon sx={{ minWidth: indent ? 32 : 40, color: active ? 'inherit' : 'text.secondary' }}>
                        <Icon size={indent ? 17 : 20} />
                    </ListItemIcon>
                    <ListItemText primary={label} primaryTypographyProps={{ fontSize: indent ? '0.8rem' : '0.875rem', fontWeight: active ? 600 : 400 }} />
                </ListItemButton>
            </ListItem>
        );
    };

    const SectionHeader = ({ title }) => (
        <Typography variant="caption" sx={{ px: 3, pt: 2, pb: 1, display: 'block', textTransform: 'uppercase', fontWeight: 'bold', color: 'text.disabled', letterSpacing: '0.05em' }}>
            {title}
        </Typography>
    );

    return (
        <Drawer
            variant="permanent"
            sx={{
                width: DRAWER_WIDTH,
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                    width: DRAWER_WIDTH,
                    boxSizing: 'border-box',
                    borderRight: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    display: 'flex',
                    flexDirection: 'column'
                },
            }}
        >
            {/* Logo Area */}
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: 'primary.main', borderRadius: 2, width: 32, height: 32, fontWeight: 'bold' }}>UN</Avatar>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ lineHeight: 1.2 }}>
                    Project <Box component="span" sx={{ color: 'primary.main' }}>Advisor</Box>
                </Typography>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* Navigation */}
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                <List>
                    <NavItem to="/" icon={LayoutDashboard} label="Dashboard" exact />
                    <NavItem to="/workitems" icon={ListTodo} label="Work Items" />

                    <SectionHeader title="Knowledge" />
                    <NavItem to="/knowledge" icon={Database} label="Overview" />
                    <NavItem to="/knowledge-dashboard" icon={Gauge} label="Knowledge Dashboard" />
                    <NavItem to="/documents" icon={FileText} label="Documents" exact />
                    <NavItem to="/documents/sources" icon={Globe} label="Source Catalog" exact indent />
                    <NavItem to="/knowledge-triangle" icon={Triangle} label="Triangle Explorer" />
                    <NavItem to="/gaps" icon={AlertTriangle} label="Gap Manager" />
                    <NavItem to="/knowledge-health" icon={HeartPulse} label="Health Dashboard" />
                    <NavItem to="/entity-store"  icon={Archive} label="Entity Store" />
                    <NavItem to="/investigation" icon={ScanSearch} label="Investigation" exact />
                    <NavItem to="/investigation/methodologies" icon={BookOpen} label="Methodologies" indent />
                    <NavItem to="/vector-store"  icon={Boxes}  label="Vector Store"   indent />
                    <NavItem to="/knowledge-map" icon={Map}    label="Knowledge Map"  indent />
                    <NavItem to="/knowledge/graph" icon={GitGraph} label="Knowledge Graph" />
                    <NavItem to="/knowledge/planes" icon={Layers} label="Knowledge Planes" />
                    <NavItem to="/knowledge/crud" icon={DatabaseZap} label="Graph Manager" />
                    <NavItem to="/knowledge/tfvc" icon={FolderTree} label="TFVC Browser" />
                    <NavItem to="/knowledge/rabbit-hole" icon={Search} label="Rabbit Hole" />

                    {/* WorkSpaces — expandable list of all workspaces */}
                    <ListItem disablePadding sx={{ mb: 0.5 }}>
                        <ListItemButton
                            component={Link}
                            to="/workspaces"
                            selected={isExactActive('/workspaces')}
                            sx={{
                                borderRadius: 2,
                                mx: 1,
                                pr: 0.5,
                                '&.Mui-selected': {
                                    bgcolor: 'primary.main',
                                    color: 'primary.contrastText',
                                    '&:hover': { bgcolor: 'primary.dark' },
                                    '& .MuiListItemIcon-root': { color: 'primary.contrastText' }
                                }
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 40, color: isExactActive('/workspaces') ? 'inherit' : 'text.secondary' }}>
                                <FolderKanban size={20} />
                            </ListItemIcon>
                            <ListItemText
                                primary="WorkSpaces"
                                primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: isExactActive('/workspaces') ? 600 : 400 }}
                            />
                            <Box
                                component="span"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setWorkspacesExpanded(v => !v);
                                }}
                                sx={{ display: 'flex', alignItems: 'center', p: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
                            >
                                {workspacesExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </Box>
                        </ListItemButton>
                    </ListItem>
                    <Collapse in={workspacesExpanded} timeout="auto" unmountOnExit>
                        <List disablePadding>
                            {workspaces.length === 0 && (
                                <Typography variant="caption" sx={{ display: 'block', pl: 6, py: 0.5, color: 'text.disabled', fontStyle: 'italic' }}>
                                    No workspaces
                                </Typography>
                            )}
                            {workspaces.map(ws => {
                                const wsPath = `/workspaces/${ws.id}`;
                                const wsActive = location.pathname === wsPath;
                                return (
                                    <ListItem key={ws.id} disablePadding sx={{ mb: 0.25 }}>
                                        <ListItemButton
                                            component={Link}
                                            to={wsPath}
                                            selected={wsActive}
                                            sx={{
                                                borderRadius: 2,
                                                mx: 1,
                                                pl: 5,
                                                py: 0.5,
                                                '&.Mui-selected': {
                                                    bgcolor: 'primary.main',
                                                    color: 'primary.contrastText',
                                                    '&:hover': { bgcolor: 'primary.dark' }
                                                }
                                            }}
                                        >
                                            <ListItemText
                                                primary={ws.name || ws.id}
                                                primaryTypographyProps={{
                                                    fontSize: '0.8rem',
                                                    fontWeight: wsActive ? 600 : 400,
                                                    noWrap: true,
                                                    title: ws.name || ws.id,
                                                }}
                                            />
                                        </ListItemButton>
                                    </ListItem>
                                );
                            })}
                        </List>
                    </Collapse>

                    <SectionHeader title="Pipeline" />
                    <NavItem to="/pipeline-lab"     icon={Microscope} label="Pipeline Lab" />
                    <NavItem to="/pipeline-manager" icon={Cpu}        label="Pipeline Manager" />
                    <NavItem to="/pipeline-stats"   icon={LineChart}  label="Pipeline Stats" />
                    <NavItem to="/aopeg" icon={Workflow} label="AOPEG Editor" />
                    <NavItem to="/gxe" icon={Brain} label="GXE Visualizer" />
                    <NavItem to="/gxe-manager" icon={Activity} label="GXE Manager" />
                    <NavItem to="/graph-verifier" icon={ShieldCheck} label="Graph Verifier" />
                    <NavItem to="/graph-transfer" icon={ArrowLeftRight} label="Graph Transfer" />

                    <SectionHeader title="Structural" />
                    <NavItem to="/structural-editor" icon={PenTool} label="Structural Editor" />
                    <NavItem to="/forms-demo" icon={FormInput} label="Forms Demo" />

                    <SectionHeader title="Advanced" />
                    <NavItem to="/gnn" icon={Network} label="GNN Dashboard" />
                    <NavItem to="/singularity" icon={Globe} label="Singularity 3D" />
                    <NavItem to="/entity-singularity" icon={Boxes} label="Entity Singularity" />

                    <SectionHeader title="Assistant" />
                    <NavItem to="/agent" icon={Bot} label="Chat Agent" />
                    <NavItem to="/flowdesk" icon={Headphones} label="FlowDesk Chat" />
                    <NavItem to="/flowdesk-v2" icon={Headphones} label="FlowDesk Chat V2" />
                    <NavItem to="/alt-chat-demo" icon={Sparkles} label="ALT CHAT DEMO" />
                    <NavItem to="/backlog" icon={ClipboardList} label="BackLog" />
                    <NavItem to="/codex" icon={BookOpen} label="Codex Viewer" />
                    <NavItem to="/dialogue" icon={MessageSquare} label="DevDialogue" />

                    <SectionHeader title="Monitoring" />
                    <NavItem to="/flowdesk-admin" icon={HeartPulse} label="Chat Admin" />
                    <NavItem to="/observability" icon={BarChart3} label="Observability" />
                    <NavItem to="/llm-access-control" icon={ShieldAlert} label="LLM Access Control" />
                </List>
            </Box>

            {/* Bottom Section */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                <ServiceStatusWidget />
             {/*    <Box sx={{ mt: 1.5 }}>
                    <AIUsageWidget />
                </Box> */}
                <Box sx={{ mt: 1.5 }}>
                    <TensorMonitorWidget />
                </Box>
                <ListItemButton sx={{ mt: 1, borderRadius: 2, color: 'text.secondary' }}>
                    <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
                        <Settings size={20} />
                    </ListItemIcon>
                    <ListItemText primary="Settings" primaryTypographyProps={{ fontSize: '0.875rem' }} />
                </ListItemButton>
            </Box>
        </Drawer>
    );
};

export default Sidebar;