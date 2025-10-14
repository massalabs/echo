export interface DebugLog {
  timestamp: string;
  message: string;
}

let debugLogs: DebugLog[] = [];
let logListeners: Array<() => void> = [];

export const addDebugLog = (message: string): void => {
  const timestamp = new Date().toLocaleTimeString();
  debugLogs.push({ timestamp, message });
  if (debugLogs.length > 20) {
    debugLogs = debugLogs.slice(-20);
  }
  logListeners.forEach(listener => listener());
};

export const getDebugLogs = (): DebugLog[] => debugLogs;

export const addLogsListener = (listener: () => void): void => {
  logListeners.push(listener);
};

export const removeLogsListener = (listener: () => void): void => {
  logListeners = logListeners.filter(l => l !== listener);
};

export const clearDebugLogs = (): void => {
  debugLogs = [];
  logListeners.forEach(listener => listener());
};
