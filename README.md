# 电商图片提取下载插件

在淘宝、天猫、京东、拼多多商品详情页一键提取商品图片，在新标签页中勾选并批量下载为 PNG。

## 安装

1. 打开 Chrome，访问 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目文件夹 `image-plugin`

## 使用

1. 打开淘宝 / 天猫 / 京东 / 拼多多的**商品详情页**
2. 页面右下角出现「获取图片」按钮，点击提取
3. 在新打开的画廊页中勾选需要的图片（支持全选 / 反选）
4. 点击「下载选中」，图片将以 `商品图_001.png` 等形式保存到浏览器默认下载目录

## 支持站点

- 淘宝：`*.taobao.com`、`*.tmall.com`
- 京东：`*.jd.com`
- 拼多多：`*.pinduoduo.com`、`*.yangkeduo.com`

## 技术说明

- Manifest V3
- Content Script 负责按钮与图片扫描
- Service Worker 负责跨域拉取、Canvas 转 PNG、`chrome.downloads` 下载
