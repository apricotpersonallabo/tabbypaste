(() => {
  const SUPPORTED_LANGUAGES = ['ja', 'en', 'de', 'es', 'ko', 'zh-CN', 'zh-TW'];
  const STORAGE_KEY = 'tabbyPasteDocsLanguage';
  const pageName = document.body.dataset.page;

  const normalizeLanguage = (language) => {
    const normalized = String(language || '').replace('_', '-');
    const exact = SUPPORTED_LANGUAGES.find(item => item.toLowerCase() === normalized.toLowerCase());
    if (exact) return exact;

    const base = normalized.split('-')[0].toLowerCase();
    return SUPPORTED_LANGUAGES.find(item => item.toLowerCase() === base) || null;
  };

  const readStoredLanguage = () => {
    try {
      return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      return null;
    }
  };

  const browserLanguage = () => {
    for (const language of navigator.languages || [navigator.language]) {
      const supported = normalizeLanguage(language);
      if (supported) return supported;
    }
    return null;
  };

  const queryLanguage = normalizeLanguage(new URLSearchParams(location.search).get('lang'));
  let currentLanguage = queryLanguage || readStoredLanguage() || browserLanguage() || 'en';

  const translate = (key) => {
    const translations = window.TABBY_PASTE_TRANSLATIONS || {};
    return translations[currentLanguage]?.[key] || translations.en?.[key] || '';
  };

  const updateLanguageLinks = () => {
    document.querySelectorAll('a[data-preserve-language]').forEach(link => {
      const url = new URL(link.getAttribute('href'), location.href);
      url.searchParams.set('lang', currentLanguage);
      link.href = `${url.pathname.split('/').pop() || 'index.html'}${url.search}${url.hash}`;
    });
  };

  const updateMetadata = () => {
    const title = translate(`${pageName}.meta.title`);
    const description = translate(`${pageName}.meta.description`);
    if (title) document.title = title;

    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta && description) descriptionMeta.content = description;
  };

  const applyLanguage = () => {
    document.documentElement.lang = currentLanguage;
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const text = translate(element.dataset.i18n);
      if (text) element.textContent = text;
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(element => {
      const text = translate(element.dataset.i18nAlt);
      if (text) element.alt = text;
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
      const text = translate(element.dataset.i18nAriaLabel);
      if (text) element.setAttribute('aria-label', text);
    });

    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) languageSelect.value = currentLanguage;
    updateMetadata();
    updateLanguageLinks();
    document.dispatchEvent(new CustomEvent('tabby:languagechange', {
      detail: { language: currentLanguage, translate }
    }));
  };

  const setLanguage = (language) => {
    const normalized = normalizeLanguage(language);
    if (!normalized) return;
    currentLanguage = normalized;

    try {
      localStorage.setItem(STORAGE_KEY, currentLanguage);
    } catch (_) {
      // The URL remains the durable fallback when storage is unavailable.
    }

    const url = new URL(location.href);
    url.searchParams.set('lang', currentLanguage);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    applyLanguage();
  };

  document.getElementById('languageSelect')?.addEventListener('change', event => {
    setLanguage(event.target.value);
  });

  document.querySelectorAll('[data-current-year]').forEach(element => {
    element.textContent = new Date().getFullYear();
  });

  const dialog = document.getElementById('mediaDialog');
  const dialogImage = document.getElementById('dialogImage');
  const dialogCaption = document.getElementById('dialogCaption');
  const dialogClose = document.getElementById('dialogClose');

  document.querySelectorAll('[data-dialog-image]').forEach(button => {
    button.addEventListener('click', () => {
      if (!dialog || !dialogImage || !dialogCaption) return;
      dialogImage.src = button.dataset.dialogImage;
      dialogImage.alt = button.querySelector('img')?.alt || '';
      dialogCaption.textContent = button.querySelector('[data-dialog-caption]')?.textContent || '';
      dialog.showModal();
    });
  });

  dialogClose?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog?.addEventListener('cancel', event => {
    event.preventDefault();
    dialog.close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dialog?.open) dialog.close();
  });

  window.TabbyPasteDocs = {
    getLanguage: () => currentLanguage,
    setLanguage,
    translate
  };

  applyLanguage();
})();
