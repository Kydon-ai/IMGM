环境配置：
https://blog.csdn.net/C_hawthorn/article/details/136072703
https://blog.csdn.net/qq_38463737/article/details/140277803

参考文章：
https://blog.csdn.net/qq_37779709/article/details/81633502
入门文章：
https://blog.csdn.net/weixin_50216991/article/details/124188494
打包指引：
https://blog.csdn.net/ZYS10000/article/details/134913618

项目说明：
index.html 项目入口文件
main.js 程序代码入口
preload.js 预加载脚本，写 IPC 的
dom.js dom 相关操作

项目指令：
pnpm start 启动项目
npx electron-forge import 导入项目到 Forge
npm run make 打包成可发布版本

问题记录：

1.当主线程需要消耗 CPU 干密集型任务的时候，会导致程序卡顿，想办法解决？？
网上的解决方法貌似是，额外开一个线程，让这个线程去干活
https://zhuanlan.zhihu.com/p/37050595?edition=yidianzixun
2.当前粘贴板API不支持粘贴GIF，如何解决这个问题呢？？？？？
https://developer.mozilla.org/zh-CN/docs/Web/API/Clipboard/write
