/**
 * 离线校验：详情页 URL 判定 + srcset/背景图解析（与 content.js 规则对齐）
 */

function isProductDetailPage(hostname, pathname, href) {
  const host = hostname.toLowerCase();
  const path = pathname.toLowerCase();
  const h = href.toLowerCase();

  if (host.includes('taobao.com') || host.includes('tmall.com')) {
    if (
      host.startsWith('item.') ||
      host.startsWith('detail.') ||
      path.includes('/item.') ||
      path.includes('/item.htm') ||
      path.includes('item.htm') ||
      h.includes('id=')
    ) {
      if (path.includes('search') || host.startsWith('s.') || host.startsWith('list.')) {
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

  if (host.includes('jd.com')) {
    if (host.startsWith('item.') || /\/\d+\.html/.test(path)) return true;
    return path.includes('/product/') || path.includes('/item');
  }

  if (host.includes('pinduoduo.com') || host.includes('yangkeduo.com')) {
    return (
      path.includes('goods') ||
      path.includes('item') ||
      h.includes('goods_id=') ||
      h.includes('goods_id%3d')
    );
  }
  return false;
}

function pickFromSrcset(srcset) {
  let bestUrl = null;
  let bestW = -1;
  for (const part of srcset.split(',')) {
    const bits = part.trim().split(/\s+/);
    if (!bits[0]) continue;
    let w = 0;
    if (bits[1]) {
      const m = bits[1].match(/(\d+)w/);
      if (m) w = parseInt(m[1], 10);
    }
    if (w >= bestW) {
      bestW = w;
      bestUrl = bits[0];
    }
  }
  return bestUrl;
}

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

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

assert(
  isProductDetailPage('item.taobao.com', '/item.htm', 'https://item.taobao.com/item.htm?id=1'),
  'taobao item'
);
assert(
  isProductDetailPage('detail.tmall.com', '/item.htm', 'https://detail.tmall.com/item.htm?id=1'),
  'tmall detail'
);
assert(
  !isProductDetailPage('s.taobao.com', '/search', 'https://s.taobao.com/search?q=1'),
  'taobao search excluded'
);
assert(
  isProductDetailPage('item.jd.com', '/100012043978.html', 'https://item.jd.com/100012043978.html'),
  'jd item'
);
assert(
  !isProductDetailPage('www.jd.com', '/', 'https://www.jd.com/'),
  'jd home excluded'
);
assert(
  isProductDetailPage(
    'mobile.yangkeduo.com',
    '/goods.html',
    'https://mobile.yangkeduo.com/goods.html?goods_id=1'
  ),
  'pdd goods'
);
assert(
  pickFromSrcset('a.jpg 100w, b.jpg 800w, c.jpg 400w') === 'b.jpg',
  'srcset max'
);
assert(
  urlsFromBackgroundImage('url("https://cdn.example/a.jpg")')[0] ===
    'https://cdn.example/a.jpg',
  'bg url'
);

console.log('extract-logic.test.mjs: all passed');
