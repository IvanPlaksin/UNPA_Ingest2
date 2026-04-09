/**
 * Visualization Module
 *
 * @module services/visualization
 */

const { GraphVizService, graphVizService } = require('./graph-viz.service');
const { DashboardService, dashboardService } = require('./dashboard.service');
const { GraphExportService, graphExportService } = require('./export.service');
const { ReportService, reportService } = require('./report.service');

module.exports = {
  GraphVizService,
  graphVizService,

  DashboardService,
  dashboardService,

  GraphExportService,
  graphExportService,

  ReportService,
  reportService
};
