"use strict";
const { contextBridge, ipcRenderer } = require("electron");

// 启动广告页只暴露“跳过”能力，不允许访问文件系统或主应用接口。
contextBridge.exposeInMainWorld("vocflowAd", {
  skip: function() { ipcRenderer.send("startup-ad:skip"); }
});