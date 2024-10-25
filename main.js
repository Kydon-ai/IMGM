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
const storage = require('electron-localstorage');

const path = require('path');
const fs = require('fs');  

const createWindow = () => {
    console.log("开始程序")
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
            // nodeIntegration: true // 这将允许渲染进程直接使用 require 来加载 Node.js 模块
        },
    });

    win.loadFile('index.html');
    function sysInfo(msg) {
        let notification = new Notification({
                title: '封装消息',
                body: msg
            });
        notification.show();
    }
    
    sysInfo("程序启动");
    // 检查缓存
    if (!storage.getItem('page')) {
        storage.setItem('page',1);
    }
    if (!storage.getItem('imgList')) {
        storage.setItem('imgList', [] );
    }
    
    // 注册IPC
    ipcMain.handle('openDirectory', async () => {
        const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'multiSelections'] });
        sysInfo(result);
        return result.filePaths;
    });
    ipcMain.handle('scanDir', (event, dirPath) => {
        console.log('print into path',event, dirPath);
        let imgList = scanImagesInDirectory(dirPath);
        storage.setItem('imgList',imgList);
        return imgList;
    });
    ipcMain.handle('checkDir', (event, dirPath) => {
        console.log('print check path',event, dirPath);
        
        return fs.existsSync(dirPath);
    });
    ipcMain.handle('getData', (event, key) => {
        console.log('print get key',event, key);
        return storage.getItem(key);
    });

    ipcMain.handle('setData', (event, key ,data) => {
        console.log('print set key and data',event, key,data);
        storage.setItem(key,data);
    });
    // ipcMain.handle('refresh', () => {
    //     console.log('begin refresh');
    //     refreshPage();
    // });
    
};

// 递归遍历文件夹的函数  
function traverseDirectory(dirPath, imagesList) {  
    const files = fs.readdirSync(dirPath);  
  
    files.forEach(file => {  
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
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg'];  
    const ext = path.extname(file).toLowerCase();  
    return imageExtensions.includes(ext);  
}  
  
// 主函数  
function scanImagesInDirectory(dirPath) {  
    let dataList = []
    traverseDirectory(dirPath, dataList);  
    return dataList;
} 
app.whenReady().then(createWindow);
// 只有main.js 可以使用 require 模块 和 Nodejs的API