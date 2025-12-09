import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, Database, GitGraph, Settings, Search, LayoutDashboard, ListTodo, FolderTree, Bot } from 'lucide-react';
import './Sidebar.css';

import ServiceStatusWidget from './ServiceStatusWidget';

const Sidebar = () => {
    const location = useLocation();

    const isActive = (path) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    return (
        <div className="sidebar">
            <div className="logo">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">UN</div>
                Project Advisor
            </div>
            <nav>
                <Link to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
                    <LayoutDashboard size={18} /> Dashboard
                </Link>
                <Link to="/workitems" className={`nav-item ${isActive('/workitems') ? 'active' : ''}`}>
                    <ListTodo size={18} /> Work Items
                </Link>

                <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2">Knowledge</div>

                <Link to="/knowledge" className={`nav-item ${isActive('/knowledge') && !isActive('/knowledge/rabbit-hole') && !isActive('/knowledge/tfvc') ? 'active' : ''}`}>
                    <Database size={18} /> Overview
                </Link>
                <Link to="/knowledge/tfvc" className={`nav-item ${isActive('/knowledge/tfvc') ? 'active' : ''}`}>
                    <FolderTree size={18} /> TFVC Browser
                </Link>
                <Link to="/knowledge/rabbit-hole" className={`nav-item ${isActive('/knowledge/rabbit-hole') ? 'active' : ''}`}>
                    <Search size={18} /> Rabbit Hole
                </Link>

                <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2">Assistant</div>
                <Link to="/agent" className={`nav-item ${isActive('/agent') ? 'active' : ''}`}>
                    <Bot size={18} /> Chat Agent
                </Link>
            </nav>
            <div className="bottom">
                <ServiceStatusWidget />
                <div className="nav-item"><Settings size={18} /> Settings</div>
            </div>
        </div>
    );
};


export default Sidebar;