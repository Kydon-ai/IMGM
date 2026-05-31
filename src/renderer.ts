const electron = require("electron") as typeof import("electron");
const remote = (electron as unknown as { remote?: any }).remote;
const { clipboard } = electron;

if (remote) {
  const { Menu, MenuItem } = remote;
  const menu = new Menu();

  menu.append(
    new MenuItem({
      label: "复制",
      type: "normal",
      role: "copy",
      accelerator: "ctrl+c",
    })
  );

  menu.append(
    new MenuItem({
      label: "粘贴",
      accelerator: "ctrl+v",
      click: () => {
        clipboard.writeText("demo5-ceshi", "selection");
        console.log(clipboard.readText("selection"));
      },
    })
  );

  menu.append(new MenuItem({ type: "separator" }));

  menu.append(
    new MenuItem({
      label: "默认",
      type: "checkbox",
      checked: true,
    })
  );

  window.addEventListener(
    "contextmenu",
    (e) => {
      e.preventDefault();
      menu.popup({
        window: remote.getCurrentWindow(),
      });
    },
    false
  );
}
