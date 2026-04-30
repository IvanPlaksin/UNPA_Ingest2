/**
 * FlowDesk AOPEG Plugin
 *
 * Registers all FlowDesk executors with the GXE RuntimeEngine.
 * Domain: flowdesk
 * Namespace: FLOWDESK
 *
 * Dialog executors: classify_intent, clarify_intent, check_location, search_location,
 *   ask_beneficiary, find_user, confirm_request
 * Process executors: create_service_request, request_approval,
 *   create_work_order, assign_handler, send_notification
 */

const { PluginBase } = require('../plugin-base');

// Dialog executors
const { ClassifyIntentExecutor } = require('./executors/classify-intent.executor');
const { ClarifyIntentExecutor } = require('./executors/clarify-intent.executor');
const { CheckLocationExecutor } = require('./executors/check-location.executor');
const { SearchLocationExecutor } = require('./executors/search-location.executor');
const { AskBeneficiaryExecutor } = require('./executors/ask-beneficiary.executor');
const { FindUserExecutor } = require('./executors/find-user.executor');
const { ConfirmRequestExecutor } = require('./executors/confirm-request.executor');
const { SpawnProcessExecutor } = require('./executors/spawn-process.executor');

// Process executors
const { CreateServiceRequestExecutor } = require('./executors/create-service-request.executor');
const { RequestApprovalExecutor } = require('./executors/request-approval.executor');
const { CreateWorkOrderExecutor } = require('./executors/create-work-order.executor');
const { AssignHandlerExecutor } = require('./executors/assign-handler.executor');
const { SendNotificationExecutor } = require('./executors/send-notification.executor');

// Ticket lifecycle executors (GXE executable graphs)
const { ManageTicketExecutor } = require('./executors/manage-ticket.executor');
const { RouteTicketExecutor } = require('./executors/route-ticket.executor');
const { CheckSLAExecutor } = require('./executors/check-sla.executor');

// Laptop provisioning assistant
const { LaptopAssistantExecutor } = require('./executors/laptop-assistant.executor');

class FlowDeskPlugin extends PluginBase {
  constructor() {
    super({
      name: 'flowdesk',
      version: '1.0.0',
      description: 'FlowDesk service desk — dialog and process executors for AI intake layer',
      author: 'UN ProjectAdvisor',
      domain: 'flowdesk',
    });
  }

  async initialize() {
    // Dialog executors
    this.addExecutor(new ClassifyIntentExecutor());
    this.addExecutor(new ClarifyIntentExecutor());
    this.addExecutor(new CheckLocationExecutor());
    this.addExecutor(new SearchLocationExecutor());
    this.addExecutor(new AskBeneficiaryExecutor());
    this.addExecutor(new FindUserExecutor());
    this.addExecutor(new ConfirmRequestExecutor());
    this.addExecutor(new SpawnProcessExecutor());

    // Process executors
    this.addExecutor(new CreateServiceRequestExecutor());
    this.addExecutor(new RequestApprovalExecutor());
    this.addExecutor(new CreateWorkOrderExecutor());
    this.addExecutor(new AssignHandlerExecutor());
    this.addExecutor(new SendNotificationExecutor());

    // Ticket lifecycle executors (GXE executable graphs)
    this.addExecutor(new ManageTicketExecutor());
    this.addExecutor(new RouteTicketExecutor());
    this.addExecutor(new CheckSLAExecutor());

    // Laptop provisioning assistant
    this.addExecutor(new LaptopAssistantExecutor());
  }
}

const flowdeskPlugin = new FlowDeskPlugin();

module.exports = { FlowDeskPlugin, flowdeskPlugin };
