'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monitor', {
  platform: process.platform,
  read: () => ipcRenderer.invoke('volume', { operation: 'read' }),
  set: value => ipcRenderer.invoke('volume', { operation: 'set', value }),
  mute: muted => ipcRenderer.invoke('volume', { operation: muted ? 'mute' : 'unmute' }),
  onChanged: callback => ipcRenderer.on('volume-changed', (_event, value) => callback(value)),
  brightness: {
    read: () => ipcRenderer.invoke('brightness', { operation: 'read' }),
    set: value => ipcRenderer.invoke('brightness', { operation: 'set', value }),
    onChanged: callback => ipcRenderer.on('brightness-changed', (_event, value) => callback(value))
  },
  contrast: {
    read: () => ipcRenderer.invoke('contrast', { operation: 'read' }),
    set: value => ipcRenderer.invoke('contrast', { operation: 'set', value }),
    onChanged: callback => ipcRenderer.on('contrast-changed', (_event, value) => callback(value))
  },
  input: {
    read: () => ipcRenderer.invoke('input', { operation: 'read' }),
    set: value => ipcRenderer.invoke('input', { operation: 'set', value })
  },
  power: {
    read: () => ipcRenderer.invoke('power', { operation: 'read' }),
    standby: () => ipcRenderer.invoke('power', { operation: 'set', value: 4 }),
    on: () => ipcRenderer.invoke('power', { operation: 'set', value: 1 })
  },
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
