import type { AstralPartyData } from "./types";

/*
  这个文件是给 Node.js / 其它项目“直接复制复用”用的纯数据文件。

  目的：让另一个项目在不依赖本仓库 UI / Mithril 的情况下，仍然能：
  - 解析本网站导出的配置 JSON
  - 使用同一份角色/标签/地图/难度/颜色数据进行随机

  设计原则：
  - 只导出 JSON 友好的数据（数字、字符串、数组、对象），避免 TS enum。
  - `colorId` 采用网站的枚举顺序：
      0 RED, 1 YELLOW, 2 BLUE, 3 GREEN, 4 BLACK, 5 WHITE
  - 角色的 `colorIds` 是数组（角色可多色）。
  - 角色的 `tags` 对应网站的 `related`（字符串数组）。

  注意：如果你还要兼容“结果分享字符串（Plan.serialize）”中的 char id，
  则必须保持 chars 数组顺序与网站一致（本文件已按网站顺序导出）。
*/

export const ASTRAL_PARTY_DATA: AstralPartyData = {
  colors: {
    "0": { "name": "红", "code": "#ff6b6b" },
    "1": { "name": "黄", "code": "#ffd166" },
    "2": { "name": "蓝", "code": "#45b7d1" },
    "3": { "name": "绿", "code": "#06d6a0" },
    "4": { "name": "黑", "code": "#000000" },
    "5": { "name": "白", "code": "#cccccc" }
  },
  maps: {
    "1": "幽魂暗巷",
    "2": "龙宫游乐园",
    "3": "魔法学院",
    "4": "水乡古镇",
    "5": "御魂庆典",
    "6": "星趴·梦想号",
    "7": "园林中庭"
  },
  difficulties: {
    "1": "普通",
    "2": "困难",
    "3": "噩梦",
    "4": "疯狂"
  },
  tags: {
    "物理": { "type": 0 },
    "魔法": { "type": 0 },
    "辅助": { "type": 0 },
    "奶辅": { "type": 0 },
    "钱辅": { "type": 0 },
    "功能辅": { "type": 0 },

    "星光": { "type": 1 },
    "标记": { "type": 1 },
    "治愈": { "type": 1 },

    "一期": { "type": 2 },
    "二期": { "type": 2 },
    "三期": { "type": 2 },
    "四期": { "type": 2 },
    "联动": { "type": 2 },

    "0攻": { "type": 3 },
    "1攻": { "type": 3 },
    "2攻": { "type": 3 },

    "0防": { "type": 4 },
    "1防": { "type": 4 },
    "2防": { "type": 4 },
    "4防": { "type": 4 },

    "8血": { "type": 5 },
    "9血": { "type": 5 },
    "10血": { "type": 5 },
    "11血": { "type": 5 },
    "14血": { "type": 5 },

    "2CD": { "type": 6 },
    "3CD": { "type": 6 },
    "4CD": { "type": 6 }
  },
  chars: [
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/1/1c/b7anvun0qgvhfgl1hsab13q1d9tpbrt.png/100px-UT_Hero_RolePhoto_101.png",
      "name": "商业之主:帕露南",
      "colorIds": [0],
      "tags": ["辅助", "钱辅", "一期", "1攻", "2防", "10血", "2CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/6/6b/ewqtgupb3yh1lqt15xasvns3jzqz3ch.png/100px-UT_Hero_RolePhoto_102.png",
      "name": "古怪侦探:芬妮",
      "colorIds": [1],
      "tags": ["辅助", "一期", "1攻", "2防", "10血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/f/f9/t28e8s92vbs0o9jw13t131fir8smrnt.png/100px-UT_Hero_RolePhoto_103.png",
      "name": "社恐修女:阿兰娜",
      "colorIds": [2],
      "tags": ["物理", "一期", "1攻", "1防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/e/ed/2rem4rn3nd33nytcay9hmfijoitsqnv.png/100px-UT_Hero_RolePhoto_104.png",
      "name": "暗影忍者:小町",
      "colorIds": [0],
      "tags": ["魔法", "一期", "1攻", "1防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/d/db/ifb9aoeadn82x0xj9xvxzx7e4xf8tji.png/100px-UT_Hero_RolePhoto_105.png",
      "name": "社员叔叔:派德曼",
      "colorIds": [2],
      "tags": ["物理", "一期", "2攻", "2防", "8血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/b/b3/f9b6lpe82fmaowcffwo7cfvf8lrm4s2.png/100px-UT_Hero_RolePhoto_106.png",
      "name": "猩红辣妹:帕帕拉",
      "colorIds": [4],
      "tags": ["物理", "一期", "2攻", "1防", "10血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/1/14/helmqopw0eryy94qatyostcpjyy4huf.png/100px-UT_Hero_RolePhoto_107.png",
      "name": "游戏大师:恋",
      "colorIds": [2],
      "tags": ["辅助", "功能辅", "一期", "2攻", "1防", "8血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/9/92/bicolawu44dqputgyhz9nrv3didxdfu.png/100px-UT_Hero_RolePhoto_108.png",
      "name": "看板娘:米米",
      "colorIds": [2],
      "tags": ["辅助", "钱辅", "一期", "1攻", "1防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/c/ca/i2is6ho0wlhg4f0sr038iie6wxjh9pl.png/100px-UT_Hero_RolePhoto_109.png",
      "name": "垃圾箱:Z3000",
      "colorIds": [0],
      "tags": ["物理", "一期", "1攻", "2防", "10血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/3/3d/gjzvlepcqnck4xoq2iotr1rekd9n75d.png/100px-UT_Hero_RolePhoto_110.png",
      "name": "肉弹战车:潘大猛",
      "colorIds": [4],
      "tags": ["辅助", "奶辅", "一期", "1攻", "0防", "14血", "4CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/9/9c/gdhhfwmmwx1wkj5qpc1zmrna6hnmikg.png/100px-UT_Hero_RolePhoto_112.png",
      "name": "史莱姆:璐璐",
      "colorIds": [3],
      "tags": ["辅助", "奶辅", "治愈", "一期", "2攻", "2防", "9血", "4CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/e/e3/5ti23lz36kcd5o8ji9k3kkr1vqogvzf.png/100px-UT_Hero_RolePhoto_113.png",
      "name": "旗袍娘:枫",
      "colorIds": [4],
      "tags": ["物理", "一期", "1攻", "0防", "10血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/e/e8/h1sbx184vq5vm9n2qdghael8ewpkauq.png/100px-UT_Hero_RolePhoto_114.png",
      "name": "命运少女:蓝海晴",
      "colorIds": [2],
      "tags": ["辅助", "钱辅", "二期", "1攻", "1防", "10血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/0/0d/dh6fdupcwk7qyj7f47hy3zzgl3d4xt2.png/100px-UT_Hero_RolePhoto_115.png",
      "name": "太刀使:美咲",
      "colorIds": [5],
      "tags": ["物理", "二期", "0攻", "2防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/7/72/1kstcnqxfsc8uigt44ajams17o7tyt0.png/100px-UT_Hero_RolePhoto_116.png",
      "name": "绿洲女王:娜蒂斯",
      "colorIds": [4],
      "tags": ["物理", "二期", "1攻", "1防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/8/8a/3rocf02jljhx6xxiuos0wyh08h8rmu5.png/100px-UT_Hero_RolePhoto_117.png",
      "name": "家政机器人:茉莉",
      "colorIds": [3],
      "tags": ["物理", "二期", "1攻", "1防", "9血", "4CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/0/09/8nzyy5ydl0y9titzavtqe0ortn18d8h.png/100px-UT_Hero_RolePhoto_118.png",
      "name": "暗区少主:阿尔",
      "colorIds": [4],
      "tags": ["辅助", "功能辅", "星光", "二期", "1攻", "1防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/2/2d/dyimj8s9r61ydp0ppszaw5pvaiovaec.png/100px-UT_Hero_RolePhoto_119.png",
      "name": "午夜闪光:星魅琉华",
      "colorIds": [4],
      "tags": ["物理", "二期", "1攻", "1防", "10血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/9/9a/idiolj7h013gbfjo8b8g8illh330bsl.png/100px-UT_Hero_RolePhoto_120.png",
      "name": "网络魅影:南希露",
      "colorIds": [5],
      "tags": ["物理", "二期", "1攻", "1防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/b/bb/p3x082xmurhz4iwv8syu7d6hiq2mtad.png/100px-UT_Hero_RolePhoto_121.png",
      "name": "新人调查员:凛",
      "colorIds": [1],
      "tags": ["魔法", "标记", "三期", "1攻", "1防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/0/02/m7jy1ahjxry6ew0mkf06w800ekq4iqa.png/100px-UT_Hero_RolePhoto_122.png",
      "name": "机械超人:梅加斯",
      "colorIds": [2],
      "tags": ["魔法", "三期", "0攻", "2防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/d/d1/6mx9u3rxlkskk9btpq7ibqku6yudm2j.png/100px-UT_Hero_RolePhoto_123.png",
      "name": "风水师:姬梦朝",
      "colorIds": [4],
      "tags": ["辅助", "奶辅", "功能辅", "三期", "1攻", "1防", "10血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/a/a9/m2oheea4r90byag4x6q0pd5bojx4ru4.png/100px-UT_Hero_RolePhoto_124.png",
      "name": "三神御主:照",
      "colorIds": [0],
      "tags": ["物理", "辅助", "功能辅", "三期", "2攻", "1防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/6/6b/g4lr2ypqj5jkbvzu7yjwd4w2qhfuh5i.png/100px-UT_Hero_RolePhoto_125.png",
      "name": "枪匠:摩西",
      "colorIds": [3],
      "tags": ["物理", "三期", "1攻", "1防", "11血", "2CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/9/93/l7arbgzzlaix4y3e302iy1vmsuyjuxo.png/150px-UT_Hero_RolePhoto_126.png",
      "name": "沼之蛟龙:真梦梓",
      "colorIds": [2],
      "tags": ["物理", "辅助", "三期", "功能辅", "2攻", "1防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/a/a6/snhz2i4i36naaz5i13ihuiunk00t7ev.png/150px-UT_Hero_RolePhoto_127.png",
      "name": "毒苹果:邦妮",
      "colorIds": [5],
      "tags": ["物理", "辅助", "四期", "钱辅", "功能辅", "2攻", "1防", "9血", "3CD"]
    },
    {
      "icon": "https://i.mji.rip/2026/02/05/79e638b142c85eea42367191cdd3e5d3.png",
      "name": "小猎手:墨影",
      "colorIds": [4],
      "tags": ["物理", "2攻", "四期", "1防", "10血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/0/0a/aq1h2scidws8c9lekzpkcofkruyu4no.png/100px-UT_Hero_RolePhoto_301.png",
      "name": "超天酱:超绝最可爱天使酱",
      "colorIds": [5],
      "tags": ["辅助", "钱辅", "星光", "联动", "0攻", "1防", "9血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/c/c4/l7jch9c54yb98coz2op06yd8a9kuuky.png/100px-UT_Hero_RolePhoto_302.png",
      "name": "糖糖:主播女孩",
      "colorIds": [4],
      "tags": ["物理", "联动", "1攻", "4防", "8血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/5/55/9k5sw0zroeh2vjd2bky20pjg7x1h361.png/100px-UT_Hero_RolePhoto_303.png",
      "name": "吉尔:吉尔·斯汀雷",
      "colorIds": [2],
      "tags": ["辅助", "奶辅", "功能辅", "联动", "1攻", "1防", "10血", "3CD"]
    },
    {
      "icon": "https://patchwiki.biligame.com/images/starengine/thumb/b/b8/ltx3ievbibmt4j5f1zsj9iuzqt8q2rq.png/100px-UT_Hero_RolePhoto_304.png",
      "name": "多萝西:多萝西·海兹",
      "colorIds": [0],
      "tags": ["物理", "联动", "1攻", "0防", "8血", "2CD"]
    }
  ]
};
