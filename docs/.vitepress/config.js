import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'redViewer',
  description: '轻简风漫画阅读器文档',
  lang: 'zh-CN',
  
  head: [
    ['link', { rel: 'icon', href: '/logo.png' }]
  ],

  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: 'CGS', link: 'https://doc.comicguispider.nyc.mn/' },
    ],

    sidebar: [
      {
        text: '开始',
        items: [
          { text: '🚀快速部署', link: '/deploy/' },
          { text: '🍮进阶部署', link: '/deploy/adv' }
        ]
      },
      {
        text: '使用指南',
        items: [
          { text: '🎸功能预览', link: '/guide/' },
          { text: '📁目录结构', link: '/guide/folder' },
          { text: '🔐超管', link: '/guide/admin' }
        ]
      },
      {
        text: 'FAQ',
        items: [
          { text: '❓常见问题', link: '/faq/' }
        ]
      },
      {
        text: '更新',
        items: [
          { text: '📝更新历史', link: '/changelog/' }
        ]
      },
      {
        text: '其他',
        items: [
          { text: '🍼贡献/投喂', link: '/contribute/feed/' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/jasoneri/redViewer' },
      { icon: {
            svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>QQ</title><path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673"/></svg>'
        },
        link: "https://qm.qq.com/q/T2SONVQmiW"
      }
    ],

    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright © 2026 jasoneri'
    },

    search: {
      provider: 'local'
    },

    outline: {
      label: '页面导航',
      level: [2, 3]
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    lastUpdated: {
      text: '最后更新于'
    }
  }
})