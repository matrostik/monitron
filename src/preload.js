'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monitor', {
  read: () => ipcRenderer.invoke('volume', { operation: 'read' }),
  set: value => ipcRenderer.invoke('volume', { operation: 'set', value }),
  mute: muted => ipcRenderer.invoke('volume', { operation: muted ? 'mute' : 'unmute' }),
  onChanged: callback => ipcRenderer.on('volume-changed', (_event, value) => callback(value)),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  close: () => ipcRenderer.invoke('window-close')
});
