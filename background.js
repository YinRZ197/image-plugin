/**
 * Service Worker：消息路由、图片列表暂存、跨域拉取并转 PNG、批量下载
 */

/** 当前画廊页 tabId，用于推送下载进度 */
let galleryTabId = null;

/**
 * 序号补零，如 1 -> "001"
 */
function padIndex(n, width = 3) {
  return String(n).padStart(width, '0');
}

/**
 * ArrayBuffer → Base64（Service Worker 中比 FileReader 更稳妥）
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Blob → Data URL（chrome.downloads 可直接使用）
 */
async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  return `data:${blob.type || 'image/png'};base64,${arrayBufferToBase64(buffer)}`;
}

/**
 * 拉取远程图片并转换为 PNG Data URL
 */
async function imageUrlToPngDataUrl(url) {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 不可用');
    ctx.drawImage(bitmap, 0, 0);
    const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
    return await blobToDataUrl(pngBlob);
  } finally {
    bitmap.close?.();
  }
}

/**
 * 向画廊页推送消息（忽略目标已关闭）
 */
function notifyGallery(message) {
  // 扩展页面（gallery.html）通过 runtime.onMessage 接收
  chrome.runtime.sendMessage(message).catch(() => {});
}

/**
 * 批量下载选中图片为 PNG
 */
async function downloadImages(urls) {
  const total = urls.length;
  let success = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const index = i + 1;
    const filename = `商品图_${padIndex(index)}.png`;

    notifyGallery({
      type: 'DOWNLOAD_PROGRESS',
      current: index,
      total,
      filename,
      status: 'downloading',
    });

    try {
      const dataUrl = await imageUrlToPngDataUrl(url);
      await chrome.downloads.download({
        url: dataUrl,
        filename,
        saveAs: false,
        conflictAction: 'uniquify',
      });
      success += 1;
      notifyGallery({
        type: 'DOWNLOAD_PROGRESS',
        current: index,
        total,
        filename,
        status: 'ok',
      });
    } catch (err) {
      failed += 1;
      const msg = err && err.message ? err.message : String(err);
      errors.push({ url, filename, error: msg });
      notifyGallery({
        type: 'DOWNLOAD_PROGRESS',
        current: index,
        total,
        filename,
        status: 'error',
        error: msg,
      });
    }
  }

  const doneMsg = {
    type: 'DOWNLOAD_DONE',
    total,
    success,
    failed,
    errors,
  };
  notifyGallery(doneMsg);
  return doneMsg;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  // Content Script：提取完成，写入 session 并打开画廊
  if (message.type === 'EXTRACT_IMAGES') {
    (async () => {
      try {
        const payload = {
          images: message.images || [],
          pageTitle: message.pageTitle || '',
          pageUrl: message.pageUrl || '',
          savedAt: Date.now(),
        };
        await chrome.storage.session.set({ eipGallery: payload });
        const tab = await chrome.tabs.create({
          url: chrome.runtime.getURL('gallery.html'),
          active: true,
        });
        galleryTabId = tab.id;
        sendResponse({ ok: true, tabId: tab.id });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : String(err),
        });
      }
    })();
    return true; // 异步 sendResponse
  }

  // Gallery：开始批量下载
  if (message.type === 'DOWNLOAD_IMAGES') {
    const urls = Array.isArray(message.urls) ? message.urls : [];
    if (sender.tab && sender.tab.id != null) {
      galleryTabId = sender.tab.id;
    }
    if (!urls.length) {
      sendResponse({ ok: false, error: '未选择图片' });
      return;
    }
    (async () => {
      try {
        const result = await downloadImages(urls);
        sendResponse({ ok: true, result });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : String(err),
        });
      }
    })();
    return true;
  }

  // Gallery：注册自己的 tabId
  if (message.type === 'GALLERY_READY') {
    if (sender.tab && sender.tab.id != null) {
      galleryTabId = sender.tab.id;
    }
    sendResponse({ ok: true });
    return;
  }
});
