/**
 * INeedTestDataSeeder
 *
 * Seeds Memgraph with test data for the iNeed service request platform:
 * - UN Staff Profiles (with manager hierarchy)
 * - Support Groups (IT, HR, Security, Facilities)
 * - Equipment Inventory
 * - Workspaces
 * - Business Process Graph metadata
 */

class INeedTestDataSeeder {
  /**
   * @param {Object} memgraph - MemgraphService instance
   */
  constructor(memgraph) {
    this._memgraph = memgraph;
  }

  /**
   * Seed all test data
   * @returns {Promise<{created: Object}>}
   */
  async seed() {
    const counts = {
      profiles: 0,
      groups: 0,
      equipment: 0,
      workspaces: 0,
      graphs: 0,
    };

    counts.profiles = await this.seedProfiles();
    counts.groups = await this.seedSupportGroups();
    counts.equipment = await this.seedEquipment();
    counts.workspaces = await this.seedWorkspaces();
    counts.graphs = await this.seedGraphMetadata();

    return { created: counts };
  }

  async seedProfiles() {
    const profiles = [
      // Staff members
      {
        user_id: 'TS-001', full_name: 'Maria Santos', email: 'maria.santos@un.org',
        dept: 'ICTS', duty_station: 'New York', manager_id: 'MGR-NY-001',
        clearance_level: 'confidential', contract_type: 'staff',
        contract_expiry: '2028-12-31', budget_code: 'ICTS-2024-001', role: 'P4',
      },
      {
        user_id: 'TS-002', full_name: 'Ahmed Al-Rashid', email: 'ahmed.alrashid@un.org',
        dept: 'OCHA', duty_station: 'Geneva', manager_id: 'MGR-GVA-001',
        clearance_level: 'confidential', contract_type: 'staff',
        contract_expiry: '2027-06-30', budget_code: 'OCHA-2024-015', role: 'P3',
      },
      {
        user_id: 'TS-003', full_name: 'Ji-Yeon Park', email: 'jiyeon.park@un.org',
        dept: 'UNEP', duty_station: 'Nairobi', manager_id: 'MGR-NBI-001',
        clearance_level: 'basic', contract_type: 'staff',
        contract_expiry: '2026-12-31', budget_code: 'UNEP-2024-042', role: 'G7',
      },
      {
        user_id: 'TS-004', full_name: 'Ravi Chakraborty', email: 'ravi.chakraborty@un.org',
        dept: 'OLA', duty_station: 'New York', manager_id: 'MGR-NY-002',
        clearance_level: 'secret', contract_type: 'staff',
        contract_expiry: '2029-03-15', budget_code: 'OLA-2024-007', role: 'P5',
      },
      // Managers
      {
        user_id: 'MGR-NY-001', full_name: 'Jennifer Walsh', email: 'jennifer.walsh@un.org',
        dept: 'ICTS', duty_station: 'New York', manager_id: 'DIR-NY-001',
        clearance_level: 'secret', contract_type: 'staff',
        contract_expiry: '2030-01-01', budget_code: 'ICTS-2024-000', role: 'D1',
      },
      {
        user_id: 'MGR-GVA-001', full_name: 'Pierre Dubois', email: 'pierre.dubois@un.org',
        dept: 'OCHA', duty_station: 'Geneva', manager_id: 'DIR-GVA-001',
        clearance_level: 'secret', contract_type: 'staff',
        contract_expiry: '2029-06-30', budget_code: 'OCHA-2024-000', role: 'D1',
      },
      {
        user_id: 'MGR-NBI-001', full_name: 'Amina Okonkwo', email: 'amina.okonkwo@un.org',
        dept: 'UNEP', duty_station: 'Nairobi', manager_id: 'DIR-NBI-001',
        clearance_level: 'confidential', contract_type: 'staff',
        contract_expiry: '2028-12-31', budget_code: 'UNEP-2024-000', role: 'P5',
      },
      {
        user_id: 'MGR-NY-002', full_name: 'David Rosenberg', email: 'david.rosenberg@un.org',
        dept: 'OLA', duty_station: 'New York', manager_id: 'DIR-NY-001',
        clearance_level: 'secret', contract_type: 'staff',
        contract_expiry: '2029-12-31', budget_code: 'OLA-2024-000', role: 'D1',
      },
    ];

    for (const p of profiles) {
      await this._memgraph.queryWithNamespace(
        `MERGE (u:UNStaffProfile {user_id: $user_id})
         SET u.full_name = $full_name, u.email = $email, u.dept = $dept,
             u.duty_station = $duty_station, u.manager_id = $manager_id,
             u.clearance_level = $clearance_level, u.contract_type = $contract_type,
             u.contract_expiry = $contract_expiry, u.budget_code = $budget_code,
             u.role = $role`, p
      );
    }

    // Create REPORTS_TO relationships
    await this._memgraph.queryWithNamespace(`
      MATCH (u:UNStaffProfile), (m:UNStaffProfile)
      WHERE u.manager_id = m.user_id
      MERGE (u)-[:REPORTS_TO]->(m)
    `);

    return profiles.length;
  }

  async seedSupportGroups() {
    const groups = [
      { group_id: 'ICTS-NY-SD', name: 'ICTS NY Service Desk', duty_station: 'New York', category: 'IT', tier: 1 },
      { group_id: 'ICTS-NY-HW', name: 'ICTS NY Hardware Team', duty_station: 'New York', category: 'IT', tier: 2 },
      { group_id: 'ICTS-GVA-SD', name: 'ICTS Geneva Service Desk', duty_station: 'Geneva', category: 'IT', tier: 1 },
      { group_id: 'ICTS-NBI-SD', name: 'ICTS Nairobi Service Desk', duty_station: 'Nairobi', category: 'IT', tier: 1 },
      { group_id: 'HR-NY-ACCESS', name: 'HR NY Access Management', duty_station: 'New York', category: 'HR', tier: 2 },
      { group_id: 'HR-GVA-ACCESS', name: 'HR Geneva Access Management', duty_station: 'Geneva', category: 'HR', tier: 2 },
      { group_id: 'SEC-NY', name: 'Security Office New York', duty_station: 'New York', category: 'Security', tier: 2 },
      { group_id: 'SEC-GVA', name: 'Security Office Geneva', duty_station: 'Geneva', category: 'Security', tier: 2 },
      { group_id: 'FAC-NY', name: 'Facilities New York', duty_station: 'New York', category: 'Facilities', tier: 2 },
      { group_id: 'FAC-NBI', name: 'Facilities Nairobi', duty_station: 'Nairobi', category: 'Facilities', tier: 2 },
    ];

    for (const g of groups) {
      await this._memgraph.queryWithNamespace(
        `MERGE (g:SupportGroup {group_id: $group_id})
         SET g.name = $name, g.duty_station = $duty_station,
             g.category = $category, g.tier = $tier`, g
      );
    }

    return groups.length;
  }

  async seedEquipment() {
    const equipment = [
      { item_id: 'EQ-001', type: 'laptop', model: 'Dell Latitude 5540', specs: '16GB RAM, 512GB SSD, i7', status: 'available', location: 'New York', cost: 1500 },
      { item_id: 'EQ-002', type: 'laptop', model: 'Dell Latitude 5540', specs: '32GB RAM, 1TB SSD, i7', status: 'available', location: 'New York', cost: 2200 },
      { item_id: 'EQ-003', type: 'laptop', model: 'MacBook Pro 14"', specs: 'M3 Pro, 18GB RAM, 512GB', status: 'available', location: 'Geneva', cost: 2500 },
      { item_id: 'EQ-004', type: 'monitor', model: 'Dell U2723QE', specs: '27" 4K USB-C', status: 'available', location: 'New York', cost: 650 },
      { item_id: 'EQ-005', type: 'monitor', model: 'Dell U2723QE', specs: '27" 4K USB-C', status: 'reserved', location: 'New York', cost: 650 },
      { item_id: 'EQ-006', type: 'phone', model: 'Cisco IP Phone 8845', specs: 'Video phone', status: 'available', location: 'Nairobi', cost: 400 },
      { item_id: 'EQ-007', type: 'headset', model: 'Jabra Evolve2 85', specs: 'Wireless ANC', status: 'available', location: 'New York', cost: 380 },
      { item_id: 'EQ-008', type: 'docking_station', model: 'Dell WD22TB4', specs: 'Thunderbolt 4', status: 'available', location: 'Geneva', cost: 350 },
    ];

    for (const e of equipment) {
      await this._memgraph.queryWithNamespace(
        `MERGE (e:Equipment {item_id: $item_id})
         SET e.type = $type, e.model = $model, e.specs = $specs,
             e.status = $status, e.location = $location, e.cost = $cost`, e
      );
    }

    return equipment.length;
  }

  async seedWorkspaces() {
    const workspaces = [
      { workspace_id: 'WS-NY-001', building: 'UN Secretariat', floor: 15, room: '1512', type: 'office', status: 'available', duty_station: 'New York', capacity: 1 },
      { workspace_id: 'WS-NY-002', building: 'UN Secretariat', floor: 15, room: '1514', type: 'office', status: 'available', duty_station: 'New York', capacity: 1 },
      { workspace_id: 'WS-NY-003', building: 'UN Secretariat', floor: 22, room: '2201', type: 'office', status: 'occupied', duty_station: 'New York', capacity: 1 },
      { workspace_id: 'WS-GVA-001', building: 'Palais des Nations', floor: 3, room: 'A-312', type: 'office', status: 'available', duty_station: 'Geneva', capacity: 1 },
      { workspace_id: 'WS-GVA-002', building: 'Palais des Nations', floor: 3, room: 'A-314', type: 'shared', status: 'available', duty_station: 'Geneva', capacity: 4 },
      { workspace_id: 'WS-NBI-001', building: 'UN Complex Gigiri', floor: 2, room: 'Block C-201', type: 'office', status: 'available', duty_station: 'Nairobi', capacity: 1 },
      { workspace_id: 'WS-NBI-002', building: 'UN Complex Gigiri', floor: 2, room: 'Block C-205', type: 'office', status: 'available', duty_station: 'Nairobi', capacity: 1 },
    ];

    for (const w of workspaces) {
      await this._memgraph.queryWithNamespace(
        `MERGE (w:Workspace {workspace_id: $workspace_id})
         SET w.building = $building, w.floor = $floor, w.room = $room,
             w.type = $type, w.status = $status, w.duty_station = $duty_station,
             w.capacity = $capacity`, w
      );
    }

    return workspaces.length;
  }

  async seedGraphMetadata() {
    const graphs = [
      {
        graph_id: 'INEED-G1-IT-HARDWARE-V1',
        name: 'iNeed: IT Hardware Request',
        category: 'IT', subcategory: 'Hardware',
        duty_stations: '*',
        intent_keywords: 'laptop,monitor,phone,equipment,hardware,computer,device',
        version: '1.0.0', is_active: true, node_count: 22,
      },
      {
        graph_id: 'INEED-G2-HR-ACCESS-V1',
        name: 'iNeed: HR Access/Badge Request',
        category: 'HR', subcategory: 'Access',
        duty_stations: '*',
        intent_keywords: 'badge,access,pass,clearance,building,security,card',
        version: '1.0.0', is_active: true, node_count: 13,
      },
      {
        graph_id: 'INEED-G3-FACILITIES-WORKSPACE-V1',
        name: 'iNeed: Facilities Workspace Request',
        category: 'Facilities', subcategory: 'Workspace',
        duty_stations: '*',
        intent_keywords: 'workspace,office,desk,room,move,relocation,seat',
        version: '1.0.0', is_active: true, node_count: 12,
      },
    ];

    for (const g of graphs) {
      await this._memgraph.queryWithNamespace(
        `MERGE (g:BusinessProcessGraph {graph_id: $graph_id})
         SET g.name = $name, g.category = $category, g.subcategory = $subcategory,
             g.duty_stations = $duty_stations, g.intent_keywords = $intent_keywords,
             g.version = $version, g.is_active = $is_active, g.node_count = $node_count`, g
      );
    }

    return graphs.length;
  }

  /**
   * Clear all test data
   */
  async clear() {
    await this._memgraph.queryWithNamespace(`
      MATCH (n)
      WHERE n:UNStaffProfile OR n:SupportGroup OR n:Equipment OR n:Workspace
         OR n:BusinessProcessGraph OR n:ServiceRequest OR n:WorkOrder
         OR n:Notification OR n:Execution
      DETACH DELETE n
    `);
  }
}

module.exports = { INeedTestDataSeeder };
