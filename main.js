const { app, BrowserWindow, ipcMain, dialog } = require("electron");
// 消息组件
const { Notification } = require("electron");
const storage = require("electron-localstorage");

const path = require("path");
const fs = require("fs");

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
			// nodeIntegration: true // 这将允许渲染进程直接使用 require 来加载 Node.js 模块
		},
	});

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
	if (!storage.getItem("page")) {
		storage.setItem("page", 1);
	}
	if (!storage.getItem("imgList")) {
		storage.setItem("imgList", []);
	}
	if (!storage.getItem("scanPath")) {
		storage.setItem("scanPath", "C:\\Users\\Liu2003\\Pictures");
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
		});
		// sysInfo(result);
		return result.filePaths;
	});
	ipcMain.handle("scanDir", (event, dirPath) => {
		// console.log("print into path", event, dirPath);
		console.log("print into path", dirPath);
		let imgList = scanImagesInDirectory(dirPath);
		storage.setItem("imgList", imgList);
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
		return storage.getItem(key);
	});

	ipcMain.handle("setData", (event, key, data) => {
		// console.log("print set key and data", event, key, data);
		console.log("print set key and data", key, data);
		storage.setItem(key, data);
	});
	// ipcMain.handle('refresh', () => {
	//     console.log('begin refresh');
	//     refreshPage();
	// });
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
