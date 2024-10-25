
// 这个脚本用来添加dom
document.addEventListener('DOMContentLoaded', () => {  
    console.log('Script loaded and DOM fully parsed and ready');  
    // alert由来弹窗
    // alert('Hello from external script!');  
    // alert(window.electron)
    
    // 选择文件夹的点击事件
    document.getElementById("select-folder").addEventListener('click',async function() {
        // 这里获得一个path
        let filePath = await window.electron.openDirectory()
        // alert("你点击了")  //白色的浏览器弹窗 
        // alert(filePath)
        document.getElementById('file-path').innerHTML = filePath
    });
    
    // 清空按钮的事件
    document.getElementById("clear-path").addEventListener('click',function() {
        document.getElementById('file-path').innerHTML = ''
    });
    // 扫描对应文件夹
    document.getElementById('start-search').addEventListener('click',async function() {
        // 获取路径
        let filePath = document.getElementById('file-path').innerHTML
        // 判断路径是不是文件？？
        // 可以的话加一个检验路径是否合法
        if (filePath && await window.electron.checkDir(filePath) ) {
            // scanImagesInDirectory(path)
            let imgList = await window.electron.scanDir(filePath);
            // await window.electron.setData('imgList',imgList);
            // alert(imgList)
            // imgList.array.forEach(element => {
            //     console.log(element);
            // });
            for(let i = 0;i<imgList?.length ?? 0 ;i++) {
                console.log(imgList[i]);
            };
            // console.log(imgList);

        }else {
            alert("文件路径为空或者无效");
        }
    });
    // 刷新
    document.getElementById('refresh-pic').addEventListener('click',async function() {
        await window.electron.refresh()
    })
    // 翻页
    document.getElementById('forward').addEventListener('click',async function() {
        let page = await window.electron.getData('page');
        page = Math.max(page-1,1);

        await window.electron.setData('page',page);
        await window.electron.refresh();
        console.log('上一页翻页完毕');
        document.getElementById('page-num').innerHTML = page
    })
    document.getElementById('backward').addEventListener('click',async function() {
        let page = await window.electron.getData('page');
        let MaxPageList = await window.electron.getData('imgList')
        let MaxPage = MaxPageList.length/8 + MaxPageList.length % 8
        page = Math.min(MaxPage,page+1)

        await window.electron.setData('page', page ); // 这里靠refreshPage 方法兜底
        await window.electron.refresh();
        console.log('下一页翻页完毕');
        document.getElementById('page-num').innerHTML = page
    })
    
});
