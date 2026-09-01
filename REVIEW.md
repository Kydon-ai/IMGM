# IMGM 项目问题复盘

> 复盘日期：2026-09-01  
> 主题：Electron、Node.js 与 better-sqlite3 原生模块 ABI 不一致

## 结论

问题的根因不是 data/app.db 损坏，也不是 AI 请求本身崩溃，而是同一个原生文件：

~~~text
node_modules/better-sqlite3/build/Release/better_sqlite3.node
~~~

被系统 Node.js 和 Electron 交替编译，导致文件的 ABI 版本和实际加载它的运行时不一致。

当前已经统一为 Electron 运行 SQLite 相关测试、CLI 和 MCP，并在启动前实际探测原生模块是否可加载。当前验证通过：

- Electron：33.0.2
- Electron ABI：130
- SQLite 图片记录：6225
- 测试：9/9 通过

## 两套运行时

| 运行环境 | 版本 | ABI | 用途 |
| --- | --- | ---: | --- |
| 系统 Node.js | 22.20.0 | 127 | npm 本身、普通脚本 |
| Electron | 33.0.2，内置 Node.js | 130 | 正式桌面应用 |

better-sqlite3 包含 C/C++ 原生扩展，不是只由 JavaScript 组成。扩展编译时会绑定 Node ABI，因此按 ABI 127 编译的文件不能直接交给 ABI 130 的 Electron 使用。

## 问题是怎样发生的

### 第一次错误：初始依赖与 Electron 不匹配

项目最初使用了：

~~~json
"better-sqlite3": "^13.0.3"
~~~

依赖安装或普通 npm rebuild 默认使用系统 Node.js，因此原生扩展会按 ABI 127 编译。

正式应用启动时使用 Electron 33，需要 ABI 130。Electron 加载 ABI 127 的扩展时，就会报：

~~~text
NODE_MODULE_VERSION 127
This version of Node.js requires NODE_MODULE_VERSION 130
~~~

### 为什么启动时没报错，点击 AI 才报错

AI 运行时采用了延迟初始化：

~~~text
启动窗口
  ↓
注册 aiAsk IPC
  ↓
用户发送消息
  ↓
创建 SqliteImageStore
  ↓
new Database(...)
  ↓
加载 better_sqlite3.node
~~~

因此窗口可以正常显示，直到第一次发送 AI 消息、真正创建 SQLite 连接时，原生模块才被加载并失败。

### 第二次反复出现：测试覆盖了 Electron 正在使用的文件

旧的测试脚本是：

~~~json
"test": "npm run rebuild:node && npm run build && node --test dist/tests/*.test.js"
~~~

其中的 rebuild:node：

~~~json
"rebuild:node": "npm rebuild better-sqlite3"
~~~

会把原生扩展重新编译为系统 Node ABI 127。

如果 Electron 窗口仍在运行，且 AI 还没有初始化 SQLite，测试结束后再点击 AI，就会出现：

~~~text
Electron 需要 ABI 130
磁盘上的 better_sqlite3.node 已被测试覆盖成 ABI 127
~~~

这就是“刚开始能用，跑着跑着又报错”的直接原因。它不是随机故障，而是开发流程覆盖了共享的原生二进制文件。

## 为什么 Electron Forge 没有完全避免错误

Electron Forge 会显示：

~~~text
Preparing native dependencies
~~~

但这个提示不等于每次都实际重新编译。

Forge 会参考自己的重编译元数据，例如：

~~~text
.forge-meta
x64--130
~~~

普通 npm rebuild 可能替换了 .node 文件，却没有同步更新或删除 Forge 元数据，于是出现：

~~~text
元数据：看起来是 ABI 130
实际文件：可能已经是 ABI 127
~~~

所以只依赖 Forge 的提示不够可靠，必须让真正的 Electron 进程尝试加载原生模块。

## 当前修复方案

### 1. 固定兼容的 better-sqlite3

已固定为：

~~~json
"better-sqlite3": "11.10.0"
~~~

同时更新了 package-lock.json。

### 2. 启动前实际探测

scripts/ensure-electron-native.cjs 会：

1. 使用 Electron 33 加载 better-sqlite3；
2. 加载成功：直接继续，不重新编译；
3. 加载失败：执行 electron-rebuild -f -w better-sqlite3。

启动命令现在是：

~~~json
"start": "npm run build && node scripts/ensure-electron-native.cjs && electron-forge start"
~~~

因此不会每次都强制重新编译，只会在 ABI 不匹配时处理。

### 3. 测试改为使用 Electron

测试不再使用系统 Node.js 的 node --test，而是通过 scripts/run-electron-tests.cjs，在 Electron 33 的 Node 环境中执行测试。

当前测试命令：

~~~json
"test": "node scripts/ensure-electron-native.cjs && npm run build && node scripts/run-electron-tests.cjs"
~~~

这样 SQLite 测试和正式应用使用同一个 Electron ABI，不会再通过 npm rebuild 覆盖原生模块。

### 4. SQLite CLI 和 MCP 也统一使用 Electron

以下脚本通过 scripts/run-electron-node.cjs 在 Electron 33 环境中运行：

- images:import
- eval:retrieval
- mcp

这避免了测试、CLI 和桌面应用分别使用不同 ABI。

## 验证结果

已执行并确认：

~~~bash
npm test
~~~

结果：

~~~text
9 个测试全部通过
~~~

另外使用 Electron 直接打开 data/app.db，查询到：

~~~text
6225 条图片记录
~~~

## 正确使用方式

日常启动：

~~~bash
npm run start
~~~

运行测试：

~~~bash
npm test
~~~

手动强制重编译，仅在明确需要时执行：

~~~bash
npm run rebuild:electron
~~~

不要在 Electron 运行期间执行：

~~~bash
npm rebuild better-sqlite3
~~~

这个命令默认面向系统 Node.js，可能把 Electron 正在使用的原生模块覆盖成 ABI 127。

如果刚执行过 npm install 或其他普通 Node 原生重编译，重新执行 npm run start。启动前的探测脚本会自动恢复 Electron 所需版本。

## 关键提交

| 提交 | 内容 |
| --- | --- |
| beb0735 | 将 better-sqlite3 调整到 Electron 可用版本，并修复模型串行初始化 |
| 84e709d | 启动时加入 Electron 原生模块重编译 |
| 7e5ad1b | 尝试依赖 Electron Forge 的原生依赖准备 |
| 1722c72 | 增加实际加载探测，不匹配时才重编译 |
| 8b3481f | 防止测试流程覆盖 Electron 原生模块 |
| b2bbb36 | 将 SQLite 测试、CLI 和 MCP 统一到 Electron 运行时 |

## 当前工作区说明

本次复盘文件创建时，以下两个文件存在未提交的本地修改，属于已有的界面调整，没有在本次复盘处理中覆盖：

- index.html：注释掉 AI 快捷建议区域
- src/main.ts：窗口高度调整为 658

当前已提交的修复基线为：

~~~text
b2bbb36 test: run sqlite checks in electron runtime
~~~
