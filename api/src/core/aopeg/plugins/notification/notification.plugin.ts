/**
 * Notification Plugin
 *
 * Provides AOPEG executors for sending notifications:
 *   - notification.send: Send notification via email, in-app, or SMS
 */

import { PluginBase } from '../plugin-base';
import { SendNotificationExecutor } from './executors/send.executor';

export class NotificationPlugin extends PluginBase {
  constructor() {
    super({
      name: 'notification',
      version: '1.0.0',
      description: 'Notification executors: email, in-app, SMS',
      author: 'UNPA Team',
      domain: 'notification',
    });
  }

  async initialize(): Promise<void> {
    this.addExecutor(new SendNotificationExecutor());
  }
}

export const notificationPlugin = new NotificationPlugin();
