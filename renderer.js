// 自定义右键菜单
const { remote, clipboard } = require('electron')
const { Menu, MenuItem } = remote
const menu = new Menu()
//添加菜单项
menu.append(
    //如果role为copy，click就不起作用了
    new MenuItem({
        label: '复制',
        type: 'normal',
        role: 'copy', //为菜单项指定了role，就不能使用click自定义解释该行为；而是使用role 提供的原生体验
        accelerator: 'ctrl+c', //绑定快捷键

    })
)
menu.append(
    new MenuItem({
        label: '粘贴',
        accelerator: 'ctrl+v',
        click: function () {
            clipboard.writeText('demo5-ceshi', 'selection')
            console.log(clipboard.readText('selection'))
        }
    })
)
menu.append(
    new MenuItem({
        type: 'separator'
    })
)
menu.append(
    new MenuItem({
        label: '默认',
        type: 'checkbox',
        checked: true
    })
)
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    menu.popup({
        window: remote.getCurrentWindow()
    })
}, false)
