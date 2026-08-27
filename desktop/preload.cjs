const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("phoneTwinDesktop", {
  onNetworkInfo(callback) {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("phonetwin-network", listener);
    return () => ipcRenderer.removeListener("phonetwin-network", listener);
  },
});
