'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monitor', {
  platform: process.platform,
  read: () => ipcRenderer.invoke('volume', { operation: 'read' }),
  set: value => ipcRenderer.invoke('volume', { operation: 'set', value }),
  mute: muted => ipcRenderer.invoke('volume', { operation: muted ? 'mute' : 'unmute' }),
  onChanged: callback => ipcRenderer.on('volume-changed', (_event, value) => callback(value)),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  close: () => ipcRenderer.invoke('window-close'),
  getSettings: () => ipcRenderer.invoke('settings-get'),
  setSettings: patch => ipcRenderer.invoke('settings-set', patch),
  onSettingsChanged: callback => ipcRenderer.on('settings-changed', (_event, value) => callback(value)),
  onOpenSettings: callback => ipcRenderer.on('open-settings', () => callback()),
  getAppInfo: () => ipcRenderer.invoke('app-info'),
  openUserData: () => ipcRenderer.invoke('open-user-data'),
  copyToClipboard: text => ipcRenderer.invoke('copy-to-clipboard', text)
});
