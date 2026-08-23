import assert from "node:assert/strict";
import test from "node:test";
import { detectCategory } from "../ai/category-knowledge";
import { buildMilvusFilter } from "../ai/milvus-image-store";

test("具体类别名称应优先于其他类别的别名", () => {
  assert.equal(detectCategory("帮我找几张纳西妲的头像"), "纳西妲");
});

test("吉伊卡哇类别应扩展为同系列过滤条件", () => {
  const filter = buildMilvusFilter({ shouldSearch: true, query: "吉伊卡哇", category: "吉伊卡哇2" }, "train");
  assert.match(filter || "", /category in \["吉伊卡哇1", "吉伊卡哇2", "吉伊卡哇3"\]/);
  assert.match(filter || "", /split == "train"/);
});

test("布尔和颜色条件应进入过滤表达式", () => {
  const filter = buildMilvusFilter({
    shouldSearch: true,
    query: "透明蓝色动图",
    color: "蓝色",
    animated: true,
    transparent: true,
  });
  assert.equal(filter, 'dominantColor == "蓝色" and animated == true and transparent == true');
});
