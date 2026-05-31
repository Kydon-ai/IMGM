const { ipcRenderer } = require("electron") as typeof import("electron");
const path = require("path") as typeof import("path");

type RenameFilePayload = {
  originPath: string;
  changeName: string;
  changeFileName: string;
};

let filePayload: RenameFilePayload = {
  originPath: "",
  changeName: "",
  changeFileName: "",
};

document.addEventListener("DOMContentLoaded", () => {
  const dataDisplay = document.getElementById("dataDisplay") as HTMLInputElement | null;
  const dataChange = document.getElementById("dataChange") as HTMLInputElement | null;
  const ensureChange = document.getElementById("ensure-change") as HTMLButtonElement | null;

  if (!dataDisplay || !dataChange || !ensureChange) {
    throw new Error("modal required elements missing");
  }

  ipcRenderer.on("data-from-main", (_event, data: { src: string }) => {
    dataDisplay.value = getRawName(data.src);
    filePayload.originPath = data.src;
  });

  ensureChange.addEventListener("click", () => {
    const filePath = dataChange.value;
    filePayload.changeName = `${getFilePrefix(filePayload.originPath)}${filePath}${getFileSuffix(filePayload.originPath)}`;
    filePayload.changeFileName = `${filePath}${getFileSuffix(filePayload.originPath)}`;
    ipcRenderer.send("modalToOther", filePayload);

    window.close();

    filePayload = {
      originPath: "",
      changeName: "",
      changeFileName: "",
    };
  });
});

function getRawName(filePath: string): string {
  const url = new URL(filePath);
  const pathname = url.pathname.slice(1);
  return path.basename(pathname);
}

function getFileSuffix(fileName: string): string {
  return path.parse(fileName).ext;
}

function getFilePrefix(fileName: string): string {
  const lastSlashIndex = fileName.lastIndexOf("/");
  const prefix = fileName.substring(0, lastSlashIndex + 1);
  return prefix.replace("file:///", "").replace(/\//g, "\\");
}
