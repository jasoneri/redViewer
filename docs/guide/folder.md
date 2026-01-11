# 扫描目录结构

配置路径默认为 `D:\Comic`

CGS (`v2.8.0`) 无感适配，除设置配置路径外可免去阅读此文档。此文档意在提供给如何在已有资源上使用 redViewer 的指导。

::: tip 关键规则说明
- **`_本子`** 目录命名是 `切换同人志` 功能的基础
- **`配置路径/.cgsRule.json`** 是区分配置路径是否需要置换为 cbz 模式的基础，参考命中内容为 `{"downloaded_handle": ".cbz"}`，没有则视为`默认图片模式`
- 子目录可以用命名前置 `_`(下划线) 来规避扫描
:::

## 默认图片模式

```text
.
├── rv過家家
│   ├── 第120话
│   │   ├── 01.jpg
│   │   └── 17.jpg
│   └── 第122话
│       ├── 01.jpg
│       └── 17.jpg
├── rV.db
└── _本子
    ├── [aaa](C110) I am single
    │   ├── 01.jpg
    │   └── 22.jpg
    └── [bbb]I had multi episodes [cgs化組]
        ├── 第2话
        │   ├── 01.jpg
        │   └── 26.jpg
        └── 第3话
            ├── 01.jpg
            └── 30.jpg
```

## `.cbz` 模式

```text
.
├── rv過家家
│   ├── 第157话.cbz
│   └── 第158话.cbz
├── rV.db
└── _本子
    ├── [bbb]I had multi episodes [cgs化組]
    │   ├── 第10话.cbz
    │   ├── 第8话.cbz
    │   └── 第9话.cbz
    └── [aaa](C110) I am single
        └── [aaa](C110) I am single.cbz
```

::: tip 快速整理 CBZ 文件
假如你有一堆无目录的 `.cbz` 想快速整理，可以将 `.cbz` 的目录结构发给 AI，让 AI 仿照 `./_本子/[aaa](C110) I am single` 的结构，生成能批量整理 cbz 可直接运行的 `ps1/bat/bash` 脚本。
:::
