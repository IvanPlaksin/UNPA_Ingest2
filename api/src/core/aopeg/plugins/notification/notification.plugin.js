/**
 * Notification Plugin (JS)
 */

const { PluginBase } = require('../plugin-base');
const { SendNotificationExecutor } = require('./executors/send.executor');

class NotificationPlugin extends PluginBase {
  constructor() {
    super({
      name: 'notification',
      version: '1.0.0',
      description: 'Notification executors: email, in-app, SMS',
      author: 'UNPA Team',
      domain: 'notification',
    });
  }

  async initialize() {
    this.addExecutor(new SendNotificationExecutor());
  }
}

const notificationPlugin = new NotificationPlugin();

module.exports = { NotificationPlugin, notificationPlugin };
