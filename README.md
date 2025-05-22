<div align="center">
    <img width="200px" height="200px" src="https://github.com/theOnlyUnique/IMGM/blob/master/public/img/IMGM-logo.png?raw=true" />
    <div>
        <a href="README.md" target="_blank">中文</a> | <a href="README_EN.md" target="_blank">English</a>
    </div>
   	<br />
    <div>
        <img src="https://img.shields.io/github/stars/theOnlyUnique/IMGM" />
        <img src="https://img.shields.io/github/watchers/theOnlyUnique/cheers_template" />
        <br>
        <img src="https://img.shields.io/badge/卷王:-听说糕手都用这个小工具-blue?style=social" />
        <br>
        <img src="https://img.shields.io/github/discussions/theOnlyUnique/cheers_template?logo=github&label=github%20discussions" alt="Discussion numbers">
        <img src="https://img.shields.io/github/release/theOnlyUnique/cheers_template.svg" alt="Latest release">
    </div>
    <h1 style="margin: 10px">
        <a href="https://github.com/theOnlyUnique/IMGM" target="_blank">IMGM</a>
    </h1>
    <p>通用的桌面图片管理工具</p>
</div>

# 项目初衷 ⛵

现在社交媒体平台越来越多，社交软件除了 QQ 之外，还有微信、抖音、小红书还有一大批平台,每个平台都有自己的表情收藏,如果想在 A 平台用 B 平台的表情,这可能是很难的事情,所以作者就在想,如果可以将自己的表情包收藏到自己本地,然后建立一个图片检索工具,对存储文件的路径进行检索,做到模糊匹配和快速复制的功能,那么我们聊天发表情包将会非常迅速,而且可以不受平台限制.

基于以上设想,该项目应运而生.我把他叫做 IMGM,即图片(IMG)管理器(management).

> PS:本项目代码开源,绝对不会泄露您的个人图片,请您放心使用!虽然目前可能做的很烂,但是我会持续进行优化.

# 项目技术栈 🛠

由于要跨端开发,最终选用`electorn 33.0.2`进行开发,而且不想基于框架进行构建,所以选择了原生 js,跟着官网手撸项目

打包工具使用的是`electron-forge`的脚手架

存储方面,尝试过`electron-localStorage`,但是发现打包后存储会失效,于是采用的`electron-store 8.1.0`,注意一定要用这个版本,如果升级到最新版本,将不能使用 require 引入,将会报错!

弹窗组件使用的是`notyf 3.10.0`,非常轻量级而且美观
开发时 node 版本为 18.18.2，可直接 npm 下载使用

# 本地运行 👉

首先拉取项目

```bash
git clone https://github.com/theOnlyUnique/IMGM.git
```

然后切入到项目

```bash
cd IMGM
```

安装依赖(项目中已设置依赖对应镜像地址)

```bash
npm i
```

如果安装缓慢或者失败,可以,

首先全局安装 cnpm

```bash
npm i cnpm -g
```

然后使用 cnpm 安装依赖

```bash
cnpm i
```

启动项目

```bash
npm run start
```

打包改项目(改步骤已封装好)

```bash
npm run bingo
```

> 如果该指令失败，请直接使用npm run make进行打包

# 项目基础使用 🤓

> PS:首先你需要准备好一些图片素材!!!

进入首页,你会看到如下界面:(理论上啥也没有应该是加载你的用户图片文件夹)

![](https://github.com/theOnlyUnique/IMGM/blob/master/public/img/img1.png?raw=true)

首先点击选择文件夹按钮,选取你存放图片的目标文件夹

![](https://github.com/theOnlyUnique/IMGM/blob/master/public/img/img2.png?raw=true)

选择完毕后扫描路径将显示你刚才选取的路径,然后点击开始搜索,应用将对你所选目录进行扫描,选取所有的图片资源(jpg,jpeg,png,gif 四种类型)

![](https://github.com/theOnlyUnique/IMGM/blob/master/public/img/img3.png?raw=true)

扫描完成后点击确定,然后点击刷新图片即可开始查看目标文件夹下的图片资源了,您可以对他们进行重命名和快速复制

![](https://github.com/theOnlyUnique/IMGM/blob/master/public/img/img4.png?raw=true)

# 参考资料📚

环境配置：<br>
https://blog.csdn.net/C_hawthorn/article/details/136072703<br>
https://blog.csdn.net/qq_38463737/article/details/140277803<br>
参考文章：<br>
https://blog.csdn.net/qq_37779709/article/details/81633502<br>
入门文章：<br>
https://blog.csdn.net/weixin_50216991/article/details/124188494<br>
打包指引：<br>
https://blog.csdn.net/ZYS10000/article/details/134913618<br>

# 项目文件说明🕮

| 序号 |   文件名    |         作用          |
| :--: | :---------: | :-------------------: |
|  1   | index.html  |     项目入口文件      |
|  2   |   main.js   |     程序代码入口      |
|  3   | preload.js  | 预加载脚本，写 IPC 的 |
|  4   |   dom.js    |     dom 相关操作      |
|  5   | renderer.js |       写着玩玩        |

# 项目指令说明🕮

| 序号 |          文件名           |                           作用                            |
| :--: | :-----------------------: | :-------------------------------------------------------: |
|  1   |           npm i           | 下载依赖 如果安装失败，<br>可以尝试全局安装 cnpm 然后安装 |
|  2   |       npm i cnpm -g       |                       全局安装 cnpm                       |
|  3   |         npm start         |                         启动项目                          |
|  4   | npx electron-forge import |                     导入项目到 Forge                      |
|  5   |       npm run make        |                     打包成可发布版本                      |

# 功能预告📢

1.上线标签管理功能<br>
2.UI 美化(基础样式,窗口工具栏调整,窗口行为调整)<br>
3.打包优化<br> 
4.模糊搜索算法优化,深度递归逻辑优化<br> 
5.多平台的测试优化<br>

# 问题记录📝

1.当主线程需要消耗 CPU 干密集型任务的时候，会导致程序卡顿，想办法解决？？<br>

网上的解决方法貌似是，额外开一个线程，让这个线程去干活<br>

https://zhuanlan.zhihu.com/p/37050595?edition=yidianzixun<br>

2.当前粘贴板 API 不支持粘贴 GIF，如何解决这个问题呢？？？？？<br>

https://developer.mozilla.org/zh-CN/docs/Web/API/Clipboard/write<br>

受该[思路](https://deepinout.com/html/html-questions/301_html_javascript_copy_element_to_clipboard_with_all_styles.html#google_vignette)的启发，已解决。
