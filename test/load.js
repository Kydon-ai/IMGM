// import fs from "path";

const fs = require("fs");
document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("my-button").addEventListener("click", function () {
    console.log("你点击了按钮");
    var name = document.getElementById("text").value;
    console.log("打印内容", name);
    fs.rename("./data/AAA.txt", `./data/${name}.txt`),
      (err) => {
        if (err) {
          console.error("重命名失败:", err);
          return;
        }
        console.log(`文件重命名为: ${newName}`);
        // 这里可以添加逻辑来更新 imgList
      };
  });
});
