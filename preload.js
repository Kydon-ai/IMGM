// 这个脚本用来搭建NodeJS API和electron链接的桥梁
const { contextBridge, ipcRenderer, Notification } = require("electron");
// const storage = require("electron-localstorage");
// 到底是统一再main导入，这里只写ipcRenderer
// 还是将导入的库都放到这里？？
// 我倾向于后者，在main里面使用document会出问题
contextBridge.exposeInMainWorld("electron", {
	openDirectory: () => ipcRenderer.invoke("openDirectory"),
	scanDir: (dirPath) => ipcRenderer.invoke("scanDir", dirPath),
	checkDir: (firPath) => ipcRenderer.invoke("checkDir", firPath),
	getData: (key) => ipcRenderer.invoke("getData", key),
	setData: (key, data) => ipcRenderer.invoke("setData", key, data),
	refresh: () => refreshPage(),
	sendMsg: (msg) => ipcRenderer.send('message',msg),
});

console.log(document.getElementsByTagName("img"));

// 读取缓存中
async function refreshPage() {
	console.log("刷新加载");
	// var imgList = []
	// 获取当前页的图片链接
	let imgList = await ipcRenderer.invoke("getData", "imgList");
	let currentPage = await ipcRenderer.invoke("getData", "page");

	const PAGESIZE = 8;
	let left = PAGESIZE * (currentPage - 1);
	let right = Math.min(left + PAGESIZE, imgList.length);
	let pageOfImages = imgList.slice(left, right);
	if (!pageOfImages || pageOfImages.length === 0) {
		console.log("截取后的pageOfImages为空", pageOfImages);
		return;
	}
	console.log("print pageOfImages", pageOfImages);
	// 获取8个dom，将他们的src改变
	let imgElements = document.getElementsByTagName("img");
	// 遍历img标签
	for (let i = 0; i < imgElements.length; i++) {
		// 检查pageOfImages数组中是否有对应的图片
		if (i < pageOfImages?.length ?? 0) {
			// 如果有，则使用pageOfImages中的图片
			imgElements[i].src = pageOfImages[i];
		} else {
			// 如果没有，则使用默认图片
			imgElements[i].src = "./public/img/404.png";
		}
	}
}
