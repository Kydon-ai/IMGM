const {
	app,
	BrowserWindow,
	ipcMain,
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

const DEFAULTFILEPATH = ["C:\\Users\\Liu2003\\Pictures"]
// storage.setStoragePath(path.join(__dirname, "test.json"));
const createWindow = () => {
	console.log("开始程序");
	const win = new BrowserWindow({
		width: 800,
		height: 710,
		minHeight: 710,
		// maxHeight: 710,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			enableRemoteModule: false,

			// nodeIntegration: false,  // 禁用 Node.js 集成
			nodeIntegration: true,  // 不开启沙盒化
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
	// IPC注册
	IPCRegister(win);
};
// IPC模块
function IPCRegister(win) {
	// 注册IPC
	ipcMain.handle("openDirectory", async () => {
		const result = await dialog.showOpenDialog(win, {
			properties: ["openDirectory", "multiSelections"],
			// properties: ["openDirectory"],
		});
		// sysInfo(result);
		if (result.filePaths.length === 0){
			// console.log('触发默认路径');
			result.filePaths = DEFAULTFILEPATH
		} else {
			console.log('查看路径',result.filePaths);
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
		console.log('showInfo:',message);
		// toastr.info(message)
	});

	ipcMain.on("message", (event, msg) => {
		let notification = new Notification({
			title: "图片检索工具通知",
			body: msg,
		});
		notification.show();
	});
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
// 异步遍历文件夹的函数
// async function traverseDirectory(dirPath, imagesList = []) {
//     try {
//         const files = await fs.readdir(dirPath, { withFileTypes: true });

//         for (const file of files) {
//             const fullPath = path.join(dirPath, file.name);

//             if (file.isDirectory()) {
//                 // 如果是文件夹，则递归遍历
//                 await traverseDirectory(fullPath, imagesList);
//             } else if (file.isFile() && isImageFile(file.name)) {
//                 // 如果是文件且是图片文件，则添加到列表中
//                 imagesList.push(fullPath);
//             }
//         }
//     } catch (error) {
//         console.error(`Error reading directory ${dirPath}:`, error);
//     }

//     return imagesList;
// }
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
app.whenReady().then(createWindow);
// 只有main.js 可以使用 require 模块 和 Nodejs的API
