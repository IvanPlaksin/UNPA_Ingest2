// ═══════════════════════════════════════════════════════════════════════════
// iNeed Test Scenario Schema
// Memgraph constraints and indexes for the iNeed service request platform
// ═══════════════════════════════════════════════════════════════════════════

// === UNStaffProfile ===
CREATE INDEX ON :UNStaffProfile(user_id);
CREATE INDEX ON :UNStaffProfile(duty_station);
CREATE INDEX ON :UNStaffProfile(dept);
CREATE INDEX ON :UNStaffProfile(email);

// === ServiceRequest ===
CREATE INDEX ON :ServiceRequest(sr_id);
CREATE INDEX ON :ServiceRequest(status);
CREATE INDEX ON :ServiceRequest(category);
CREATE INDEX ON :ServiceRequest(duty_station);
CREATE INDEX ON :ServiceRequest(priority);
CREATE INDEX ON :ServiceRequest(created_at);

// === WorkOrder ===
CREATE INDEX ON :WorkOrder(wo_id);
CREATE INDEX ON :WorkOrder(status);
CREATE INDEX ON :WorkOrder(assigned_group);

// === BusinessProcessGraph ===
CREATE INDEX ON :BusinessProcessGraph(graph_id);
CREATE INDEX ON :BusinessProcessGraph(category);
CREATE INDEX ON :BusinessProcessGraph(is_active);

// === ExecutionRecord ===
CREATE INDEX ON :ExecutionRecord(execution_id);
CREATE INDEX ON :ExecutionRecord(status);
CREATE INDEX ON :ExecutionRecord(graph_id);

// === Execution (spawn_graph tracking) ===
CREATE INDEX ON :Execution(id);
CREATE INDEX ON :Execution(status);

// === SupportGroup ===
CREATE INDEX ON :SupportGroup(group_id);
CREATE INDEX ON :SupportGroup(duty_station);
CREATE INDEX ON :SupportGroup(category);

// === Notification ===
CREATE INDEX ON :Notification(id);
CREATE INDEX ON :Notification(channel);

// === Equipment ===
CREATE INDEX ON :Equipment(item_id);
CREATE INDEX ON :Equipment(type);
CREATE INDEX ON :Equipment(status);
CREATE INDEX ON :Equipment(location);

// === Workspace ===
CREATE INDEX ON :Workspace(workspace_id);
CREATE INDEX ON :Workspace(status);
CREATE INDEX ON :Workspace(building);
CREATE INDEX ON :Workspace(duty_station);
