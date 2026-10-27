/**
 * 电商图片提取 - Content Script
 * 职责：仅在商品详情页注入悬浮按钮，扫描页面商品图并发送给扩展后台
 */

(function () {
  'use strict';

  /** 最小有效图片尺寸（像素） */
  const MIN_SIZE = 100;

  /** 常见懒加载 / 备用地址属性（兼容淘宝、京东、拼多多差异） */
  const LAZY_ATTRS = [
    'data-src',
    'data-lazy-src',
    'data-original',
    'data-ks-lazyload',
    'data-lazy',
    'data-img',
    'data-url',
    'data-lazyload-src',
    'data-lazy-img',
    'data-src-retina',
    'data-big',
    'data-large',
  ];

  /** 路径中命中则视为图标/占位，过滤掉 */
  const EXCLUDE_KEYWORDS = [
    'icon',
    'logo',
    'sprite',
    'avatar',
    'emoji',
    'loading',
    'placeholder',
    'blank',
    'spacer',
    '1x1',
    'pixel',
    'favicon',
    'badge',
    'btn_',
    'button',
  ];

  /**
   * 判断当前页是否为支持的商品详情页
   */
  function isProductDetailPage() {
    const host = location.hostname.toLowerCase();
    const path = location.pathname.toLowerCase();
    const href = location.href.toLowerCase();

    // 淘宝 / 天猫
    if (host.includes('taobao.com') || host.includes('tmall.com')) {
      if (
        host.startsWith('item.') ||
        host.startsWith('detail.') ||
        path.includes('/item.') ||
        path.includes('/item.htm') ||
        path.includes('item.htm') ||
        href.includes('id=')
      ) {
        // 排除明显非详情（如搜索、店铺首页）
        if (
          path.includes('search') ||
          host.startsWith('s.') ||
          host.startsWith('list.')
        ) {
          return false;
        }
        return (
          path.includes('item') ||
          host.startsWith('item.') ||
          host.startsWith('detail.')
        );
      }
      return false;
    }

    // 京东
    if (host.includes('jd.com')) {
      if (host.startsWith('item.') || /\/\d+\.html/.test(path)) {
        return true;
      }
      return path.includes('/product/') || path.includes('/item');
    }

    // 拼多多 / 多多客
    if (host.includes('pinduoduo.com') || host.includes('yangkeduo.com')) {
      return (
        path.includes('goods') ||
        path.includes('item') ||
        href.includes('goods_id=') ||
        href.includes('goods_id%3d')
      );
    }

    return false;
  }

  /**
   * 将相对地址补全为绝对 URL；非法则返回 null
   */
  function toAbsoluteUrl(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let url = raw.trim().replace(/^["']|["']$/g, '');
    if (!url || url === 'about:blank') return null;
    // 协议相对
    if (url.startsWith('//')) {
      url = location.protocol + url;
    }
    try {
      const abs = new URL(url, location.href).href;
      if (abs.startsWith('data:') || abs.startsWith('blob:')) return null;
      if (!/^https?:/i.test(abs)) return null;
      return abs;
    } catch {
      return null;
    }
  }

  /**
   * 从 srcset 中取宽度最大的候选地址
   */
  function pickFromSrcset(srcset) {
    if (!srcset) return null;
    let bestUrl = null;
    let bestW = -1;
    const parts = srcset.split(',');
    for (const part of parts) {
      const bits = part.trim().split(/\s+/);
      if (!bits[0]) continue;
      const url = bits[0];
      let w = 0;
      if (bits[1]) {
        const m = bits[1].match(/(\d+)w/);
        if (m) w = parseInt(m[1], 10);
        else if (bits[1].endsWith('x')) w = parseFloat(bits[1]) * 1000;
      }
      if (w >= bestW) {
        bestW = w;
        bestUrl = url;
      }
    }
    return bestUrl;
  }

  /**
   * 从 background-image 样式中解析 url(...)
   */
  function urlsFromBackgroundImage(value) {
    if (!value || value === 'none') return [];
    const result = [];
    const re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    let m;
    while ((m = re.exec(value))) {
      if (m[2]) result.push(m[2]);
    }
    return result;
  }

  /**
   * 是否应排除（图标、logo、过小等）
   */
  function shouldExclude(url, width, height) {
    const lower = url.toLowerCase();
    for (const kw of EXCLUDE_KEYWORDS) {
      if (lower.includes(kw)) return true;
    }
    // 已知尺寸过小
    if (
      typeof width === 'number' &&
      typeof height === 'number' &&
      width > 0 &&
      height > 0 &&
      (width < MIN_SIZE || height < MIN_SIZE)
    ) {
      return true;
    }
    return false;
  }

  /**
   * 读取元素上可能的宽高（属性或 natural）
   */
  function getElementSize(el) {
    let w = 0;
    let h = 0;
    if (el.naturalWidth) w = el.naturalWidth;
    if (el.naturalHeight) h = el.naturalHeight;
    if (!w) w = parseInt(el.getAttribute('width'), 10) || 0;
    if (!h) h = parseInt(el.getAttribute('height'), 10) || 0;
    // 展示尺寸作为兜底（懒加载未解码时）
    if (!w || !h) {
      const rect = el.getBoundingClientRect?.();
      if (rect) {
        if (!w && rect.width) w = Math.round(rect.width);
        if (!h && rect.height) h = Math.round(rect.height);
      }
    }
    return { width: w, height: h };
  }

  /**
   * 收集页面内所有候选商品图片 URL
   */
  function extractImages() {
    const found = new Map(); // url -> { url, width, height }

    const add = (raw, width, height) => {
      const url = toAbsoluteUrl(raw);
      if (!url) return;
      if (shouldExclude(url, width, height)) return;
      if (found.has(url)) {
        const prev = found.get(url);
        found.set(url, {
          url,
          width: Math.max(prev.width || 0, width || 0),
          height: Math.max(prev.height || 0, height || 0),
        });
        return;
      }
      found.set(url, { url, width: width || 0, height: height || 0 });
    };

    // 1) <img> 及懒加载属性
    document.querySelectorAll('img').forEach((img) => {
      const { width, height } = getElementSize(img);
      add(img.currentSrc || img.src, width, height);
      add(pickFromSrcset(img.getAttribute('srcset') || img.srcset), width, height);
      for (const attr of LAZY_ATTRS) {
        const v = img.getAttribute(attr);
        if (v) add(v, width, height);
      }
    });

    // 2) <source srcset>
    document.querySelectorAll('source[srcset], picture source').forEach((source) => {
      add(pickFromSrcset(source.getAttribute('srcset')));
    });

    // 3) 带懒加载属性的其它节点（部分平台用 div）
    const lazySelector = LAZY_ATTRS.map((a) => `[${a}]`).join(',');
    document.querySelectorAll(lazySelector).forEach((el) => {
      if (el.tagName === 'IMG') return;
      const { width, height } = getElementSize(el);
      for (const attr of LAZY_ATTRS) {
        const v = el.getAttribute(attr);
        if (
          v &&
          (/^https?:/i.test(v) ||
            v.startsWith('//') ||
            /\.(jpg|jpeg|png|webp|gif|bmp)(\?|$)/i.test(v))
        ) {
          add(v, width, height);
        }
      }
    });

    // 4) 背景图
    const all = document.querySelectorAll('*');
    // 限制扫描量，优先可见商品区域常见标签
    const candidates =
      all.length > 2500
        ? document.querySelectorAll(
            'div, span, a, li, section, figure, i, em, [style*="background"]'
          )
        : all;

    candidates.forEach((el) => {
      let bg = '';
      try {
        bg = getComputedStyle(el).backgroundImage;
      } catch {
        return;
      }
      const urls = urlsFromBackgroundImage(bg);
      if (!urls.length) return;
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      urls.forEach((u) => add(u, w, h));
    });

    // 二次过滤：尺寸已知且过小的去掉；未知尺寸保留（gallery 再测）
    const list = [];
    for (const item of found.values()) {
      if (
        item.width > 0 &&
        item.height > 0 &&
        (item.width < MIN_SIZE || item.height < MIN_SIZE)
      ) {
        continue;
      }
      list.push(item);
    }
    return list;
  }

  /**
   * 短暂提示
   */
  function showToast(text) {
    let toast = document.getElementById('eip-extract-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'eip-extract-toast';
      document.documentElement.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('is-visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2200);
  }

  /**
   * 注入悬浮按钮并绑定点击
   */
  function injectButton() {
    if (document.getElementById('eip-extract-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'eip-extract-btn';
    btn.type = 'button';
    btn.textContent = '获取图片';
    btn.title = '提取当前页商品图片';

    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('is-loading');
      const original = btn.textContent;
      btn.textContent = '提取中…';

      try {
        const images = extractImages();
        if (!images.length) {
          showToast('未找到符合条件的商品图片');
          return;
        }

        chrome.runtime.sendMessage(
          {
            type: 'EXTRACT_IMAGES',
            images,
            pageTitle: document.title || '',
            pageUrl: location.href,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              showToast('扩展通信失败：' + chrome.runtime.lastError.message);
              return;
            }
            if (response && response.ok) {
              showToast(`已提取 ${images.length} 张，正在打开画廊`);
            } else {
              showToast((response && response.error) || '打开画廊失败');
            }
          }
        );
      } catch (err) {
        console.error('[eip] extract failed', err);
        showToast('提取出错：' + (err.message || String(err)));
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.classList.remove('is-loading');
          btn.textContent = original;
        }, 600);
      }
    });

    document.documentElement.appendChild(btn);
  }

  function syncButtonWithPage() {
    const btn = document.getElementById('eip-extract-btn');
    if (isProductDetailPage()) {
      injectButton();
    } else if (btn) {
      btn.remove();
    }
  }

  function init() {
    syncButtonWithPage();
    // 兼容部分站点的前端路由切换
    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        syncButtonWithPage();
      }
    }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
