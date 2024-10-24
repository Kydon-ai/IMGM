// 这个脚本用来搭建NodeJS API和electron链接的桥梁
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    openDirectory: () => ipcRenderer.invoke('openDirectory')
});
