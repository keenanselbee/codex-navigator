'use strict';

function navigatorActionOrder(action, cancel) {
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  return /win/i.test(platform) ? [action, cancel] : [cancel, action];
}
