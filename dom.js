// 这个脚本用来添加dom
document.addEventListener("DOMContentLoaded", async () => {
	console.log("Script loaded and DOM fully parsed and ready");
	// 初始化图片
	await window.electron.refresh();
	// 加载上次的路径
	let historyPath = await window.electron.getData("scanPath");
	if (historyPath) {
		document.getElementById("file-path").innerHTML = historyPath;
	} else {
		document.getElementById("file-path").innerHTML =
			"C:\\Users\\Liu2003\\Pictures";
	}

	console.log("上次的路径：", historyPath);
	// alert由来弹窗
	// alert('Hello from external script!');
	// alert(window.electron)

	// 选择文件夹的点击事件
	document
		.getElementById("select-folder")
		.addEventListener("click", async function () {
			// 这里获得一个path
			let filePath = await window.electron.openDirectory();
			document.getElementById("file-path").innerHTML = filePath;
            await window.electron.setData("scanPath", filePath);
		});

	// 清空按钮的事件
	document.getElementById("clear-path").addEventListener("click", function () {
		document.getElementById("file-path").innerHTML = "";
	});
	// 扫描对应文件夹
	document
		.getElementById("start-search")
		.addEventListener("click", async function () {
			// 获取路径
			let filePath = document.getElementById("file-path").innerHTML;
			// 判断路径是不是文件？？
			// 可以的话加一个检验路径是否合法
			if (filePath && (await window.electron.checkDir(filePath))) {
				// scanImagesInDirectory(path)
				let imgList = await window.electron.scanDir(filePath);
				// await window.electron.setData('imgList',imgList);
				// alert(imgList)
				// imgList.array.forEach(element => {
				//     console.log(element);
				// });
				for (let i = 0; i < imgList?.length ?? 0; i++) {
					console.log(imgList[i]);
				}
				// console.log(imgList);
			} else {
				alert("文件路径为空或者无效");
			}
		});
	// 刷新
	document
		.getElementById("refresh-pic")
		.addEventListener("click", async function () {
			await window.electron.setData("page", 1);
			document.getElementById("page-num").innerHTML = 1;
			await window.electron.refresh();
		});
	// 翻页
	document
		.getElementById("forward")
		.addEventListener("click", async function () {
			let page = await window.electron.getData("page");
			page = Math.max(page - 1, 1);

			await window.electron.setData("page", page);
			await window.electron.refresh();
			console.log("上一页翻页完毕");
			document.getElementById("page-num").innerHTML = page;
		});
	document
		.getElementById("backward")
		.addEventListener("click", async function () {
			let page = await window.electron.getData("page");
			let MaxPageList = await window.electron.getData("imgList");
			let MaxPage =
				parseInt(MaxPageList.length / 8) + (MaxPageList.length % 8 ? 1 : 0);
			// console.log("打印数值", MaxPageList);
			page = Math.min(MaxPage, page + 1);

			await window.electron.setData("page", page);
			await window.electron.refresh();
			console.log("下一页翻页完毕");
			document.getElementById("page-num").innerHTML = page;
		});
});
