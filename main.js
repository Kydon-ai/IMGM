const {
  app,
  BrowserWindow,
  ipcMain,
  ipcRenderer,
  dialog,
  Notification,
} = require("electron");
// // 消息组件
// const { Notification } = require("electron");
// const storage = require("electron-localstorage");
const Store = require("electron-store");
const store = new Store();

const path = require("path");
const fs = require("fs");
const os = require("os");

const platform = getCurrentPlatform();
const DEFAULTFILEPATH = [];
if (platform === "linux") {
  DEFAULTFILEPATH.push(`${getCurrentUserInfo().homedir}/图片`);
} else {
  DEFAULTFILEPATH.push(`C:\\Users\\${getCurrentUserInfo().username}\\Pictures`);
}
// 主界面
let win = null;
// 修改界面的模态框
let modalWindow = null;
// storage.setStoragePath(path.join(__dirname, "test.json"));
const createWindow = () => {
  console.log("开始程序");
  win = new BrowserWindow({
    width: 800,
    height: 710,
    minHeight: 710,
    // maxHeight: 710,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      enableRemoteModule: false,

      // nodeIntegration: false,  // 禁用 Node.js 集成
      nodeIntegration: true, // 不开启沙盒化
      // nodeIntegration: true // 这将允许渲染进程直接使用 require 来加载 Node.js 模块
    },
  });
  // localStorage.setItem("666", 100);
  // console.log("获取内存", localStorage.getItem("666"));

  // store.set("666", 999);
  // console.log("key:666", store.get("666"));

  win.loadFile("index.html");
  console.log("打印对象", win.webContents);
  function sysInfo(msg) {
    let notification = new Notification({
      title: "封装消息",
      body: msg,
    });
    notification.show();
  }

  sysInfo("process start!!!");
  // 检查缓存
  // if (!storage.getItem("page")) {
  // 	storage.setItem("page", 1);
  // }
  // if (!storage.getItem("imgList")) {
  // 	storage.setItem("imgList", []);
  // }
  // if (!storage.getItem("scanPath")) {
  // 	storage.setItem("scanPath", DEFAULTFILEPATH);
  // }
  if (!store.get("page")) {
    store.set("page", 1);
  }
  if (!store.get("imgList")) {
    store.set("imgList", []);
  }
  // 上次扫描的文件路径，String
  if (!store.get("scanPath")) {
    store.set("scanPath", DEFAULTFILEPATH[0]);
  }
  console.log("print all data of store", store.store);
  // IPC注册
  IPCRegister(win);
  win.webContents.openDevTools();
};
// IPC模块
function IPCRegister(win) {
  // 注册win的IPC
  ipcMain.handle("openDirectory", async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "multiSelections"],
      // properties: ["openDirectory"],
    });
    // sysInfo(result);
    if (result.filePaths.length === 0) {
      // console.log('触发默认路径');
      result.filePaths = DEFAULTFILEPATH;
    } else {
      console.log("查看路径", result.filePaths);
    }
    return result?.filePaths;
  });
  ipcMain.handle("scanDir", (event, dirPath) => {
    // console.log("print into path", event, dirPath);
    console.log("print into path", dirPath);
    let imgList = scanImagesInDirectory(dirPath);
    store.set("imgList", imgList);
    return imgList;
  });
  ipcMain.handle("checkDir", (event, dirPath) => {
    // console.log("print check path", event, dirPath);
    console.log("print check path", dirPath);
    return fs.existsSync(dirPath);
  });
  ipcMain.handle("getData", (event, key) => {
    // console.log("print get key", event, key);
    console.log("print get key", key);
    return store.get(key);
  });

  ipcMain.handle("setData", (event, key, data) => {
    // console.log("print set key and data", event, key, data);
    console.log("print set key and data", key, data);
    store.set(key, data);
  });
  // ipcMain.handle('refresh', () => {
  //     console.log('begin refresh');
  //     refreshPage();
  // });
  ipcMain.handle("showInfo", (event, message) => {
    console.log("showInfo:", message);
    // toastr.info(message)
  });

  ipcMain.handle("getUserInfo", (event) => {
    return getCurrentUserInfo();
  });
  ipcMain.on("message", (event, msg) => {
    let notification = new Notification({
      title: "图片检索工具通知",
      body: msg,
    });
    notification.show();
  });
  // 重命名对应文件
  ipcMain.on("rename-file", (event, { oldName, newName }) => {
    const newPath = path.join(path.dirname(oldName), newName);
    fs.rename(oldName, newPath, (err) => {
      if (err) {
        console.error("重命名失败:", err);
        return;
      }
      console.log(`文件重命名为: ${newName}`);
      // 这里可以添加逻辑来更新 imgList
    });
  });
  ipcMain.handle("getAllStore", (event) => {
    return store.store;
  });
  ipcMain.handle("openRenameModel", (event, props) => {
    var msg = createModalWindow(props);
    // console.log("openRenameModelopenRenameModel:", msg);
    return msg;
  });
  ipcMain.on("modalToOther", (event, FILE) => {
    // 更新缓存中的数据，原地更新
    let imgList = store.get("imgList");
    FILE.originPath = convertFileUrlToPath(FILE.originPath);
    console.log(
      "打印imgList",
      FILE
      // imageList
    );
    // for (let i = 0; i < imageList.length; i++) {
    //   console.log("图片:", imageList[i]);
    // }
    for (let i = 0; i < imgList.length; i++) {
      if (imgList[i] == FILE.originPath) {
        console.log("查找到图片", i, imgList[i]);
        var targetList = imgList[i].split("/");
        // console.log("修改后图片", i, targetList);
        targetList[targetList.length - 1] = FILE.changeName;
        imgList[i] = targetList.join("/");
        console.log("修改后图片", i, imgList[i]);
        // console.log("修改后图片", i, targetList.join("/"));
        break;
      }
    }
    store.set("imgList", imgList);
    // 将实际文件改名
    rename(FILE.originPath, FILE.changeName);
    // 调用刷新，取8个图片将图片按照新的url渲染

    // 先不更改，通知win
    win.webContents.send("modalData", FILE);
  });
}
function createModalWindow(props) {
  if (modalWindow) {
    return "新建失败，模态框已存在";
  }

  modalWindow = new BrowserWindow({
    width: 400,
    height: 300,
    parent: win, // 设置父窗口
    modal: true, // 设置为模态窗口
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  modalWindow.loadFile("modal.html");
  // 发送数据到模态窗口
  modalWindow.webContents.on("did-finish-load", () => {
    modalWindow.webContents.openDevTools();
    console.log("发送数据");
    modalWindow.webContents.send("data-from-main", props);
  });
  modalWindow.on("closed", () => {
    console.log("modalWindow销毁");
    modalWindow = null;
  });

  return "新建成功";
}
// 递归遍历文件夹的函数
function traverseDirectory(dirPath, imagesList) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // 如果是文件夹，则递归遍历
      traverseDirectory(fullPath, imagesList);
    } else if (stat.isFile() && isImageFile(file)) {
      // 如果是文件且是图片文件，则添加到列表中
      imagesList.push(fullPath);
    }
  });
}
// 检查文件是否为图片文件的函数
function isImageFile(file) {
  // 图片文件的扩展名
  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    /*, ".gif", ".bmp", ".svg" */
  ];
  const ext = path.extname(file).toLowerCase();
  return imageExtensions.includes(ext);
}

// 主函数
function scanImagesInDirectory(dirPath) {
  let dataList = [];
  traverseDirectory(dirPath, dataList);
  return dataList;
}

// os模块API参考：https://blog.csdn.net/olderandyanger/article/details/134700864
// or see:https://www.nodeapp.cn/os.html
function getCurrentUserInfo() {
  //   console.log("os info:", os.userInfo(), os.version(), os.platform());
  return os.userInfo();
}

function getCurrentPlatform() {
  return os.platform();
}
app.whenReady().then(() => {
  // const userInfo = os.userInfo();  // 获取当前用户信息
  // const username = userInfo.username;  // 提取用户名
  // console.log(`current userName is: ${username}`);
  createWindow();
});
// 只有main.js 可以使用 require 模块 和 Nodejs的API

// 获取纯净的本地路径
function convertFileUrlToPath(fileUrl) {
  // 移除file:///协议头，并将其他部分进行解码
  const path = decodeURIComponent(fileUrl.replace("file://", ""));
  // 根据操作系统不同，可能需要处理路径分隔符
  return path;
}

function rename(oldPath, fileName) {
  const newPath = path.join(path.dirname(oldPath), fileName);
  fs.rename(oldPath, newPath, (err) => {
    if (err) {
      console.error("重命名失败:", err);
      return;
    }
    console.log(`文件重命名为: ${fileName},路径在${newPath}`);
    // 这里可以添加逻辑来更新 imgList
  });
}
