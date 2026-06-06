// Import commands.js using ES2015 syntax:
import './commands';

Cypress.on('window:before:load', (win) => {
  win.browserLogs = win.browserLogs || [];
  
  const originalLog = win.console.log;
  const originalError = win.console.error;
  const originalWarn = win.console.warn;

  const formatArg = (arg) => {
    if (arg && (arg.message || arg.stack || arg.name)) {
      return `${arg.name || 'Error'}: ${arg.message || ''}${arg.stack ? '\n' + arg.stack : ''}`;
    }
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg);
      } catch (_) {
        return String(arg);
      }
    }
    return String(arg);
  };

  win.console.log = (...args) => {
    originalLog.apply(win.console, args);
    const msg = args.map(formatArg).join(' ');
    if (!msg.includes('engine.io') && !msg.includes('socket.io') && !msg.includes('ping') && !msg.includes('pong')) {
      win.browserLogs.push(`[INFO] ` + msg);
    }
  };
  win.console.error = (...args) => {
    originalError.apply(win.console, args);
    const msg = args.map(formatArg).join(' ');
    win.browserLogs.push(`🔴 [ERROR] ` + msg);
  };
  win.console.warn = (...args) => {
    originalWarn.apply(win.console, args);
    const msg = args.map(formatArg).join(' ');
    win.browserLogs.push(`⚠️ [WARN] ` + msg);
  };
});
