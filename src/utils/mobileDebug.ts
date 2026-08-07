import { safeStorage } from '@/utils/storage';
/**
 * Mobile Debug Logger
 * Shows console.log messages directly on screen for mobile debugging
 */

let debugOverlay: HTMLDivElement | null = null;
let isEnabled = false;

export const initMobileDebug = () => {
  // Debug overlay só funciona em modo de desenvolvimento para evitar
  // exposição de logs com dados sensíveis em produção.
  if (!import.meta.env.DEV) return;

  const urlParams = new URLSearchParams(window.location.search);
  const debugParam = urlParams.get('debug');
  const debugStorage = safeStorage.getItem('mobile-debug');

  isEnabled = debugParam === 'true' || debugStorage === 'true';

  if (!isEnabled) return;
  
  // Create overlay
  debugOverlay = document.createElement('div');
  debugOverlay.id = 'mobile-debug-overlay';
  debugOverlay.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 40vh;
    background: rgba(0, 0, 0, 0.95);
    color: #00ff00;
    font-family: monospace;
    font-size: 11px;
    padding: 10px;
    overflow-y: auto;
    z-index: 999999;
    border-top: 2px solid #00ff00;
  `;
  
  // Add header with controls
  const header = document.createElement('div');
  header.style.cssText = `
    position: sticky;
    top: 0;
    background: #000;
    padding: 5px;
    margin: -10px -10px 10px -10px;
    border-bottom: 1px solid #00ff00;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  
  const title = document.createElement('span');
  title.textContent = '🔍 Debug Console';
  title.style.fontWeight = 'bold';
  
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.cssText = `
    background: #00ff00;
    color: #000;
    border: none;
    padding: 3px 10px;
    border-radius: 3px;
    font-weight: bold;
    cursor: pointer;
  `;
  clearBtn.onclick = () => {
    const logs = debugOverlay?.querySelector('#debug-logs');
    if (logs) logs.innerHTML = '';
  };
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: #ff0000;
    color: #fff;
    border: none;
    padding: 3px 10px;
    border-radius: 3px;
    font-weight: bold;
    cursor: pointer;
    margin-left: 5px;
  `;
  closeBtn.onclick = () => {
    safeStorage.setItem('mobile-debug', 'false');
    debugOverlay?.remove();
    debugOverlay = null;
    isEnabled = false;
  };
  
  header.appendChild(title);
  const btnGroup = document.createElement('div');
  btnGroup.appendChild(clearBtn);
  btnGroup.appendChild(closeBtn);
  header.appendChild(btnGroup);
  
  debugOverlay.appendChild(header);
  
  // Add logs container
  const logsContainer = document.createElement('div');
  logsContainer.id = 'debug-logs';
  debugOverlay.appendChild(logsContainer);
  
  document.body.appendChild(debugOverlay);
  
  // Intercept console methods
  interceptConsole();
  
  addLog('🚀 Mobile Debug enabled! Logs will appear here.', '#00ff00');
};

const addLog = (message: string, color: string = '#00ff00') => {
  if (!debugOverlay) return;
  
  const logsContainer = debugOverlay.querySelector('#debug-logs');
  if (!logsContainer) return;
  
  const logEntry = document.createElement('div');
  logEntry.style.cssText = `
    padding: 3px 0;
    border-bottom: 1px solid #333;
    color: ${color};
    word-break: break-word;
  `;
  
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  logEntry.textContent = `[${timestamp}] ${message}`;
  
  logsContainer.appendChild(logEntry);
  
  // Auto-scroll to bottom
  debugOverlay.scrollTop = debugOverlay.scrollHeight;
};

const interceptConsole = () => {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.log = function(...args: any[]) {
    originalLog.apply(console, args);
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    addLog(message, '#00ff00');
  };
  
  console.error = function(...args: any[]) {
    originalError.apply(console, args);
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    addLog('❌ ' + message, '#ff0000');
  };
  
  console.warn = function(...args: any[]) {
    originalWarn.apply(console, args);
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    addLog('⚠️ ' + message, '#ffaa00');
  };
};

// Enable debug mode
export const enableDebug = () => {
  safeStorage.setItem('mobile-debug', 'true');
  window.location.reload();
};

// Disable debug mode
export const disableDebug = () => {
  safeStorage.setItem('mobile-debug', 'false');
  if (debugOverlay) {
    debugOverlay.remove();
    debugOverlay = null;
  }
  isEnabled = false;
};
