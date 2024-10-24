// // 我们需要导入两个electron模块
// const { app, BrowserWindow,dialog } = require("electron");
// const path = require("path");

// console.log("aaaa");
// // 创建一个createWindow()函数，用于将index.html加载到新BrowserWindow实例中
// const createWindow = () => {
// 	console.log("bbbb");
// 	const win = new BrowserWindow({
// 		width: 800,
// 		height: 600,
// 		webPreferences: {
// 			preload: path.join(__dirname, "preload.js"),
// 		},
// 	});
// 	let promise = win.loadFile("index.html");
// 	win.on("close" ,() => {
// 		console.log('cccc');
// 	})
	
// };
//      // 警告框
//     // dialog.showMessageBox({
//     //     type: 'warning',
//     //     title: '警告',
//     //     message: '这是一个警告框。',
//     //     buttons: ['确定']
//     // });
//     //     // 信息框
//     // dialog.showMessageBox({
//     //     type: 'info',
//     //     title: '信息',
//     //     message: '这是一个信息框。',
//     //     buttons: ['确定']
//     // });
// 	// dialog.showOpenDialog({
// 	// 	properties: ['openFile']
// 	// }).then(result => {
// 	// 	console.log(result.filePaths);
// 	// }).catch(err => {
// 	// 	console.log(err);
// 	// });
// // 调用这个createWindow()函数来打开你的窗口
// app.whenReady().then(() => {
// 	createWindow();

// 	// 监听窗口激活的事件
// 	app.on("activate", () => {
// 		if (BrowserWindow.getAllWindows().length === 0) {
// 			createWindow();
// 		}
// 	});
// });

// // 监控窗口全部关闭的事件
// app.on("window-all-closed", () => {
// 	console.log("dddd");
// 	if (process.platform !== "darwin") app.quit();
// });


const { app, BrowserWindow, ipcMain, dialog } = require('electron');
// 消息组件
const { Notification } = require('electron');

const path = require('path');




const createWindow = () => {
    console.log("开始程序")
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false
        },
    });

    win.loadFile('index.html');
    function sysInfo(msg) {
        let notification = new Notification({
                title: '封装消息',
                body: msg
            });
        notification.show()
    }
    
    sysInfo("程序启动")
    ipcMain.handle('openDirectory', async () => {
        const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'multiSelections'] });
        sysInfo(result)
        return result.filePaths;
    });
};

app.whenReady().then(createWindow);
// 只有main.js 可以使用 require 模块 和 Nodejs的API