/**
 * 画廊页：展示提取的图片、勾选、触发批量下载并显示进度
 */

(function () {
  'use strict';

  const gridEl = document.getElementById('grid');
  const emptyEl = document.getElementById('empty');
  const pageMetaEl = document.getElementById('page-meta');
  const selectedCountEl = document.getElementById('selected-count');
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnInvert = document.getElementById('btn-invert');
  const btnDownload = document.getElementById('btn-download');
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const resultToast = document.getElementById('result-toast');

  /** @type {{ url: string, width?: number, height?: number }[]} */
  let images = [];
  let downloading = false;

  function updateSelectedCount() {
    const checks = gridEl.querySelectorAll('.card-check:checked');
    const n = checks.length;
    selectedCountEl.textContent = `已选 ${n}`;
    btnDownload.disabled = downloading || n === 0;
  }

  function showResult(text) {
    resultToast.hidden = false;
    resultToast.textContent = text;
    clearTimeout(showResult._t);
    showResult._t = setTimeout(() => {
      resultToast.hidden = true;
    }, 4000);
  }

  function setProgress(current, total, label) {
    progressBar.hidden = false;
    const pct = total ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = label || `${current} / ${total}（${pct}%）`;
  }

  function hideProgressSoon() {
    setTimeout(() => {
      if (!downloading) progressBar.hidden = true;
    }, 1500);
  }

  /**
   * 渲染网格卡片
   */
  function render() {
    gridEl.innerHTML = '';
    if (!images.length) {
      emptyEl.hidden = false;
      updateSelectedCount();
      return;
    }
    emptyEl.hidden = true;

    images.forEach((item, idx) => {
      const card = document.createElement('article');
      card.className = 'card is-selected';
      card.dataset.url = item.url;

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'card-check';
      check.checked = true;
      check.title = '选择下载';
      check.addEventListener('change', () => {
        card.classList.toggle('is-selected', check.checked);
        updateSelectedCount();
      });

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'thumb-wrap';
      thumbWrap.title = '点击切换选中';
      thumbWrap.addEventListener('click', () => {
        check.checked = !check.checked;
        check.dispatchEvent(new Event('change'));
      });

      const img = document.createElement('img');
      img.alt = `商品图 ${idx + 1}`;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.src = item.url;

      const sizeEl = document.createElement('span');
      sizeEl.className = 'size';
      sizeEl.textContent =
        item.width && item.height ? `${item.width}×${item.height}` : '加载中…';

      img.addEventListener('load', () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        item.width = w;
        item.height = h;
        sizeEl.textContent = `${w}×${h}`;
      });
      img.addEventListener('error', () => {
        sizeEl.textContent = '加载失败';
      });

      thumbWrap.appendChild(img);

      const meta = document.createElement('div');
      meta.className = 'card-meta';
      const indexEl = document.createElement('span');
      indexEl.className = 'index';
      indexEl.textContent = `#${String(idx + 1).padStart(3, '0')}`;
      meta.appendChild(sizeEl);
      meta.appendChild(indexEl);

      card.appendChild(check);
      card.appendChild(thumbWrap);
      card.appendChild(meta);
      gridEl.appendChild(card);
    });

    updateSelectedCount();
  }

  function getSelectedUrls() {
    return Array.from(gridEl.querySelectorAll('.card'))
      .filter((card) => card.querySelector('.card-check')?.checked)
      .map((card) => card.dataset.url);
  }

  btnSelectAll.addEventListener('click', () => {
    gridEl.querySelectorAll('.card-check').forEach((c) => {
      c.checked = true;
      c.closest('.card')?.classList.add('is-selected');
    });
    updateSelectedCount();
  });

  btnInvert.addEventListener('click', () => {
    gridEl.querySelectorAll('.card-check').forEach((c) => {
      c.checked = !c.checked;
      c.closest('.card')?.classList.toggle('is-selected', c.checked);
    });
    updateSelectedCount();
  });

  btnDownload.addEventListener('click', () => {
    const urls = getSelectedUrls();
    if (!urls.length || downloading) return;

    downloading = true;
    btnDownload.disabled = true;
    btnSelectAll.disabled = true;
    btnInvert.disabled = true;
    setProgress(0, urls.length, `准备下载 0 / ${urls.length}`);

    chrome.runtime.sendMessage({ type: 'DOWNLOAD_IMAGES', urls }, (response) => {
      // 进度主要由 onMessage 推送；此处处理整体失败
      if (chrome.runtime.lastError) {
        downloading = false;
        btnSelectAll.disabled = false;
        btnInvert.disabled = false;
        updateSelectedCount();
        showResult('下载失败：' + chrome.runtime.lastError.message);
        hideProgressSoon();
        return;
      }
      if (response && !response.ok) {
        downloading = false;
        btnSelectAll.disabled = false;
        btnInvert.disabled = false;
        updateSelectedCount();
        showResult('下载失败：' + (response.error || '未知错误'));
        hideProgressSoon();
      }
      // 成功时等待 DOWNLOAD_DONE
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;

    if (message.type === 'DOWNLOAD_PROGRESS') {
      const { current, total, filename, status } = message;
      let label = `${current} / ${total}`;
      if (filename) label += ` · ${filename}`;
      if (status === 'error') label += '（失败）';
      setProgress(current, total, label);
    }

    if (message.type === 'DOWNLOAD_DONE') {
      downloading = false;
      btnSelectAll.disabled = false;
      btnInvert.disabled = false;
      updateSelectedCount();
      const { success, failed, total } = message;
      setProgress(total, total, `完成：成功 ${success}，失败 ${failed}`);
      showResult(`下载完成：成功 ${success} 张，失败 ${failed} 张（共 ${total}）`);
      hideProgressSoon();
    }
  });

  async function init() {
    chrome.runtime.sendMessage({ type: 'GALLERY_READY' });

    const data = await chrome.storage.session.get('eipGallery');
    const payload = data.eipGallery;
    if (!payload || !Array.isArray(payload.images)) {
      images = [];
      pageMetaEl.textContent = '';
      render();
      return;
    }

    images = payload.images.map((it) =>
      typeof it === 'string' ? { url: it } : { url: it.url, width: it.width, height: it.height }
    );
    const title = payload.pageTitle || '未命名页面';
    pageMetaEl.textContent = title;
    pageMetaEl.title = payload.pageUrl || title;
    document.title = `商品图片（${images.length}）`;
    render();
  }

  init();
})();
