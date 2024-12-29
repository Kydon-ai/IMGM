// 这个脚本用来搭建NodeJS API和electron链接的桥梁
const { contextBridge, ipcRenderer, Notification } = require("electron");

// 这个样式是写在index.html文件当中，和渲染进程绑在一起，所以需要将他放在预加载脚本，
// 放在main，加载不了样式就会失效
const { Notyf } = require("notyf");
// 仓库地址：https://github.com/caroso1222/notyf?tab=readme-ov-file
// 图标库：https://fonts.google.com/icons

// const storage = require("electron-localstorage");
// 到底是统一再main导入，这里只写ipcRenderer
// 还是将导入的库都放到这里？？
// 我倾向于后者，在main里面使用document会出问题
contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, func) =>
      ipcRenderer.on(channel, (event, ...args) => func(...args)),
  },
  openDirectory: () => ipcRenderer.invoke("openDirectory"),
  scanDir: (dirPath) => ipcRenderer.invoke("scanDir", dirPath),
  checkDir: (firPath) => ipcRenderer.invoke("checkDir", firPath),
  getData: (key) => ipcRenderer.invoke("getData", key),
  setData: (key, data) => {
    console.log("存入数据", key, data);
    ipcRenderer.invoke("setData", key, data);
  },
  refresh: () => {
    refreshPage();
    showMessage("success", "刷新当前浏览");
  },
  sendMsg: (msg) => ipcRenderer.send("message", msg),
  // 单纯进行消息通知
  showMessage: (type, msg) => {
    showMessage(type, msg);
  },
  getUser: () => {
    var userInfo = ipcRenderer.invoke("getUserInfo");
    showMessage("success", `当前用户：${userInfo.usernam}`);
    return userInfo;
  },
  getCache: async () => {
    var store = await ipcRenderer.invoke("getAllStore");
    console.log("getCache:", store);
    return store;
  },
  //  传入数据字典  传回字符串反馈
  openRenameModel: async (datas) => {
    var msg = await ipcRenderer.invoke("openRenameModel", datas);
    console.log("新建改标签窗口情况：", msg);
    return msg;
  },
});

console.log(document.getElementsByTagName("img"));

// 新的消息组件，系统消息组件是写在main
function showMessage(type, msg) {
  notyf = new Notyf({
    duration: 1500, //显示时长(ms)
    position: { x: "center", y: "top" }, // 参见https://carlosroso.com/notyf/
    // dismissible: true ,// 显示关闭按钮
    //  backgroundColor: '#FF5733', // 背景颜色
    // icon: 'check-circle'
    ripple: true, // 启用涟漪
    // 最后还可以使用 types自定义
  });
  if (type === "success") {
    notyf.success(msg);
  } else if (type === "error") {
    notyf.error(msg);
  } else if (type === "warn") {
    notyf.error(msg);
  } else {
    notyf.error("未知消息类型！");
  }
  notyf = null;
}
// 读取缓存中
async function refreshPage() {
  console.log("刷新加载");
  // 获取当前页的图片链接
  let imgList = await ipcRenderer.invoke("getData", "imgList");
  let currentPage = await ipcRenderer.invoke("getData", "page");

  const PAGESIZE = 8;
  pageOfImages = getImageList(imgList, currentPage, PAGESIZE);
  if (pageOfImages === null) return;
  console.log("print pageOfImages", pageOfImages);

  setImgUrl(pageOfImages);
}

// 根据缓存的全部imgList 和 当前页 和 页大小
// 返回一个当前业的图片数组
function getImageList(imgList, currentPage, PAGESIZE) {
  let left = PAGESIZE * (currentPage - 1);
  let right = Math.min(left + PAGESIZE, imgList.length);
  let pageOfImages = imgList.slice(left, right);
  if (!pageOfImages || pageOfImages.length === 0) {
    console.log("截取后的pageOfImages为空", pageOfImages);
    return null;
  }
  return pageOfImages;
}
// 给8张图片赋url
function setImgUrl(pageOfImages) {
  console.log("更新时的数组", pageOfImages);
  // 获取8个dom，将他们的src改变
  let imgElements = document.getElementsByTagName("img");
  let renameElements = document.getElementsByClassName("rename-btn");
  // 遍历img标签
  for (let i = 0; i < imgElements.length; i++) {
    // 检查pageOfImages数组中是否有对应的图片
    if (i < pageOfImages?.length ?? 0) {
      // 如果有，则使用pageOfImages中的图片
      imgElements[i].src = pageOfImages[i];
      renameElements[i].disabled = false;
    } else {
      // 如果没有，则使用默认图片
      imgElements[i].src = "./public/img/404.png";
      renameElements[i].disabled = true;
    }
  }
}
