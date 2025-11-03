import React, { useState, useEffect } from 'react';
import {
  getDebugLogs,
  addLogsListener,
  removeLogsListener,
  clearDebugLogs,
  DebugLog,
} from './debugLogs';

const DebugOverlay: React.FC = () => {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

  useEffect(() => {
    const updateLogs = () => {
      setLogs([...getDebugLogs()]);
    };

    addLogsListener(updateLogs);

    return () => {
      removeLogsListener(updateLogs);
    };
  }, []);

  const copyLogsToClipboard = async () => {
    const logsText = getDebugLogs()
      .map(log => `[${log.timestamp}] ${log.message}`)
      .join('\n');

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(logsText);
        alert('Debug logs copied to clipboard!');
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = logsText;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
          alert('Debug logs copied to clipboard!');
        } else {
          throw new Error('Copy command failed');
        }
      }
    } catch (err) {
      console.error('Copy failed:', err);
      alert(
        'Failed to copy. Please select and copy the text manually or take a screenshot.'
      );
    }
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed top-2 right-2 z-50 bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium shadow-lg"
      >
        Show Debug
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-end">
      <div className="bg-white w-full h-2/3 rounded-t-lg shadow-xl flex flex-col">
        <div className="flex justify-between items-center p-3 border-b">
          <h3 className="font-semibold text-sm">Debug Console</h3>
          <div className="flex gap-2">
            <button
              onClick={copyLogsToClipboard}
              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-600 rounded"
            >
              Copy
            </button>
            <button
              onClick={() => setShowRawText(!showRawText)}
              className="text-xs text-purple-600 hover:text-purple-800 px-2 py-1 border border-purple-600 rounded"
            >
              {showRawText ? 'Pretty' : 'Raw'}
            </button>
            <button
              onClick={() => {
                clearDebugLogs();
                setLogs([]);
              }}
              className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 border rounded"
            >
              Clear
            </button>
            <button
              onClick={() => setIsVisible(false)}
              className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 border rounded"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 text-xs font-mono">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No logs yet</p>
          ) : showRawText ? (
            <textarea
              readOnly
              value={getDebugLogs()
                .map(log => `[${log.timestamp}] ${log.message}`)
                .join('\n')}
              className="w-full h-full p-2 border rounded bg-gray-50 resize-none"
              onClick={e => (e.target as HTMLTextAreaElement).select()}
            />
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="border-b border-gray-100 pb-1">
                  <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                  <span className="text-gray-900">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DebugOverlay;
