'use strict';

const routing = require('../graph-routing.js');

module.exports = {
  id: 'flowdesk.get-user-context',
  name: 'Get User Context',

  async execute(context) {
    await routing.init();
    const userId = context.input.userId || context.state['N1-VALIDATE']?.userId;
    const userCtx = await routing.getUserContext(userId);

    if (!userCtx) {
      return { success: false, output: { error: 'User not found' }, condition: 'invalid' };
    }

    return {
      success: true,
      output: {
        userId,
        email: userCtx.email,
        displayName: userCtx.displayName,
        orgUnit: userCtx.orgUnit,
        location: userCtx.location,
        roles: userCtx.roles,
        isVip: userCtx.isVip,
      },
    };
  },
};
