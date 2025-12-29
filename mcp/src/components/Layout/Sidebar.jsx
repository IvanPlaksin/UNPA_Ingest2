import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, Database, GitGraph, Settings, Search, LayoutDashboard, ListTodo, FolderTree, Bot, FlaskConical } from 'lucide-react';
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
    Avatar
} from '@mui/material';
import ServiceStatusWidget from './ServiceStatusWidget';

const DRAWER_WIDTH = 240;

const Sidebar = () => {
    const location = useLocation();

    const isActive = (path) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    const NavItem = ({ to, icon: Icon, label, exact = false }) => {
        const active = isActive(to);
        return (
            <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                    component={Link}
                    to={to}
                    selected={active}
                    sx={{
                        borderRadius: 2,
                        mx: 1,
                        '&.Mui-selected': {
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            '&:hover': { bgcolor: 'primary.dark' },
                            '& .MuiListItemIcon-root': { color: 'primary.contrastText' }
                        }
                    }}
                >
                    <ListItemIcon sx={{ minWidth: 40, color: active ? 'inherit' : 'text.secondary' }}>
                        <Icon size={20} />
                    </ListItemIcon>
                    <ListItemText primary={label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: active ? 600 : 400 }} />
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
                    <NavItem to="/knowledge/tfvc" icon={FolderTree} label="TFVC Browser" />
                    <NavItem to="/knowledge/rabbit-hole" icon={Search} label="Rabbit Hole" />

                    <SectionHeader title="Assistant" />
                    <NavItem to="/agent" icon={Bot} label="Chat Agent" />
                </List>
            </Box>

            {/* Bottom Section */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                <ServiceStatusWidget />
                <ListItemButton sx={{ mt: 1, borderRadius: 2, color: 'text.secondary' }}>
                    <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
                        <Settings size={20} />
                    </ListItemIcon>
                    <ListItemText primary="Settings" primaryTypographyProps={{ fontSize: '0.875rem' }} />
                </ListItemButton>
                <NavItem to="/experimental" icon={FlaskConical} label="Experimental" />
            </Box>
        </Drawer>
    );
};

export default Sidebar;